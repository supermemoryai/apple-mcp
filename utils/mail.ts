import { run } from "@jxa/run";
import { runAppleScript } from "run-applescript";

async function checkMailAccess(): Promise<boolean> {
  try {
    // First check if Mail is running
    const isRunning = await runAppleScript(`
tell application "System Events"
    return application process "Mail" exists
end tell`);

    if (isRunning !== "true") {
      console.error("Mail app is not running, attempting to launch...");
      try {
        await runAppleScript(`
tell application "Mail" to activate
delay 2`);
      } catch (activateError) {
        console.error("Error activating Mail app:", activateError);
        throw new Error(
          "Could not activate Mail app. Please start it manually.",
        );
      }
    }

    // Try to get the count of mailboxes as a simple test
    try {
      await runAppleScript(`
tell application "Mail"
    count every mailbox
end tell`);
      return true;
    } catch (mailboxError) {
      console.error("Error accessing mailboxes:", mailboxError);

      // Try an alternative check
      try {
        const mailVersion = await runAppleScript(`
tell application "Mail"
    return its version
end tell`);
        console.error("Mail version:", mailVersion);
        return true;
      } catch (versionError) {
        console.error("Error getting Mail version:", versionError);
        throw new Error(
          "Mail app is running but cannot access mailboxes. Please check permissions and configuration.",
        );
      }
    }
  } catch (error) {
    console.error("Mail access check failed:", error);
    throw new Error(
      `Cannot access Mail app. Please make sure Mail is running and properly configured. Error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

interface EmailMessage {
  subject: string;
  sender: string;
  dateSent: string;
  content: string;
  isRead: boolean;
  mailbox: string;
}

async function getUnreadMails(limit = 10): Promise<EmailMessage[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    // First, try with AppleScript which might be more reliable for this case
    try {
      const script = `
tell application "Mail"
    set allMailboxes to every mailbox
    set resultList to {}

    repeat with m in allMailboxes
        try
            set unreadMessages to (messages of m whose read status is false)
            if (count of unreadMessages) > 0 then
                set msgLimit to ${limit}
                if (count of unreadMessages) < msgLimit then
                    set msgLimit to (count of unreadMessages)
                end if

                repeat with i from 1 to msgLimit
                    try
                        set currentMsg to item i of unreadMessages
                        set msgData to {subject:(subject of currentMsg), sender:(sender of currentMsg), ¬
                                        date:(date sent of currentMsg) as string, mailbox:(name of m)}

                        try
                            set msgContent to content of currentMsg
                            if length of msgContent > 500 then
                                set msgContent to (text 1 thru 500 of msgContent) & "..."
                            end if
                            set msgData to msgData & {content:msgContent}
                        on error
                            set msgData to msgData & {content:"[Content not available]"}
                        end try

                        set end of resultList to msgData
                    end try
                end repeat

                if (count of resultList) ≥ ${limit} then exit repeat
            end if
        end try
    end repeat

    return resultList
end tell`;

      const asResult = await runAppleScript(script);

      // If we got results, parse them
      if (asResult && asResult.toString().trim().length > 0) {
        try {
          // Try to parse as JSON if the result looks like JSON
          if (asResult.startsWith("{") || asResult.startsWith("[")) {
            const parsedResults = JSON.parse(asResult);
            if (Array.isArray(parsedResults) && parsedResults.length > 0) {
              return parsedResults.map((msg) => ({
                subject: msg.subject || "No subject",
                sender: msg.sender || "Unknown sender",
                dateSent: msg.date || new Date().toString(),
                content: msg.content || "[Content not available]",
                isRead: false, // These are all unread by definition
                mailbox: msg.mailbox || "Unknown mailbox",
              }));
            }
          }

          // If it's not in JSON format, try to parse the plist/record format
          const parsedEmails: EmailMessage[] = [];

          // Very simple parsing for the record format that AppleScript might return
          // This is a best-effort attempt and might not be perfect
          const matches = asResult.match(/\{([^}]+)\}/g);
          if (matches && matches.length > 0) {
            for (const match of matches) {
              try {
                // Parse key-value pairs
                const props = match.substring(1, match.length - 1).split(",");
                const emailData: { [key: string]: string } = {};

                for (const prop of props) {
                  const parts = prop.split(":");
                  if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const value = parts.slice(1).join(":").trim();
                    emailData[key] = value;
                  }
                }

                if (emailData.subject || emailData.sender) {
                  parsedEmails.push({
                    subject: emailData.subject || "No subject",
                    sender: emailData.sender || "Unknown sender",
                    dateSent: emailData.date || new Date().toString(),
                    content: emailData.content || "[Content not available]",
                    isRead: false,
                    mailbox: emailData.mailbox || "Unknown mailbox",
                  });
                }
              } catch (parseError) {
                console.error("Error parsing email match:", parseError);
              }
            }
          }

          if (parsedEmails.length > 0) {
            return parsedEmails;
          }
        } catch (parseError) {
          console.error("Error parsing AppleScript result:", parseError);
          // If parsing failed, continue to the JXA approach
        }
      }

      // If the raw result contains useful info but parsing failed
      if (
        asResult.includes("subject") &&
        asResult.includes("sender")
      ) {
        console.error("Returning raw AppleScript result for debugging");
        return [
          {
            subject: "Raw AppleScript Output",
            sender: "Mail System",
            dateSent: new Date().toString(),
            content: `Could not parse Mail data properly. Raw output: ${asResult}`,
            isRead: false,
            mailbox: "Debug",
          },
        ];
      }
    } catch (asError) {
      // Continue to JXA approach as fallback
    }

    console.error("Trying JXA approach for unread emails...");
    // Check Mail accounts as a different approach
    const accounts = await runAppleScript(`
tell application "Mail"
    set accts to {}
    repeat with a in accounts
        set end of accts to name of a
    end repeat
    return accts
end tell`);
    console.error("Available accounts:", accounts);

    // Try using direct AppleScript to check for unread messages across all accounts
    const unreadInfo = await runAppleScript(`
tell application "Mail"
    set unreadInfo to {}
    repeat with m in every mailbox
        try
            set unreadCount to count (messages of m whose read status is false)
            if unreadCount > 0 then
                set end of unreadInfo to {name of m, unreadCount}
            end if
        end try
    end repeat
    return unreadInfo
end tell`);
    console.error("Mailboxes with unread messages:", unreadInfo);

    // Fallback to JXA approach
    const unreadMails: EmailMessage[] = await run((limit: number) => {
      const Mail = Application("Mail");
      const results = [];

      try {
        const accounts = Mail.accounts();

        for (const account of accounts) {
          try {
            const accountName = account.name();
            try {
              const accountMailboxes = account.mailboxes();

              for (const mailbox of accountMailboxes) {
                try {
                  const boxName = mailbox.name();

                  // biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
                  let unreadMessages;
                  try {
                    unreadMessages = mailbox.messages.whose({
                      readStatus: false,
                    })();

                    const count = Math.min(
                      unreadMessages.length,
                      limit - results.length,
                    );
                    for (let i = 0; i < count; i++) {
                      try {
                        const msg = unreadMessages[i];
                        results.push({
                          subject: msg.subject(),
                          sender: msg.sender(),
                          dateSent: msg.dateSent().toString(),
                          content: msg.content()
                            ? msg.content().substring(0, 500)
                            : "[No content]",
                          isRead: false,
                          mailbox: `${accountName} - ${boxName}`,
                        });
                      } catch (msgError) {}
                    }
                  } catch (unreadError) {}
                } catch (boxError) {}

                if (results.length >= limit) {
                  break;
                }
              }
            } catch (mbError) {}

            if (results.length >= limit) {
              break;
            }
          } catch (accError) {}
        }
      } catch (error) {}

      return results;
    }, limit);

    return unreadMails;
  } catch (error) {
    console.error("Error in getUnreadMails:", error);
    throw new Error(
      `Error accessing mail: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function searchMails(
  searchTerm: string,
  accountName?: string,
  mailboxName?: string,
  fromDate?: string, // Added fromDate
  toDate?: string,   // Added toDate
  limit = 10,
): Promise<EmailMessage[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    // Ensure Mail app is running
    await runAppleScript(`
if application "Mail" is not running then
    tell application "Mail" to activate
    delay 2
end if`);

    // First try the AppleScript approach which might be more reliable
    try {
      // Escape inputs
      const escapedSearchTerm = searchTerm.replace(/"/g, '\\"');
      const escapedAccount = accountName?.replace(/"/g, '\\"');
      const escapedMailbox = mailboxName?.replace(/"/g, '\\"');

      const script = `
    tell application "Mail"
        set searchString to "${escapedSearchTerm}"
        set foundMsgs to {}

        -- Determine mailboxes to search
        set mailboxesToSearch to {}
        if "${escapedAccount}" is not "" then
            try
                set targetAccount to first account whose name is "${escapedAccount}"
                if "${escapedMailbox}" is not "" then
                    try
                        set mailboxesToSearch to {mailbox "${escapedMailbox}" of targetAccount}
                    on error
                         -- Mailbox not found in account
                    end try
                else
                    set mailboxesToSearch to mailboxes of targetAccount
                end if
            on error
                -- Account not found
            end try
        else if "${escapedMailbox}" is not "" then
             -- Search all accounts for this mailbox name
             try
                 set mailboxesToSearch to every mailbox whose name is "${escapedMailbox}"
             on error
                 -- Mailbox name not found anywhere
             end try
        else
            -- No account or mailbox specified, search all
            set mailboxesToSearch to every mailbox
        end if

        if (count of mailboxesToSearch) is 0 then return {} end if

        -- Collect messages matching search term
        repeat with currentBox in mailboxesToSearch
            try
                -- Apply search term filter. If searchString is empty, search for a space instead.
                set effectiveSearchString to searchString
                if effectiveSearchString is "" then set effectiveSearchString to " "
                
                set boxMsgs to (messages of currentBox whose (subject contains effectiveSearchString) or (content contains effectiveSearchString) or (sender contains effectiveSearchString))
                set foundMsgs to foundMsgs & boxMsgs
                -- Optimization: Stop searching mailboxes if we already have enough potential candidates (e.g., limit * 2)
                -- This avoids processing huge mailboxes unnecessarily if the limit is small.
                if (count of foundMsgs) > (${limit} * 2) then exit repeat
            on error
                -- Ignore errors searching within a specific mailbox
            end try
        end repeat

        -- Sort found messages by date descending (best effort)
        -- AppleScript sorting can be complex, especially with large lists. This is a basic attempt.
        -- Consider sorting in TypeScript if this is unreliable.
        try
             tell application "System Events" to set foundMsgs to sort foundMsgs by date sent
        on error
             -- Sorting failed, proceed with unsorted list
        end try

        -- Extract details from the top 'limit' messages
        set resultList to {}
        set msgCount to (count of foundMsgs)
        if msgCount > ${limit} then set msgCount to ${limit}

        repeat with i from 1 to msgCount
            try
                set currentMsg to item i of foundMsgs
                
                -- Initialize with defaults
                set msgSubject to "[No Subject]"
                set msgSender to "[Unknown Sender]"
                set msgDateString to ""
                set msgReadStatus to false
                set msgContent to "[No Content]"
                set boxName to "[Unknown Mailbox]"
                set accName to "[Unknown Account]"

                -- Get properties with individual error handling
                try
                    set msgSubject to subject of currentMsg
                    if msgSubject is missing value then set msgSubject to "[No Subject]"
                end try
                try
                    set msgSender to sender of currentMsg
                    if msgSender is missing value then set msgSender to "[Unknown Sender]"
                end try
                try
                    set msgDate to date sent of currentMsg
                    set msgDateString to msgDate as string
                end try
                try
                    set msgReadStatus to read status of currentMsg
                end try
                try
                    set boxName to name of (mailbox of currentMsg)
                end try
                 try
                    set accName to name of (account of mailbox of currentMsg)
                end try
                try
                    set msgContent to content of currentMsg
                    if length of msgContent > 500 then
                        set msgContent to (text 1 thru 500 of msgContent) & "..."
                    end if
                on error
                    set msgContent to "[Error getting content]"
                end try

                set msgInfo to {subject:msgSubject, sender:msgSender, dateSent:msgDateString, content:msgContent, isRead:msgReadStatus, mailbox:(accName & " - " & boxName)}
                set end of resultList to msgInfo
            on error
                -- Ignore errors processing a single message's details
            end try
        end repeat

        return resultList
    end tell`;

      const asResult = await runAppleScript(script);

      // If we got results, parse them
      if (asResult && asResult.length > 0) {
        try {
          const parsedResults = JSON.parse(asResult);
          if (Array.isArray(parsedResults) && parsedResults.length > 0) {
            return parsedResults.map((msg) => ({
              subject: msg.subject || "No subject",
              sender: msg.sender || "Unknown sender",
              dateSent: msg.date || new Date().toString(),
              content: msg.content || "[Content not available]", // Use content from parsed result
              isRead: msg.isRead || false,
              mailbox: msg.mailbox || "Unknown mailbox", // Use mailbox key from parsed result
            }));
          }
        } catch (parseError) {
          console.error("Error parsing AppleScript result:", parseError);
          // Continue to JXA approach if parsing fails
        }
      }
    } catch (asError) {
      // Continue to JXA approach
    }

    // JXA approach as fallback (Re-enabled and updated)
    console.error("AppleScript failed or returned no results, trying JXA fallback...");
    const searchResults: EmailMessage[] = await run(
      (searchTerm: string, accountName: string | undefined, mailboxName: string | undefined, fromDateStr: string | undefined, toDateStr: string | undefined, limit: number) => {
        const Mail = Application("Mail");
        Mail.includeStandardAdditions = true; // Needed for potential dialogs/logging
        const results: { // Use intermediate type for easier sorting
            subject: string;
            sender: string;
            dateSent: Date; // Keep as Date object for sorting
            content: string;
            isRead: boolean;
            mailbox: string;
        }[] = [];

        try {
          // Parse date strings into Date objects
          let startDate: Date | null = null;
          let endDate: Date | null = null;
          if (fromDateStr) {
              try { startDate = new Date(fromDateStr); } catch (e) { console.log("JXA: Invalid fromDate format"); }
          }
          if (toDateStr) {
              try { endDate = new Date(toDateStr); } catch (e) { console.log("JXA: Invalid toDate format"); }
              // If endDate is provided, often we want to include the whole day
              if (endDate && !toDateStr.includes('T')) { // If no time part, set to end of day
                  endDate.setHours(23, 59, 59, 999);
              }
          }
          let mailboxesToSearch: any[] = [];

          // Determine mailboxes to search based on account/mailbox name
          if (accountName) {
            const account = Mail.accounts.whose({ name: accountName })[0];
            if (account) {
              if (mailboxName) {
                 const mailbox = account.mailboxes.whose({ name: mailboxName })[0];
                 if (mailbox) {
                   mailboxesToSearch = [mailbox];
                 }
              } else {
                mailboxesToSearch = account.mailboxes();
              }
            }
          } else if (mailboxName) {
             // Search all accounts if only mailbox name is given
             mailboxesToSearch = Mail.mailboxes.whose({ name: mailboxName })();
          } else {
            // No account or mailbox specified, search all
            mailboxesToSearch = Mail.mailboxes();
          }

          if (!mailboxesToSearch || mailboxesToSearch.length === 0) {
             console.log("JXA: No mailboxes found to search.");
             return []; // Return empty array, not EmailMessage[] yet
          }
          
          // console.log(`JXA: Found ${mailboxesToSearch.length} mailboxes to search.`);

          // Process messages and add to results incrementally, stopping when limit is reached
          outerLoop: for (const mailbox of mailboxesToSearch) {
            try {
              let query: any = null;
              // Build the 'whose' query based on searchTerm
              if (searchTerm && searchTerm.trim() !== "") {
                 query = {
                   _or: [
                     { subject: { _contains: searchTerm } },
                     { content: { _contains: searchTerm } },
                     { sender: { _contains: searchTerm } },
                   ],
                 };
              }

              let messages;
              if (query) {
                 messages = mailbox.messages.whose(query)();
              } else {
                 messages = mailbox.messages();
              }
              
              if (!messages || messages.length === 0) {
                 continue; // Skip to next mailbox if no messages found
              }

              // Iterate through messages in this mailbox
              for (const msg of messages) {
                 if (!msg) continue; // Skip if message is null/undefined

                 try {
                    const dateSent = msg.dateSent();
                    // Date filtering: Check if the message date is within the range
                    if (dateSent instanceof Date) {
                        if (startDate && dateSent < startDate) continue; // Skip if before start date
                        if (endDate && dateSent > endDate) continue;   // Skip if after end date
                    } else {
                        continue; // Skip if date is invalid
                    }

                    // If date is in range (or no range specified), extract other details
                    const mailBoxName = msg.mailbox.name() || "[Unknown Mailbox]";
                    const accountNameResult = msg.mailbox.account.name() || "[Unknown Account]";
                    
                    results.push({
                        subject: msg.subject() || "[No Subject]",
                        sender: msg.sender() || "[Unknown Sender]",
                        dateSent: dateSent, // Keep as Date object for now
                        content: msg.content() ? msg.content().substring(0, 500) : "[No Content]",
                        isRead: msg.readStatus(),
                        mailbox: `${accountNameResult} - ${mailBoxName}`,
                    });

                    // Check if limit is reached
                    if (results.length >= limit) {
                        // console.log(`JXA: Limit of ${limit} reached. Stopping search.`);
                        break outerLoop; // Break out of both loops
                    }
                 } catch (msgError: any) {
                    // console.log(`JXA: Error processing individual message: ${msgError.message}`);
                 }
              } // End inner message loop
              
            } catch (queryError: any) {
               // console.log(`JXA: Error querying mailbox ${mailbox.name()}: ${queryError.message}`);
            }
          } // End outer mailbox loop (outerLoop)

          // Sort the final results array (which is already limited) by date
          try {
             // Add type annotation for sort parameters
             results.sort((a: {dateSent: Date}, b: {dateSent: Date}) => b.dateSent.getTime() - a.dateSent.getTime());
             // console.log("JXA: Sorting completed.");
          } catch (sortError: any) {
             // console.log(`JXA: Error sorting results: ${sortError.message}.`);
          }
          
        } catch (error: any) {
           // console.log(`JXA: Top-level error: ${error.message}`);
        }

        // console.log(`JXA: Returning ${results.length} processed messages.`);
        // Convert Date objects to ISO strings before returning
        return results.map(r => ({ ...r, dateSent: r.dateSent.toISOString() }));
      },
      searchTerm,
      accountName,
      mailboxName,
      fromDate, // Pass fromDate
      toDate,   // Pass toDate
      limit,
    );

    return searchResults; // Return results from JXA
  } catch (error) {
    console.error("Error in searchMails:", error);
    throw new Error(
      `Error searching mail: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function sendMail(
  to: string,
  subject: string,
  body: string,
  cc?: string,
  bcc?: string,
): Promise<string | undefined> {
  try {
    if (!(await checkMailAccess())) {
      throw new Error("Could not access Mail app");
    }

    // Ensure Mail app is running
    await runAppleScript(`
if application "Mail" is not running then
    tell application "Mail" to activate
    delay 2
end if`);

    // Escape special characters in strings for AppleScript
    const escapedTo = to.replace(/"/g, '\\"');
    const escapedSubject = subject.replace(/"/g, '\\"');
    const escapedBody = body.replace(/"/g, '\\"');
    const escapedCc = cc ? cc.replace(/"/g, '\\"') : "";
    const escapedBcc = bcc ? bcc.replace(/"/g, '\\"') : "";

    let script = `
tell application "Mail"
    set newMessage to make new outgoing message with properties {subject:"${escapedSubject}", content:"${escapedBody}", visible:true}
    tell newMessage
        make new to recipient with properties {address:"${escapedTo}"}
`;

    if (cc) {
      script += `        make new cc recipient with properties {address:"${escapedCc}"}\n`;
    }

    if (bcc) {
      script += `        make new bcc recipient with properties {address:"${escapedBcc}"}\n`;
    }

    script += `    end tell
    send newMessage
    return "success"
end tell
`;

    try {
      const result = await runAppleScript(script);
      if (result === "success") {
        return `Email sent to ${to} with subject "${subject}"`;
      // biome-ignore lint/style/noUselessElse: <explanation>
      } else {
      }
    } catch (asError) {
      console.error("Error in AppleScript send:", asError);

      const jxaResult: string = await run(
        (to, subject, body, cc, bcc) => {
          try {
            const Mail = Application("Mail");

            const msg = Mail.OutgoingMessage().make();
            msg.subject = subject;
            msg.content = body;
            msg.visible = true;

            // Add recipients
            const toRecipient = Mail.ToRecipient().make();
            toRecipient.address = to;
            msg.toRecipients.push(toRecipient);

            if (cc) {
              const ccRecipient = Mail.CcRecipient().make();
              ccRecipient.address = cc;
              msg.ccRecipients.push(ccRecipient);
            }

            if (bcc) {
              const bccRecipient = Mail.BccRecipient().make();
              bccRecipient.address = bcc;
              msg.bccRecipients.push(bccRecipient);
            }

            msg.send();
            return "JXA send completed";
          } catch (error) {
            return `JXA error: ${error}`;
          }
        },
        to,
        subject,
        body,
        cc,
        bcc,
      );

      if (jxaResult.startsWith("JXA error:")) {
        throw new Error(jxaResult);
      }

      return `Email sent to ${to} with subject "${subject}"`;
    }
  } catch (error) {
    console.error("Error in sendMail:", error);
    throw new Error(
      `Error sending mail: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function getMailboxes(): Promise<string[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    // Ensure Mail app is running
    await runAppleScript(`
if application "Mail" is not running then
    tell application "Mail" to activate
    delay 2
end if`);

    const mailboxes: string[] = await run(() => {
      const Mail = Application("Mail");

      try {
        const mailboxes = Mail.mailboxes();

        if (!mailboxes || mailboxes.length === 0) {
          try {
            const result = Mail.execute({
              withObjectModel: "Mail Suite",
              withCommand: "get name of every mailbox",
            });

            if (result && result.length > 0) {
              return result;
            }
          } catch (execError) {}

          return [];
        }

        return mailboxes.map((box: unknown) => {
          try {
            return (box as { name: () => string }).name();
          } catch (nameError) {
            return "Unknown mailbox";
          }
        });
      } catch (error) {
        return [];
      }
    });

    return mailboxes;
  } catch (error) {
    console.error("Error in getMailboxes:", error);
    throw new Error(
      `Error getting mailboxes: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function getAccounts(): Promise<string[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    const accounts = await runAppleScript(`
tell application "Mail"
    set acctNames to {}
    repeat with a in accounts
        set end of acctNames to name of a
    end repeat
    return acctNames
end tell`);

    return accounts ? accounts.split(", ") : [];
  } catch (error) {
    console.error("Error getting accounts:", error);
    throw new Error(
      `Error getting mail accounts: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function getMailboxesForAccount(accountName: string): Promise<string[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    const mailboxes = await runAppleScript(`
tell application "Mail"
    set boxNames to {}
    try
        set targetAccount to first account whose name is "${accountName.replace(/"/g, '\\"')}"
        set acctMailboxes to every mailbox of targetAccount
        repeat with mb in acctMailboxes
            set end of boxNames to name of mb
        end repeat
    on error errMsg
        return "Error: " & errMsg
    end try
    return boxNames
end tell`);

    if (mailboxes?.startsWith("Error:")) {
      console.error(mailboxes);
      return [];
    }

    return mailboxes ? mailboxes.split(", ") : [];
  } catch (error) {
    console.error("Error getting mailboxes for account:", error);
    throw new Error(
      `Error getting mailboxes for account ${accountName}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
// Removed getLatestMails function


export default {
  getUnreadMails,
  searchMails,
  sendMail,
  getMailboxes,
  getAccounts,
  getMailboxesForAccount,
  // Removed getLatestMails from export
};
