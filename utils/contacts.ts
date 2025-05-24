import { run } from '@jxa/run';
import { runAppleScript } from 'run-applescript';
import { validateContactName, validatePhoneNumber, escapeForLogging } from './ValidationUtils';

async function checkContactsAccess(): Promise<boolean> {
    try {
        console.error("Checking Contacts access...");
        // Try to get the count of contacts as a simple test
        const result = await runAppleScript(`
tell application "Contacts"
    count every person
end tell`);
        console.error(`Contacts access check successful. Found ${result} contacts.`);
        return true;
    } catch (error) {
        console.error("Contacts access check failed:", error);
        throw new Error("Cannot access Contacts app. Please grant access in System Preferences > Security & Privacy > Privacy > Contacts.");
    }
}

async function getAllNumbersAppleScript() {
    try {
        console.error("Trying AppleScript fallback for getAllNumbers...");
        const script = `
tell application "Contacts"
    set contactsList to ""
    repeat with aPerson in every person
        try
            set personName to name of aPerson
            set phoneList to phones of aPerson
            if (count of phoneList) > 0 then
                repeat with aPhone in phoneList
                    set phoneValue to value of aPhone
                    set contactsList to contactsList & personName & "|" & phoneValue & "\\n"
                end repeat
            end if
        on error
            -- Skip contacts that can't be processed
        end try
    end repeat
    return contactsList
end tell`;

        const result = await runAppleScript(script);
        console.error("AppleScript result type:", typeof result);
        console.error("AppleScript result sample:", typeof result === 'string' ? result.substring(0, 200) + '...' : result);
        
        // Parse the AppleScript result into our expected format
        const phoneNumbers: { [key: string]: string[] } = {};
        
        if (typeof result === 'string' && result.trim()) {
            const lines = result.trim().split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                if (line.includes('|')) {
                    const [name, phone] = line.split('|').map(s => s.trim());
                    if (name && phone) {
                        if (!phoneNumbers[name]) {
                            phoneNumbers[name] = [];
                        }
                        phoneNumbers[name].push(phone);
                    }
                }
            }
        }
        
        console.error(`AppleScript parsed ${Object.keys(phoneNumbers).length} contacts with phone numbers.`);
        return phoneNumbers;
    } catch (error) {
        console.error("AppleScript fallback failed:", error);
        throw error;
    }
}

