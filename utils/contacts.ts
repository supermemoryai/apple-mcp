import { run } from '@jxa/run';
import { runAppleScript } from 'run-applescript';
import { validateContactName, validatePhoneNumber, escapeForLogging } from './ValidationUtils';
import { getContactCache } from './ContactCache';
import type { ContactsData } from './ContactCache';

// Type for phone search result from JXA
interface PhoneSearchResult {
    name: string;
    phones: string[];
}

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

async function getAllNumbers(): Promise<ContactsData> {
    try {
        console.error("Starting getAllNumbers...");
        
        // Check cache first
        const cache = getContactCache();
        const cachedData = cache.get('allContacts');
        if (cachedData) {
            console.error(`Cache hit! Using cached data with ${Object.keys(cachedData).length} contacts.`);
            return cachedData;
        }
        
        if (!await checkContactsAccess()) {
            return {};
        }

        // Try JXA first, fallback to AppleScript if it fails
        let contactsData: ContactsData = {};
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
            contactsData = nums;
            
            // If JXA returns empty results, try AppleScript fallback
            if (Object.keys(nums).length === 0) {
                console.error("JXA returned empty results, trying AppleScript fallback...");
                contactsData = await getAllNumbersAppleScript();
            }
        } catch (jxaError) {
            console.error("JXA failed, trying AppleScript fallback:", jxaError);
            contactsData = await getAllNumbersAppleScript();
        }

        // Cache the results
        if (Object.keys(contactsData).length > 0) {
            cache.set(contactsData, 'allContacts');
            console.error(`Cached ${Object.keys(contactsData).length} contacts for future use.`);
        }
        
        return contactsData;
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
        
        // Try cache first for fuzzy search
        const cache = getContactCache();
        const cachedData = cache.get('allContacts');
        
        let allNumbers: ContactsData;
        if (cachedData) {
            console.error("Using cached data for fuzzy search");
            allNumbers = cachedData;
        } else {
            console.error("No cached data, loading fresh data for fuzzy search");
            allNumbers = await getAllNumbers();
        }
        
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

/**
 * Normalize phone number for comparison by removing formatting characters
 * This handles common phone number formats and international numbers
 */
function normalizePhoneNumber(phoneNumber: string): string[] {
    // Remove all non-digit and non-plus characters
    const cleaned = phoneNumber.replace(/[^0-9+]/g, '');
    
    // Generate various normalized formats for comparison
    const formats: string[] = [cleaned];
    
    // Add format without country code if it starts with +1
    if (cleaned.startsWith('+1')) {
        formats.push(cleaned.substring(2));
    }
    
    // Add format with +1 if it doesn't start with + and looks like US number
    if (!cleaned.startsWith('+') && cleaned.length === 10) {
        formats.push(`+1${cleaned}`);
    }
    
    // Add format with just + prefix
    if (!cleaned.startsWith('+') && cleaned.length > 0) {
        formats.push(`+${cleaned}`);
    }
    
    return [...new Set(formats)]; // Remove duplicates
}

/**
 * Optimized function to find contact by phone number using cache-first approach
 * Checks cache first for fast lookup, falls back to direct JXA search only when needed
 */
async function findContactByPhoneOptimized(phoneNumber: string): Promise<string | null> {
    try {
        // Validate and sanitize input
        const sanitizedPhoneNumber = validatePhoneNumber(phoneNumber);
        console.error(`Starting optimized findContactByPhone for: ${escapeForLogging(sanitizedPhoneNumber)}`);
        
        if (!await checkContactsAccess()) {
            return null;
        }

        // Get normalized phone number formats for comparison
        const searchNumbers = normalizePhoneNumber(sanitizedPhoneNumber);
        console.error(`Searching for phone numbers: ${searchNumbers.join(', ')}`);

        // Try cache first (fast lookup)
        console.error("Checking cache for phone search...");
        const cacheResult = await findContactByPhoneCachedSearch(searchNumbers);
        if (cacheResult) {
            console.error(`Cache hit! Found contact: ${cacheResult}`);
            return cacheResult;
        }

        // Cache miss - fallback to direct JXA search (slower but comprehensive)
        console.error("Cache miss, falling back to direct JXA search...");
        try {
            console.error("Running direct JXA phone search...");
            const foundContact: PhoneSearchResult | null = await run((searchFormats: string[]) => {
                const Contacts = Application('Contacts');
                const people = Contacts.people();
                
                console.log(`Searching ${people.length} contacts for phone numbers: ${searchFormats.join(', ')}`);
                
                for (let i = 0; i < people.length; i++) {
                    try {
                        const person = people[i];
                        const phones = person.phones();
                        
                        // Check each phone number for this contact
                        for (let j = 0; j < phones.length; j++) {
                            const phoneValue = phones[j].value();
                            const normalizedPhone = phoneValue.replace(/[^0-9+]/g, '');
                            
                            // Check if any of our search formats match this phone number
                            for (const searchNumber of searchFormats) {
                                if (normalizedPhone === searchNumber || 
                                    normalizedPhone === `+${searchNumber}` || 
                                    normalizedPhone === `+1${searchNumber}` ||
                                    `+1${normalizedPhone}` === searchNumber) {
                                    
                                    const personName = person.name();
                                    console.log(`Found match: ${personName} has phone ${phoneValue}`);
                                    
                                    // Return both the name and all phone numbers for caching
                                    const allPhones = phones.map((phone: any) => phone.value());
                                    return { name: personName, phones: allPhones };
                                }
                            }
                        }
                    } catch (error) {
                        console.log(`Error processing contact ${i}:`, error);
                        // Skip contacts that can't be processed
                    }
                }
                
                console.log("No matching contact found via direct search");
                return null;
            }, searchNumbers);

            if (foundContact && foundContact.name) {
                console.error(`Direct JXA search found: ${foundContact.name}`);
                
                // Cache the successful result for future lookups
                await cachePhoneSearchResult(foundContact.name, foundContact.phones);
                
                return foundContact.name;
            }
        } catch (jxaError) {
            console.error("Direct JXA phone search failed:", jxaError);
        }

        console.error("No contact found via any search method");
        return null;
        
    } catch (error) {
        console.error("Error in findContactByPhoneOptimized:", error);
        return null;
    }
}

/**
 * Cache-only phone search - only searches existing cached data
 * Returns null if no cache exists or no match found in cache
 */
async function findContactByPhoneCachedSearch(searchNumbers: string[]): Promise<string | null> {
    try {
        // Only search cache - don't load fresh data if cache is empty
        const cache = getContactCache();
        const allContacts = cache.get('allContacts');
        
        if (!allContacts) {
            console.error("No cached contacts available for search");
            return null;
        }
        
        console.error("Searching cached contacts...");
        
        // Look for a match in cached data
        for (const [name, numbers] of Object.entries(allContacts)) {
            const normalizedNumbers = numbers.map(num => num.replace(/[^0-9+]/g, ''));
            
            // Check if any cached phone numbers match our search numbers
            for (const searchNumber of searchNumbers) {
                if (normalizedNumbers.some(num => 
                    num === searchNumber || 
                    num === `+${searchNumber}` || 
                    num === `+1${searchNumber}` ||
                    `+1${num}` === searchNumber
                )) {
                    console.error(`Found match in cache: ${name}`);
                    return name;
                }
            }
        }

        console.error("No match found in cached search");
        return null;
    } catch (error) {
        console.error("Cached phone search failed:", error);
        return null;
    }
}

async function findContactByPhone(phoneNumber: string): Promise<string | null> {
    try {
        // Use the new optimized version
        return await findContactByPhoneOptimized(phoneNumber);
    } catch (error) {
        console.error("Error in findContactByPhone:", error);
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

/**
 * Get current cache statistics and configuration
 */
async function getCacheInfo(): Promise<{ stats: any; config: any }> {
    const cache = getContactCache();
    return {
        stats: cache.getStats(),
        config: cache.getConfig()
    };
}

/**
 * Manually invalidate the contacts cache
 */
async function invalidateCache(): Promise<void> {
    const cache = getContactCache();
    cache.invalidate();
    console.error("Contact cache manually invalidated");
}

/**
 * Update cache configuration
 */
async function updateCacheConfig(config: any): Promise<void> {
    const cache = getContactCache();
    cache.updateConfig(config);
    console.error("Cache configuration updated");
}

/**
 * Cache the result of a successful phone search to improve future lookup performance
 */
async function cachePhoneSearchResult(contactName: string, phoneNumbers: string[]): Promise<void> {
    try {
        const cache = getContactCache();
        let existingData = cache.get('allContacts');
        
        if (!existingData) {
            // Create new cache entry with just this contact
            existingData = {};
        }
        
        // Add or update this contact in the cache
        existingData[contactName] = phoneNumbers;
        
        // Save back to cache
        cache.set(existingData, 'allContacts');
        
        console.error(`📞 Cached phone search result: ${contactName} with ${phoneNumbers.length} phone numbers`);
    } catch (error) {
        console.error("Failed to cache phone search result:", error);
        // Don't throw - caching failure shouldn't break the search
    }
}

export default { 
    getAllNumbers, 
    findNumber, 
    findContactByPhone, 
    testContactsAccess,
    getCacheInfo,
    invalidateCache,
    updateCacheConfig
};
