import { runAppleScript } from "run-applescript";

// Configuration
const CONFIG = {
	// Maximum emails to process (to avoid performance issues)
	MAX_EMAILS: 20,
	// Maximum content length for previews
	MAX_CONTENT_PREVIEW: 300,
	// Timeout for operations
	TIMEOUT_MS: 10000,
};

interface EmailMessage {
	subject: string;
	sender: string;
	dateSent: string;
	content: string;
	isRead: boolean;
	mailbox: string;
}

/**
 * Check if Mail app is accessible by trying to access actual mailboxes
 */
async function checkMailAccess(): Promise<boolean> {
	try {
		const script = `
tell application "Mail"
    try
        -- Actually try to access mailboxes to test real permissions
        set mailboxCount to count of mailboxes
        return mailboxCount as string
    on error errMsg
        error "Mail access denied: " & errMsg
    end try
end tell`;

		const result = await runAppleScript(script);
		// If we got a number back, we have access
		return !isNaN(Number(result)) && Number(result) >= 0;
	} catch (error) {
		console.error(
			`Cannot access Mail app: ${error instanceof Error ? error.message : String(error)}`,
		);
		return false;
	}
}

/**
 * Request Mail app access and trigger permission dialog if needed
 */
async function requestMailAccess(): Promise<{ hasAccess: boolean; message: string }> {
	try {
		// First try to trigger the permission dialog by attempting to access Mail
		const script = `
tell application "Mail"
    try
        -- This will trigger the permission dialog if not already granted
        activate
        set mailboxCount to count of mailboxes
        return "SUCCESS:" & mailboxCount
    on error errMsg
        return "ERROR:" & errMsg
    end try
end tell`;

		const result = await runAppleScript(script);

		if (result.startsWith("SUCCESS:")) {
			const mailboxCount = Number(result.replace("SUCCESS:", ""));
			if (mailboxCount > 0) {
				return {
					hasAccess: true,
					message: `Mail access granted. Found ${mailboxCount} mailboxes.`
				};
			} else {
				return {
					hasAccess: false,
					message: "Mail access granted but no mailboxes found. Please ensure Mail is configured with at least one email account."
				};
			}
		} else {
			// Extract the error message
			const errorMsg = result.replace("ERROR:", "");
			return {
				hasAccess: false,
				message: `Mail access denied: ${errorMsg}\n\nTo fix this:\n1. A permission dialog should have appeared - please allow access\n2. If no dialog appeared, go to System Settings > Privacy & Security > Automation\n3. Find your terminal/app in the list and enable 'Mail'\n4. Make sure Mail app is running and configured with at least one account\n5. Try again`
			};
		}
	} catch (error) {
		return {
			hasAccess: false,
			message: `Error requesting Mail access: ${error instanceof Error ? error.message : String(error)}\n\nPlease manually grant permissions in System Settings > Privacy & Security > Automation`
		};
	}
}

/**
 * Get unread emails from Mail app (limited for performance)
 */