async function getAllNumbers() {
    try {
        console.error("Starting getAllNumbers...");
        if (!await checkContactsAccess()) {
            return {};
        }

        // Try JXA first, fallback to AppleScript if it fails
        try {
            console.error("Running JXA script to get all contacts...");
            const nums: { [key: string]: string[] } = await run(() => {
                const Contacts = Application('Contacts');
                console.log("Contacts app accessed successfully");
                
                const people = Contacts.people();
                console.log(`Found ${people.length} people in contacts`);
                
                const phoneNumbers: { [key: string]: string[] } = {};

                for (let i = 0; i < people.length; i++) {
                    try {
                        const person = people[i];
                        const name = person.name();
                        console.log(`Processing contact: ${name}`);
                        
                        const phones = person.phones();
                        console.log(`Found ${phones.length} phone numbers for ${name}`);
                        
                        const phoneValues = phones.map((phone: any) => phone.value());

                        if (name && phoneValues.length > 0) {
                            phoneNumbers[name] = phoneValues;
                        }
                    } catch (error) {
                        console.log(`Error processing contact ${i}:`, error);
                        // Skip contacts that can't be processed
                    }
                }

                console.log(`Processed ${Object.keys(phoneNumbers).length} contacts with phone numbers`);
                return phoneNumbers;
            });

            console.error(`JXA getAllNumbers completed. Found ${Object.keys(nums).length} contacts with phone numbers.`);
            
            // If JXA returns empty results, try AppleScript fallback
            if (Object.keys(nums).length === 0) {
                console.error("JXA returned empty results, trying AppleScript fallback...");
                return await getAllNumbersAppleScript();
            }
            
            return nums;
        } catch (jxaError) {
            console.error("JXA failed, trying AppleScript fallback:", jxaError);
            return await getAllNumbersAppleScript();
        }
    } catch (error) {
        console.error("Error in getAllNumbers:", error);
        throw new Error(`Error accessing contacts: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function findNumber(name: string) {
    try {
        // Validate and sanitize input
        const sanitizedName = validateContactName(name);
        console.error(`Starting findNumber for: ${escapeForLogging(sanitizedName)}`);
        
        if (!await checkContactsAccess()) {
            return [];
        }

        // Use JXA exclusively to avoid string interpolation vulnerabilities
        try {
            console.error("Running secure JXA script to find specific contact...");
            const phones: string[] = await run((searchName: string) => {
                const Contacts = Application('Contacts');
                const people = Contacts.people();
                
                console.log(`Searching for contacts matching: ${searchName}`);
                
                for (let i = 0; i < people.length; i++) {
                    try {
                        const person = people[i];
                        const personName = person.name();
                        
                        // Use JavaScript string methods for safe comparison
                        if (personName && personName.toLowerCase().includes(searchName.toLowerCase())) {
                            console.log(`Found matching contact: ${personName}`);
                            
                            const phones = person.phones();
                            const phoneValues = phones.map((phone: any) => phone.value());
                            
                            if (phoneValues.length > 0) {
                                console.log(`Found ${phoneValues.length} phone numbers`);
                                return phoneValues;
                            }
                        }
                    } catch (error) {
                        console.log(`Error processing contact ${i}:`, error);
                        // Skip contacts that can't be processed
                    }
                }
                
                console.log("No matching contact found");
                return [];
            }, sanitizedName);

            console.error(`JXA findNumber completed. Found ${phones.length} phone numbers.`);

            // If no exact match found, try fuzzy search as fallback
            if (phones.length === 0) {
                console.error("No direct match found, trying fuzzy search...");
                return await findNumberFuzzyFallback(sanitizedName);
            }

            return phones;
        } catch (jxaError) {
            console.error("JXA findNumber failed:", jxaError);
            // Fallback to fuzzy search through cached data
            return await findNumberFuzzyFallback(sanitizedName);
        }
    } catch (error) {
        console.error("Error in findNumber:", error);
        throw new Error(`Error finding contact: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Fallback fuzzy search using cached contact data
 * This avoids the performance hit of loading all contacts in the main path
 */
async function findNumberFuzzyFallback(sanitizedName: string): Promise<string[]> {
    try {
        console.error("Running fuzzy search fallback...");
        const allNumbers = await getAllNumbers();
        const closestMatch = Object.keys(allNumbers).find(personName => 
            personName.toLowerCase().includes(sanitizedName.toLowerCase())
        );
        console.error(`Fuzzy search result: ${closestMatch || 'none'}`);
        return closestMatch ? allNumbers[closestMatch] : [];
    } catch (error) {
        console.error("Fuzzy search fallback failed:", error);
        return [];
    }
}

async function findContactByPhone(phoneNumber: string): Promise<string | null> {
    try {
        // Validate and sanitize input
        const sanitizedPhoneNumber = validatePhoneNumber(phoneNumber);
        console.error(`Starting findContactByPhone for: ${escapeForLogging(sanitizedPhoneNumber)}`);
        
        if (!await checkContactsAccess()) {
            return null;
        }

        // Normalize the phone number for comparison
        const searchNumber = sanitizedPhoneNumber.replace(/[^0-9+]/g, '');
        
        // Get all contacts and their numbers
        const allContacts = await getAllNumbers();
        
        // Look for a match
        for (const [name, numbers] of Object.entries(allContacts)) {
            const normalizedNumbers = numbers.map(num => num.replace(/[^0-9+]/g, ''));
            if (normalizedNumbers.some(num => 
                num === searchNumber || 
                num === `+${searchNumber}` || 
                num === `+1${searchNumber}` ||
                `+1${num}` === searchNumber
            )) {
                return name;
            }
        }

        return null;
    } catch (error) {
        console.error("Error in findContactByPhone:", error);
        // Return null instead of throwing to handle gracefully
        return null;
    }
}

async function testContactsAccess(): Promise<{ success: boolean; message: string; contactCount?: number }> {
    try {
        console.error("Testing contacts access...");
        
        // Test basic AppleScript access
        const contactCount = await runAppleScript(`
tell application "Contacts"
    count every person
end tell`);
        
        const count = Number(contactCount);
        
        if (count > 0) {
            return { 
                success: true, 
                message: `Successfully accessed ${count} contacts.`,
                contactCount: count
            };
        } else {
            return { 
                success: false, 
                message: "No contacts found. Your address book might be empty." 
            };
        }
    } catch (error) {
        return { 
            success: false, 
            message: `Cannot access Contacts app. Error: ${error instanceof Error ? error.message : String(error)}. Please check System Preferences > Security & Privacy > Privacy > Contacts and ensure this application has permission.`
        };
    }
}

export default { getAllNumbers, findNumber, findContactByPhone, testContactsAccess };
