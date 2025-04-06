import { run } from '@jxa/run';
import type { Application as ApplicationType } from '@jxa/global-type';

// Cache for folders to avoid repeated lookups
let foldersCache: { [folderName: string]: any } = {};
let foldersCacheTimestamp: number = 0;
const CACHE_TTL = 60000; // 1 minute cache validity

type Note = {
    name: string;
    content: string;
    creationDate?: Date;
    modificationDate?: Date;
};

type CreateNoteResult = {
    success: boolean;
    note?: {
        name: string;
        content: string;
    };
    folderName?: string;
    usedDefaultFolder?: boolean;
    message?: string;
};
  
// Reset cache periodically to avoid stale data
function resetCacheIfNeeded() {
    const now = Date.now();
    if (now - foldersCacheTimestamp > CACHE_TTL) {
        foldersCache = {};
        foldersCacheTimestamp = 0;
    }
}

// Get all folders once and cache them
async function getFolders() {
    resetCacheIfNeeded();
    
    // Return from cache if available and not expired
    if (Object.keys(foldersCache).length > 0 && foldersCacheTimestamp > 0) {
        return foldersCache;
    }
    
    try {
        // Define Application inside the JXA context
        const folders = await run(() => {
            const Notes = Application('Notes');
            const allFolders = Notes.folders();
            
            // Create a map of folder names to folder objects
            const folderMap: { [name: string]: any } = {};
            for (let i = 0; i < allFolders.length; i++) {
                folderMap[allFolders[i].name()] = allFolders[i];
            }
            
            return folderMap;
        });
        
        // Update cache
        foldersCache = folders;
        foldersCacheTimestamp = Date.now();
        
        return folders;
    } catch (error) {
        console.error('Error fetching folders:', error);
        return {};
    }
}

// Get folder by name, using cache when possible
async function getFolder(folderName: string) {
    const folders = await getFolders();
    return folders[folderName] || null;
}

async function getAllNotes() {
    try {
        const notes: Note[] = await run(() => {
            const Notes = Application('Notes');
            const notes = Notes.notes();
            
            // Only fetch name and first 100 chars of content for preview
            return notes.map((note: any) => {
                const content = note.plaintext();
                return {
                    name: note.name(),
                    content: content.length > 100 ? content.substring(0, 100) + '...' : content
                };
            });
        });
        
        return notes;
    } catch (error) {
        console.error('Error getting all notes:', error);
        return [];
    }
}

async function findNote(searchText: string) {
    try {
        const notes: Note[] = await run((searchText: string) => {
            const Notes = Application('Notes');
            const notes = Notes.notes.whose({
                _or: [
                    { name: { _contains: searchText } },
                    { plaintext: { _contains: searchText } }
                ]
            })();
            
            return notes.length > 0 ? notes.map((note: any) => ({
                name: note.name(),
                content: note.plaintext()
            })) : [];
        }, searchText);
        
        if (notes.length === 0) {
            const allNotes = await getAllNotes();
            const closestMatch = allNotes.find(({ name }) =>
                name.toLowerCase().includes(searchText.toLowerCase())
            );
            
            if (closestMatch) {
                // If we found a match by name, fetch the full content just for this note
                const fullContent = await run((noteName: string) => {
                    const Notes = Application('Notes');
                    const note = Notes.notes.whose({ name: { _equals: noteName } })()[0];
                    return note ? note.plaintext() : '';
                }, closestMatch.name);
                
                return [{
                    name: closestMatch.name,
                    content: fullContent || closestMatch.content
                }];
            }
            
            return [];
        }
        
        return notes;
    } catch (error) {
        console.error('Error finding note:', error);
        return [];
    }
}