async function getUnreadMails(limit = 10): Promise<EmailMessage[]> {
	try {
		const accessResult = await requestMailAccess();
		if (!accessResult.hasAccess) {
			throw new Error(accessResult.message);
		}

		const maxEmails = Math.min(limit, CONFIG.MAX_EMAILS);

		const script = `
tell application "Mail"
    set emailResults to {}
    set emailCount to 0

    try
        -- Start with inbox first (most likely to have unread emails)
        set inboxMessages to messages of inbox
        repeat with currentMsg in inboxMessages
            if emailCount >= ${maxEmails} then exit repeat

            try
                if read status of currentMsg is false then
                    set emailSubject to subject of currentMsg
                    set emailSender to sender of currentMsg
                    set emailDate to (date sent of currentMsg) as string
                    set mailboxName to "Inbox"

                    -- Get content with length limit
                    set emailContent to ""
                    try
                        set fullContent to content of currentMsg
                        if (length of fullContent) > ${CONFIG.MAX_CONTENT_PREVIEW} then
                            set emailContent to (characters 1 thru ${CONFIG.MAX_CONTENT_PREVIEW} of fullContent) as string
                            set emailContent to emailContent & "..."
                        else
                            set emailContent to fullContent
                        end if
                    on error
                        set emailContent to "[Content not available]"
                    end try

                    -- Format as delimited string: subject||sender||date||content||mailbox
                    set emailString to emailSubject & "||" & emailSender & "||" & emailDate & "||" & emailContent & "||" & mailboxName
                    set end of emailResults to emailString
                    set emailCount to emailCount + 1
                end if
            on error
                -- Skip problematic messages
            end try
        end repeat

        -- Convert results to delimited format
        set AppleScript's text item delimiters to "@@"
        set resultString to emailResults as string
        set AppleScript's text item delimiters to ""

        return "SUCCESS:" & resultString
    on error errMsg
        return "ERROR:" & errMsg
    end try
end tell`;

		const result = (await runAppleScript(script)) as string;

		if (result.startsWith("ERROR:")) {
			throw new Error(result.replace("ERROR:", ""));
		}

		if (result.startsWith("SUCCESS:")) {
			const dataString = result.replace("SUCCESS:", "");
			if (dataString.trim() === "") {
				return [];
			}

			// Parse the delimited email data
			const emailStrings = dataString.split("@@").filter(s => s.trim() !== "");
			const emails: EmailMessage[] = [];

			for (const emailString of emailStrings) {
				const parts = emailString.split("||");
				if (parts.length >= 5) {
					emails.push({
						subject: parts[0] || "No subject",
						sender: parts[1] || "Unknown sender",
						dateSent: parts[2] || new Date().toString(),
						content: parts[3] || "[Content not available]",
						isRead: false,
						mailbox: parts[4] || "Unknown"
					});
				}
			}

			return emails;
		}

		return [];
	} catch (error) {
		console.error(
			`Error getting unread emails: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

/**
 * Search for emails by search term
 */
async function searchMails(
	searchTerm: string,
	limit = 10,
): Promise<EmailMessage[]> {
	try {
		const accessResult = await requestMailAccess();
		if (!accessResult.hasAccess) {
			throw new Error(accessResult.message);
		}

		if (!searchTerm || searchTerm.trim() === "") {
			return [];
		}

		const maxEmails = Math.min(limit, CONFIG.MAX_EMAILS);
		const cleanSearchTerm = searchTerm.replace(/"/g, '\\"'); // Escape quotes

		const script = `
tell application "Mail"
    set emailResults to {}
    set emailCount to 0

    try
        -- Search in inbox first for performance
        set inboxMessages to messages of inbox
        repeat with currentMsg in inboxMessages
            if emailCount >= ${maxEmails} then exit repeat

            try
                set emailSubject to subject of currentMsg
                set emailContent to content of currentMsg

                -- Simple case-insensitive search in subject and content
                if (emailSubject contains "${cleanSearchTerm}") or (emailContent contains "${cleanSearchTerm}") then
                    set emailSender to sender of currentMsg
                    set emailDate to (date sent of currentMsg) as string
                    set emailRead to read status of currentMsg
                    set mailboxName to "Inbox"

                    -- Limit content length
                    if (length of emailContent) > ${CONFIG.MAX_CONTENT_PREVIEW} then
                        set emailContent to (characters 1 thru ${CONFIG.MAX_CONTENT_PREVIEW} of emailContent) as string
                        set emailContent to emailContent & "..."
                    end if

                    -- Format as delimited string: subject||sender||date||content||mailbox||isRead
                    set emailString to emailSubject & "||" & emailSender & "||" & emailDate & "||" & emailContent & "||" & mailboxName & "||" & emailRead
                    set end of emailResults to emailString
                    set emailCount to emailCount + 1
                end if
            on error
                -- Skip problematic messages
            end try
        end repeat

        -- Convert results to delimited format
        set AppleScript's text item delimiters to "@@"
        set resultString to emailResults as string
        set AppleScript's text item delimiters to ""

        return "SUCCESS:" & resultString
    on error errMsg
        return "ERROR:" & errMsg
    end try
end tell`;

		const result = (await runAppleScript(script)) as string;

		if (result.startsWith("ERROR:")) {
			throw new Error(result.replace("ERROR:", ""));
		}

		if (result.startsWith("SUCCESS:")) {
			const dataString = result.replace("SUCCESS:", "");
			if (dataString.trim() === "") {
				return [];
			}

			// Parse the delimited email data
			const emailStrings = dataString.split("@@").filter(s => s.trim() !== "");
			const emails: EmailMessage[] = [];

			for (const emailString of emailStrings) {
				const parts = emailString.split("||");
				if (parts.length >= 6) {
					emails.push({
						subject: parts[0] || "No subject",
						sender: parts[1] || "Unknown sender",
						dateSent: parts[2] || new Date().toString(),
						content: parts[3] || "[Content not available]",
						mailbox: parts[4] || "Unknown",
						isRead: parts[5] === "true"
					});
				}
			}

			return emails;
		}

		return [];
	} catch (error) {
		console.error(
			`Error searching emails: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

/**
 * Send an email
 */
async function sendMail(
	to: string,
	subject: string,
	body: string,
	cc?: string,
	bcc?: string,
): Promise<string | undefined> {
	try {
		const accessResult = await requestMailAccess();
		if (!accessResult.hasAccess) {
			throw new Error(accessResult.message);
		}

		// Validate inputs
		if (!to || !to.trim()) {
			throw new Error("To address is required");
		}
		if (!subject || !subject.trim()) {
			throw new Error("Subject is required");
		}
		if (!body || !body.trim()) {
			throw new Error("Email body is required");
		}

		// Use file-based approach for email body to avoid AppleScript escaping issues
		const tmpFile = `/tmp/email-body-${Date.now()}.txt`;
		const fs = require("fs");

		// Write content to temporary file
		fs.writeFileSync(tmpFile, body.trim(), "utf8");

		const script = `
tell application "Mail"
    activate

    -- Read email body from file to preserve formatting
    set emailBody to read file POSIX file "${tmpFile}" as «class utf8»

    -- Create new message
    set newMessage to make new outgoing message with properties {subject:"${subject.replace(/"/g, '\\"')}", content:emailBody, visible:true}

    tell newMessage
        make new to recipient with properties {address:"${to.replace(/"/g, '\\"')}"}
        ${cc ? `make new cc recipient with properties {address:"${cc.replace(/"/g, '\\"')}"}` : ""}
        ${bcc ? `make new bcc recipient with properties {address:"${bcc.replace(/"/g, '\\"')}"}` : ""}
    end tell

    send newMessage
    return "SUCCESS"
end tell`;

		const result = (await runAppleScript(script)) as string;

		// Clean up temporary file
		try {
			fs.unlinkSync(tmpFile);
		} catch (e) {
			// Ignore cleanup errors
		}

		if (result === "SUCCESS") {
			return `Email sent to ${to} with subject "${subject}"`;
		} else {
			throw new Error("Failed to send email");
		}
	} catch (error) {
		console.error(
			`Error sending email: ${error instanceof Error ? error.message : String(error)}`,
		);
		throw new Error(
			`Error sending email: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Get list of mailboxes
 */
async function getMailboxes(): Promise<string[]> {
	try {
		const accessResult = await requestMailAccess();
		if (!accessResult.hasAccess) {
			throw new Error(accessResult.message);
		}

		const script = `
tell application "Mail"
    try
        set mailboxList to {}

        -- Get all mailboxes across all accounts
        repeat with eachAccount in accounts
            try
                set accountName to name of eachAccount
                set accountMailboxes to mailboxes of eachAccount

                repeat with eachMailbox in accountMailboxes
                    try
                        set mailboxName to name of eachMailbox
                        -- Create a descriptive name that includes account if multiple accounts
                        set fullName to accountName & " - " & mailboxName
                        set end of mailboxList to fullName
                    on error
                        -- Skip problematic mailboxes
                    end try
                end repeat
            on error
                -- Skip problematic accounts
            end try
        end repeat

        -- If no mailboxes found in accounts, try getting global mailboxes
        if (count of mailboxList) = 0 then
            try
                set globalMailboxes to mailboxes
                repeat with eachMailbox in globalMailboxes
                    try
                        set mailboxName to name of eachMailbox
                        set end of mailboxList to mailboxName
                    on error
                        -- Skip problematic mailboxes
                    end try
                end repeat
            on error
                -- If that fails too, return empty list
            end try
        end if

        -- Convert list to delimited string for reliable transport
        set AppleScript's text item delimiters to "|"
        set mailboxString to mailboxList as string
        set AppleScript's text item delimiters to ""

        return mailboxString
    on error errMsg
        return "ERROR:" & errMsg
    end try
end tell`;

		const result = (await runAppleScript(script)) as string;

		if (result.startsWith("ERROR:")) {
			throw new Error(result.replace("ERROR:", ""));
		}

		// Parse the delimited string back to array
		if (result && result.trim() !== "") {
			return result.split("|").filter(name => name && name.trim() !== "");
		}

		return [];
	} catch (error) {
		console.error(
			`Error getting mailboxes: ${error instanceof Error ? error.message : String(error)}`,
		);
		throw error; // Re-throw so caller can handle it properly
	}
}

/**
 * Get list of email accounts
 */
async function getAccounts(): Promise<string[]> {
	try {
		const accessResult = await requestMailAccess();
		if (!accessResult.hasAccess) {
			throw new Error(accessResult.message);
		}

		const script = `
tell application "Mail"
    try
        set accountList to {}
        repeat with eachAccount in accounts
            try
                set accountName to name of eachAccount
                set end of accountList to accountName
            on error
                -- Skip problematic accounts
            end try
        end repeat

        -- Convert list to delimited string for reliable transport
        set AppleScript's text item delimiters to "|"
        set accountString to accountList as string
        set AppleScript's text item delimiters to ""

        return accountString
    on error errMsg
        return "ERROR:" & errMsg
    end try
end tell`;

		const result = (await runAppleScript(script)) as string;

		if (result.startsWith("ERROR:")) {
			throw new Error(result.replace("ERROR:", ""));
		}

		// Parse the delimited string back to array
		if (result && result.trim() !== "") {
			return result.split("|").filter(name => name && name.trim() !== "");
		}

		return [];
	} catch (error) {
		console.error(
			`Error getting accounts: ${error instanceof Error ? error.message : String(error)}`,
		);
		throw error; // Re-throw so caller can handle it properly
	}
}

/**
 * Get mailboxes for a specific account
 */
async function getMailboxesForAccount(accountName: string): Promise<string[]> {
	try {
		const accessResult = await requestMailAccess();
		if (!accessResult.hasAccess) {
			throw new Error(accessResult.message);
		}

		if (!accountName || !accountName.trim()) {
			return [];
		}

		const script = `
tell application "Mail"
    set boxList to {}

    try
        -- Find the account
        set targetAccount to first account whose name is "${accountName.replace(/"/g, '\\"')}"
        set accountMailboxes to mailboxes of targetAccount

        repeat with i from 1 to (count of accountMailboxes)
            try
                set currentMailbox to item i of accountMailboxes
                set mailboxName to name of currentMailbox
                set boxList to boxList & {mailboxName}
            on error
                -- Skip problematic mailboxes
            end try
        end repeat
    on error
        -- Account not found or other error
        return {}
    end try

    return boxList
end tell`;

		const result = (await runAppleScript(script)) as unknown;

		if (Array.isArray(result)) {
			return result.filter((name) => name && typeof name === "string");
		}

		return [];
	} catch (error) {
		console.error(
			`Error getting mailboxes for account: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

/**
 * Get latest emails from a specific account
 */
async function getLatestMails(
	account: string,
	limit = 5,
): Promise<EmailMessage[]> {
	try {
		const accessResult = await requestMailAccess();
		if (!accessResult.hasAccess) {
			throw new Error(accessResult.message);
		}

		const maxEmails = Math.min(limit, CONFIG.MAX_EMAILS);

		const script = `
tell application "Mail"
    set emailResults to {}
    set emailCount to 0

    try
        -- Find the target account
        set targetAccount to first account whose name is "${account.replace(/"/g, '\\"')}"

        -- Get mailboxes for this account and find inbox-like mailbox
        set accountMailboxes to mailboxes of targetAccount
        set inboxMessages to {}
        set mailboxName to "Messages"

        repeat with mb in accountMailboxes
            set mbName to name of mb
            -- Look for inbox-like mailboxes
            if mbName contains "INBOX" or mbName contains "Inbox" or mbName is "INBOX" then
                set inboxMessages to messages of mb
                set mailboxName to mbName
                exit repeat
            end if
        end repeat

        -- If no inbox found, use first mailbox with messages
        if (count of inboxMessages) = 0 then
            repeat with mb in accountMailboxes
                try
                    set mbMessages to messages of mb
                    if (count of mbMessages) > 0 then
                        set inboxMessages to mbMessages
                        set mailboxName to name of mb
                        exit repeat
                    end if
                on error
                    -- Skip problematic mailboxes
                end try
            end repeat
        end if

        repeat with currentMsg in inboxMessages
            if emailCount >= ${maxEmails} then exit repeat

            try
                set emailSubject to subject of currentMsg
                set emailSender to sender of currentMsg
                set emailDate to (date sent of currentMsg) as string
                set emailRead to read status of currentMsg

                -- Get content with length limit
                set emailContent to ""
                try
                    set fullContent to content of currentMsg
                    if (length of fullContent) > ${CONFIG.MAX_CONTENT_PREVIEW} then
                        set emailContent to (characters 1 thru ${CONFIG.MAX_CONTENT_PREVIEW} of fullContent) as string
                        set emailContent to emailContent & "..."
                    else
                        set emailContent to fullContent
                    end if
                on error
                    set emailContent to "[Content not available]"
                end try

                -- Format as delimited string: subject||sender||date||content||mailbox||isRead
                set emailString to emailSubject & "||" & emailSender & "||" & emailDate & "||" & emailContent & "||" & mailboxName & "||" & emailRead
                set end of emailResults to emailString
                set emailCount to emailCount + 1
            on error
                -- Skip problematic messages
            end try
        end repeat

        -- Convert results to delimited format
        set AppleScript's text item delimiters to "@@"
        set resultString to emailResults as string
        set AppleScript's text item delimiters to ""

        return "SUCCESS:" & resultString
    on error errMsg
        return "ERROR:" & errMsg
    end try
end tell`;

		const result = (await runAppleScript(script)) as string;

		if (result.startsWith("ERROR:")) {
			throw new Error(result.replace("ERROR:", ""));
		}

		if (result.startsWith("SUCCESS:")) {
			const dataString = result.replace("SUCCESS:", "");
			if (dataString.trim() === "") {
				return [];
			}

			// Parse the delimited email data
			const emailStrings = dataString.split("@@").filter(s => s.trim() !== "");
			const emails: EmailMessage[] = [];

			for (const emailString of emailStrings) {
				const parts = emailString.split("||");
				if (parts.length >= 6) {
					emails.push({
						subject: parts[0] || "No subject",
						sender: parts[1] || "Unknown sender",
						dateSent: parts[2] || new Date().toString(),
						content: parts[3] || "[Content not available]",
						mailbox: `${account} - ${parts[4] || "Unknown"}`,
						isRead: parts[5] === "true"
					});
				}
			}

			return emails;
		}

		return [];
	} catch (error) {
		console.error("Error getting latest emails:", error);
		return [];
	}
}

export default {
	getUnreadMails,
	searchMails,
	sendMail,
	getMailboxes,
	getAccounts,
	getMailboxesForAccount,
	getLatestMails,
	requestMailAccess,
};