async function createNote(title: string, body: string, folderName: string = 'Claude'): Promise<CreateNoteResult> {
    try {
        // Format the body with proper markdown
        const formattedBody = body
            .replace(/^(#+)\s+(.+)$/gm, '$1 $2\n') // Add newline after headers
            .replace(/^-\s+(.+)$/gm, '\n- $1') // Add newline before list items
            .replace(/\n{3,}/g, '\n\n') // Remove excess newlines
            .trim();
        
        // Check if folder exists in cache first
        let targetFolder = await getFolder(folderName);
        
        if (!targetFolder) {
            // If folder doesn't exist, either create it or use default
            const result = await run((title: string, body: string, folderName: string) => {
                const Notes = Application('Notes');
                let targetFolder;
                let usedDefaultFolder = false;
                let actualFolderName = folderName;
                
                try {
                    // Try to find the specified folder again directly
                    const folders = Notes.folders();
                    for (let i = 0; i < folders.length; i++) {
                        if (folders[i].name() === folderName) {
                            targetFolder = folders[i];
                            break;
                        }
                    }
                    
                    // If the specified folder doesn't exist
                    if (!targetFolder) {
                        if (folderName === 'Claude') {
                            // Try to create the Claude folder if it doesn't exist
                            Notes.make({ new: 'folder', withProperties: { name: 'Claude' } });
                            usedDefaultFolder = true;
                            
                            // Find it again after creation
                            const updatedFolders = Notes.folders();
                            for (let i = 0; i < updatedFolders.length; i++) {
                                if (updatedFolders[i].name() === 'Claude') {
                                    targetFolder = updatedFolders[i];
                                    break;
                                }
                            }
                        } else {
                            throw new Error(`Folder "${folderName}" not found`);
                        }
                    }
                    
                    // Create the note in the specified folder or default folder
                    let newNote;
                    if (targetFolder) {
                        newNote = Notes.make({ new: 'note', withProperties: { name: title, body: body }, at: targetFolder });
                        actualFolderName = folderName;
                    } else {
                        // Fall back to default folder
                        newNote = Notes.make({ new: 'note', withProperties: { name: title, body: body } });
                        actualFolderName = 'Default';
                    }
                    
                    return {
                        success: true,
                        note: {
                            name: title,
                            content: body
                        },
                        folderName: actualFolderName,
                        usedDefaultFolder: usedDefaultFolder
                    };
                } catch (scriptError: unknown) {
                    const errorMessage = scriptError instanceof Error ? scriptError.message : String(scriptError);
                    throw new Error(`AppleScript error: ${errorMessage}`);
                }
            }, title, formattedBody, folderName);
            
            // Update cache with the new folder if created
            if (result.success && result.folderName) {
                resetCacheIfNeeded();
                if (foldersCacheTimestamp > 0) {
                    // Refresh the cache entirely after creating a new folder
                    await getFolders();
                }
            }
            
            return result;
        } else {
            // If folder exists in cache, use it directly
            const result = await run((title: string, body: string, folderName: string) => {
                const Notes = Application('Notes');
                try {
                    // Get folder directly by name
                    const folders = Notes.folders();
                    let targetFolder = null;
                    
                    for (let i = 0; i < folders.length; i++) {
                        if (folders[i].name() === folderName) {
                            targetFolder = folders[i];
                            break;
                        }
                    }
                    
                    if (!targetFolder) {
                        throw new Error(`Folder "${folderName}" not found`);
                    }
                    
                    Notes.make({ new: 'note', withProperties: { name: title, body: body }, at: targetFolder });
                    
                    return {
                        success: true,
                        note: {
                            name: title,
                            content: body
                        },
                        folderName: folderName,
                        usedDefaultFolder: false
                    };
                } catch (scriptError: unknown) {
                    const errorMessage = scriptError instanceof Error ? scriptError.message : String(scriptError);
                    throw new Error(`AppleScript error: ${errorMessage}`);
                }
            }, title, formattedBody, folderName);
            
            return result;
        }
    } catch (error) {
        return {
            success: false,
            message: `Failed to create note: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

async function getNotesFromFolder(folderName: string): Promise<{ success: boolean; notes?: Note[]; message?: string }> {
    try {
        // Try to get folder from cache first
        const targetFolder = await getFolder(folderName);
        
        if (!targetFolder) {
            const result = await run((folderName: string) => {
                const Notes = Application('Notes');
                const folders = Notes.folders();
                
                // Find the specified folder
                let targetFolder = null;
                for (let i = 0; i < folders.length; i++) {
                    if (folders[i].name() === folderName) {
                        targetFolder = folders[i];
                        break;
                    }
                }
                
                if (!targetFolder) {
                    return {
                        success: false,
                        message: `Folder "${folderName}" not found`
                    };
                }
                
                // Get notes from the folder - only fetch previews initially
                const folderNotes = targetFolder.notes();
                
                return {
                    success: true,
                    notes: folderNotes.map((note: any) => {
                        const content = note.plaintext();
                        return {
                            name: note.name(),
                            content: content.length > 500 ? content.substring(0, 500) + '...' : content
                        };
                    })
                };
            }, folderName);
            
            return result;
        } else {
            // If found in cache, use it directly
            const result = await run((folderName: string) => {
                const Notes = Application('Notes');
                const folders = Notes.folders();
                
                // Find the specified folder
                let targetFolder = null;
                for (let i = 0; i < folders.length; i++) {
                    if (folders[i].name() === folderName) {
                        targetFolder = folders[i];
                        break;
                    }
                }
                
                if (!targetFolder) {
                    return {
                        success: false,
                        message: `Folder "${folderName}" not found`
                    };
                }
                
                // Get notes from the folder - only fetch previews initially
                const folderNotes = targetFolder.notes();
                
                return {
                    success: true,
                    notes: folderNotes.map((note: any) => {
                        const content = note.plaintext();
                        return {
                            name: note.name(),
                            content: content.length > 500 ? content.substring(0, 500) + '...' : content
                        };
                    })
                };
            }, folderName);
            
            return result;
        }
    } catch (error) {
        return {
            success: false,
            message: `Failed to get notes from folder: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

async function getRecentNotesFromFolder(folderName: string, limit: number = 5): Promise<{ success: boolean; notes?: Note[]; message?: string }> {
    try {
        // Try to use cached folder first
        const folder = await getFolder(folderName);
        
        const result = await run((folderName: string, limit: number) => {
            const Notes = Application('Notes');
            const folders = Notes.folders();
            
            // Find the specified folder
            let targetFolder = null;
            for (let i = 0; i < folders.length; i++) {
                if (folders[i].name() === folderName) {
                    targetFolder = folders[i];
                    break;
                }
            }
            
            if (!targetFolder) {
                return {
                    success: false,
                    message: `Folder "${folderName}" not found`
                };
            }
            
            // Get notes from the folder
            const folderNotes = targetFolder.notes();
            
            // Map notes with creation date, only fetch previews
            const notesWithDate = folderNotes.map((note: any) => {
                const content = note.plaintext();
                return {
                    name: note.name(),
                    content: content.length > 500 ? content.substring(0, 500) + '...' : content,
                    creationDate: note.creationDate()
                };
            });
            
            // Sort by creation date (newest first)
            notesWithDate.sort((a: any, b: any) => {
                return new Date(b.creationDate).getTime() - new Date(a.creationDate).getTime();
            });
            
            // Return only the specified number of notes
            const limitedNotes = notesWithDate.slice(0, limit);
            
            return {
                success: true,
                notes: limitedNotes
            };
        }, folderName, limit);
        
        return result;
    } catch (error) {
        return {
            success: false,
            message: `Failed to get recent notes from folder: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

async function getNotesByDateRange(
    folderName: string,
    fromDate?: string,
    toDate?: string,
    limit: number = 20
): Promise<{ success: boolean; notes?: Note[]; message?: string }> {
    try {
        // Parse dates outside of JXA for better performance and ensure timezone is properly handled
        const startDate = fromDate ? parseLocalDate(fromDate) : new Date(0);
        const endDate = toDate ? parseLocalDate(toDate, true) : new Date();
        
        // Try to get folder from cache first
        const folder = await getFolder(folderName);
        
        const result = await run((folderName: string, fromDate: string | undefined, toDate: string | undefined, limit: number, startDateMs: number, endDateMs: number) => {
            const Notes = Application('Notes');
            const folders = Notes.folders();
            
            // Find the specified folder
            let targetFolder = null;
            for (let i = 0; i < folders.length; i++) {
                if (folders[i].name() === folderName) {
                    targetFolder = folders[i];
                    break;
                }
            }
            
            if (!targetFolder) {
                return {
                    success: false,
                    message: `Folder "${folderName}" not found`
                };
            }
            
            // Convert JavaScript timestamps to JXA compatible dates
            const startDate = new Date(startDateMs);
            const endDate = new Date(endDateMs);
            
            // Use JXA's whose method to filter notes directly by creation date
            let folderNotes;
            
            try {
                // Filter by date directly in AppleScript
                if (fromDate && toDate) {
                    folderNotes = targetFolder.notes.whose({
                        _and: [
                            { creationDate: { _greaterThan: startDate } },
                            { creationDate: { _lessThan: endDate } }
                        ]
                    })();
                } else if (fromDate) {
                    folderNotes = targetFolder.notes.whose({
                        creationDate: { _greaterThan: startDate }
                    })();
                } else if (toDate) {
                    folderNotes = targetFolder.notes.whose({
                        creationDate: { _lessThan: endDate }
                    })();
                } else {
                    // If no date filters, just get all notes from the folder
                    folderNotes = targetFolder.notes();
                }
            } catch (error) {
                // Fall back to getting all notes and filtering in JavaScript
                folderNotes = targetFolder.notes();
            }
            
            // Map notes with creation and modification dates, only fetch content previews
            const notesWithDate = folderNotes.map((note: any) => {
                const creationDate = note.creationDate();
                
                // JavaScript filtering fallback if AppleScript filtering fails
                if ((fromDate && new Date(creationDate) < startDate) ||
                    (toDate && new Date(creationDate) > endDate)) {
                    return null;
                }
                
                const content = note.plaintext();
                return {
                    name: note.name(),
                    content: content.length > 500 ? content.substring(0, 500) + '...' : content,
                    creationDate: creationDate,
                    modificationDate: note.modificationDate()
                };
            }).filter((note: any) => note !== null);
            
            // Sort by creation date (newest first)
            notesWithDate.sort((a: any, b: any) => {
                return new Date(b.creationDate).getTime() - new Date(a.creationDate).getTime();
            });
            
            // Return only the specified number of notes
            const limitedNotes = notesWithDate.slice(0, limit);
            
            return {
                success: true,
                notes: limitedNotes
            };
        }, folderName, fromDate, toDate, limit, startDate.getTime(), endDate.getTime());
        
        return result;
    } catch (error) {
        return {
            success: false,
            message: `Failed to get notes by date range: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

// Helper function to properly parse dates in local timezone
function parseLocalDate(dateStr: string, isEndDate: boolean = false): Date {
    // If date already has time component, use it directly
    if (dateStr.includes('T') || dateStr.includes(' ') && dateStr.includes(':')) {
        return new Date(dateStr);
    }
    
    // Otherwise, create a date in local timezone
    const [year, month, day] = dateStr.split(/[-/]/);
    
    // Months in JS Date are 0-indexed
    const parsedMonth = parseInt(month, 10) - 1;
    const parsedDay = parseInt(day, 10);
    const parsedYear = parseInt(year, 10);
    
    // For start dates, set time to beginning of day (00:00:00)
    // For end dates, set time to end of day (23:59:59)
    if (isEndDate) {
        return new Date(parsedYear, parsedMonth, parsedDay, 23, 59, 59, 999);
    } else {
        return new Date(parsedYear, parsedMonth, parsedDay, 0, 0, 0, 0);
    }
}

export default { getAllNotes, findNote, createNote, getNotesFromFolder, getRecentNotesFromFolder, getNotesByDateRange };
