/// <reference types="@jxa/global-type" />
import { run } from "@jxa/run";

// Define types for our photos
interface PhotoAlbum {
  name: string;
  id: string;
}

interface Photo {
  id: string;
  filename: string;
  date: string | null;
  favorite: boolean;
  description: string | null;
  keywords: string[];
  albumNames: string[];
  width: number;
  height: number;
  path?: string;
}

/**
 * Check if the Photos app is accessible
 * @returns True if Photos app can be accessed, false otherwise
 */
async function checkPhotosAccess(): Promise<boolean> {
  try {
    const result = await run(() => {
      try {
        const Photos = Application("Photos");
        Photos.name(); // Just try to get the name to test access
        return true;
      } catch (e) {
        throw new Error("Cannot access Photos app");
      }
    });
    return result as boolean;
  } catch (error) {
    console.error(`Cannot access Photos app: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Get all albums from Photos
 * @returns Array of photo albums with their names and IDs
 */
async function getAllAlbums(): Promise<PhotoAlbum[]> {
  try {
    if (!await checkPhotosAccess()) {
      return [];
    }

    const albums = await run(() => {
      try {
        const Photos = Application("Photos");
        const albums = Photos.albums();

        return albums.map((album: any) => ({
          name: album.name(),
          id: album.id(),
        }));
      } catch (e) {
        return [];
      }
    });

    return albums as PhotoAlbum[];
  } catch (error) {
    console.error(`Error getting albums: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Get photos from a specific album by name
 * @param albumName Name of the album to get photos from
 * @param limit Optional limit on the number of photos to return
 * @returns Array of photos in the album
 */
async function getPhotosFromAlbum(albumName: string, limit?: number): Promise<Photo[]> {
  try {
    if (!await checkPhotosAccess()) {
      return [];
    }

    const photos = await run(
      (args: { name: string; limit?: number }) => {
        try {
          const Photos = Application("Photos");
          const albums = Photos.albums.whose({ name: args.name })();
          
          if (albums.length === 0) {
            return [];
          }
          
          const album = albums[0];
          let mediaItems = album.mediaItems();
          
          // Apply limit if specified
          if (args.limit && mediaItems.length > args.limit) {
            mediaItems = mediaItems.slice(0, args.limit);
          }
          
          return mediaItems.map((item: any) => {
            try {
              return {
                id: item.id(),
                filename: item.filename(),
                date: item.date() ? item.date().toISOString() : null,
                favorite: item.favorite(),
                description: item.description() || null,
                keywords: item.keywords ? item.keywords() : [],
                albumNames: [album.name()],
                width: item.width(),
                height: item.height()
              };
            } catch (itemError) {
              // If we fail to process an individual item, return a partial item
              return {
                id: item.id ? item.id() : "unknown",
                filename: item.filename ? item.filename() : "unknown",
                date: null,
                favorite: false,
                description: null,
                keywords: [],
                albumNames: [album.name()],
                width: 0,
                height: 0
              };
            }
          });
        } catch (e) {
          return [];
        }
      },
      { name: albumName, limit }
    );

    return photos as Photo[];
  } catch (error) {
    console.error(`Error getting photos from album: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Search photos by text (looks in filenames, descriptions, and keywords)
 * @param searchText Text to search for
 * @param limit Optional limit on the number of results
 * @returns Array of matching photos
 */
async function searchPhotosByText(searchText: string, limit?: number): Promise<Photo[]> {
  try {
    if (!await checkPhotosAccess()) {
      return [];
    }

    const photos = await run(
      (args: { text: string; limit?: number }) => {
        try {
          const Photos = Application("Photos");
          // Search in filename, description, and keywords
          const mediaItems = Photos.mediaItems.whose({
            _or: [
              { filename: { _contains: args.text } },
              { description: { _contains: args.text } },
              { keywords: { _contains: args.text } }
            ]
          })();
          
          // Apply limit if specified
          const results = args.limit ? mediaItems.slice(0, args.limit) : mediaItems;
          
          return results.map((item: any) => {
            try {
              // Get albums this photo is in
              const containingAlbums = Photos.albums.whose({
                mediaItems: { id: item.id() }
              })();
              
              const albumNames = containingAlbums.map((album: any) => album.name());
              
              return {
                id: item.id(),
                filename: item.filename(),
                date: item.date() ? item.date().toISOString() : null,
                favorite: item.favorite(),
                description: item.description() || null,
                keywords: item.keywords ? item.keywords() : [],
                albumNames: albumNames,
                width: item.width(),
                height: item.height()
              };
            } catch (itemError) {
              // If we fail to process an individual item, return a partial item
              return {
                id: item.id ? item.id() : "unknown",
                filename: item.filename ? item.filename() : "unknown",
                date: null,
                favorite: false,
                description: null,
                keywords: [],
                albumNames: [],
                width: 0,
                height: 0
              };
            }
          });
        } catch (e) {
          return [];
        }
      },
      { text: searchText, limit }
    );

    return photos as Photo[];
  } catch (error) {
    console.error(`Error searching photos: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Search photos by date range
 * @param startDate Start date in ISO format
 * @param endDate End date in ISO format
 * @param limit Optional limit on the number of results
 * @returns Array of photos within the date range
 */
async function searchPhotosByDateRange(startDate: string, endDate: string, limit?: number): Promise<Photo[]> {
  try {
    if (!await checkPhotosAccess()) {
      return [];
    }

    const photos = await run(
      (args: { startDate: string; endDate: string; limit?: number }) => {
        try {
          const Photos = Application("Photos");
          const start = new Date(args.startDate);
          const end = new Date(args.endDate);
          
          // First get all photos
          const allMediaItems = Photos.mediaItems();
          
          // Filter by date range
          const filtered = allMediaItems.filter((item: any) => {
            try {
              const itemDate = item.date();
              if (!itemDate) return false;
              
              const photoDate = new Date(itemDate);
              return photoDate >= start && photoDate <= end;
            } catch (e) {
              return false;
            }
          });
          
          // Apply limit if specified
          const results = args.limit ? filtered.slice(0, args.limit) : filtered;
          
          return results.map((item: any) => {
            try {
              // Get albums this photo is in
              const containingAlbums = Photos.albums.whose({
                mediaItems: { id: item.id() }
              })();
              
              const albumNames = containingAlbums.map((album: any) => album.name());
              
              return {
                id: item.id(),
                filename: item.filename(),
                date: item.date() ? item.date().toISOString() : null,
                favorite: item.favorite(),
                description: item.description() || null,
                keywords: item.keywords ? item.keywords() : [],
                albumNames: albumNames,
                width: item.width(),
                height: item.height()
              };
            } catch (itemError) {
              return {
                id: item.id ? item.id() : "unknown",
                filename: item.filename ? item.filename() : "unknown",
                date: null,
                favorite: false,
                description: null,
                keywords: [],
                albumNames: [],
                width: 0,
                height: 0
              };
            }
          });
        } catch (e) {
          return [];
        }
      },
      { startDate, endDate, limit }
    );

    return photos as Photo[];
  } catch (error) {
    console.error(`Error searching photos by date range: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Get all favorite photos
 * @param limit Optional limit on the number of results
 * @returns Array of favorite photos
 */
async function getFavoritePhotos(limit?: number): Promise<Photo[]> {
  try {
    if (!await checkPhotosAccess()) {
      return [];
    }

    const photos = await run(
      (args: { limit?: number }) => {
        try {
          const Photos = Application("Photos");
          const favorites = Photos.mediaItems.whose({ favorite: true })();
          
          // Apply limit if specified
          const results = args.limit ? favorites.slice(0, args.limit) : favorites;
          
          return results.map((item: any) => {
            try {
              // Get albums this photo is in
              const containingAlbums = Photos.albums.whose({
                mediaItems: { id: item.id() }
              })();
              
              const albumNames = containingAlbums.map((album: any) => album.name());
              
              return {
                id: item.id(),
                filename: item.filename(),
                date: item.date() ? item.date().toISOString() : null,
                favorite: item.favorite(),
                description: item.description() || null,
                keywords: item.keywords ? item.keywords() : [],
                albumNames: albumNames,
                width: item.width(),
                height: item.height()
              };
            } catch (itemError) {
              return {
                id: item.id ? item.id() : "unknown",
                filename: item.filename ? item.filename() : "unknown",
                date: null,
                favorite: true, // We know it's a favorite
                description: null,
                keywords: [],
                albumNames: [],
                width: 0,
                height: 0
              };
            }
          });
        } catch (e) {
          return [];
        }
      },
      { limit }
    );

    return photos as Photo[];
  } catch (error) {
    console.error(`Error getting favorite photos: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Get all photos from memory collections (trips, holidays, etc.)
 * @param limit Optional limit on the number of memories to return
 * @returns Array of memory collections with their photos
 */
async function getMemories(limit?: number): Promise<{ title: string; date: string; photos: Photo[] }[]> {
  try {
    if (!await checkPhotosAccess()) {
      return [];
    }

    const memories = await run(
      (args: { limit?: number }) => {
        try {
          const Photos = Application("Photos");
          
          // Get memory collections
          let memoryCollections;
          try {
            memoryCollections = Photos.memories();
            if (args.limit) {
              memoryCollections = memoryCollections.slice(0, args.limit);
            }
          } catch (e) {
            return []; // In case memories are not available
          }
          
          return memoryCollections.map((memory: any) => {
            try {
              // Get photos in this memory
              const memoryPhotos = memory.mediaItems().map((item: any) => {
                try {
                  return {
                    id: item.id(),
                    filename: item.filename(),
                    date: item.date() ? item.date().toISOString() : null,
                    favorite: item.favorite(),
                    description: item.description() || null,
                    keywords: item.keywords ? item.keywords() : [],
                    albumNames: [memory.name()],
                    width: item.width(),
                    height: item.height()
                  };
                } catch (itemError) {
                  return {
                    id: item.id ? item.id() : "unknown",
                    filename: item.filename ? item.filename() : "unknown",
                    date: null,
                    favorite: false,
                    description: null,
                    keywords: [],
                    albumNames: [memory.name()],
                    width: 0,
                    height: 0
                  };
                }
              });
              
              return {
                title: memory.title(),
                date: memory.date() ? memory.date().toISOString() : new Date().toISOString(),
                photos: memoryPhotos
              };
            } catch (memError) {
              // If a memory fails, return it with minimal info
              return {
                title: memory.title ? memory.title() : "Unknown Memory",
                date: new Date().toISOString(),
                photos: []
              };
            }
          });
        } catch (e) {
          return [];
        }
      },
      { limit }
    );

    return memories as { title: string; date: string; photos: Photo[] }[];
  } catch (error) {
    console.error(`Error getting memories: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Get recent photos
 * @param limit Number of recent photos to get (default 20)
 * @returns Array of recent photos
 */
async function getRecentPhotos(limit: number = 20): Promise<Photo[]> {
  try {
    if (!await checkPhotosAccess()) {
      return [];
    }

    const photos = await run(
      (args: { limit: number }) => {
        try {
          const Photos = Application("Photos");
          
          // Get all photos, sorted by date descending
          const allMediaItems = Photos.mediaItems();
          const sortedByDate = allMediaItems.sort((a: any, b: any) => {
            try {
              const dateA = a.date();
              const dateB = b.date();
              if (!dateA && !dateB) return 0;
              if (!dateA) return 1;
              if (!dateB) return -1;
              
              // Convert to timestamp numbers for comparison
              const dateATime = new Date(dateA).getTime();
              const dateBTime = new Date(dateB).getTime();
              return dateBTime - dateATime;
            } catch (e) {
              return 0;
            }
          });
          
          // Take only the specified number
          const recentItems = sortedByDate.slice(0, args.limit);
          
          return recentItems.map((item: any) => {
            try {
              // Get albums this photo is in
              const containingAlbums = Photos.albums.whose({
                mediaItems: { id: item.id() }
              })();
              
              const albumNames = containingAlbums.map((album: any) => album.name());
              
              return {
                id: item.id(),
                filename: item.filename(),
                date: item.date() ? item.date().toISOString() : null,
                favorite: item.favorite(),
                description: item.description() || null,
                keywords: item.keywords ? item.keywords() : [],
                albumNames: albumNames,
                width: item.width(),
                height: item.height()
              };
            } catch (itemError) {
              return {
                id: item.id ? item.id() : "unknown",
                filename: item.filename ? item.filename() : "unknown",
                date: null,
                favorite: false,
                description: null,
                keywords: [],
                albumNames: [],
                width: 0,
                height: 0
              };
            }
          });
        } catch (e) {
          return [];
        }
      },
      { limit }
    );

    return photos as Photo[];
  } catch (error) {
    console.error(`Error getting recent photos: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Export a photo to a file
 * @param photoId ID of the photo to export
 * @param outputPath Path to save the exported photo
 * @returns Result of the export operation
 */
async function exportPhoto(photoId: string, outputPath: string): Promise<{ success: boolean; message: string; path?: string }> {
  try {
    if (!await checkPhotosAccess()) {
      return { success: false, message: "Cannot access Photos app" };
    }

    const result = await run(
      (args: { id: string; path: string }) => {
        try {
          const Photos = Application("Photos");
          const items = Photos.mediaItems.whose({ id: args.id })();
          
          if (items.length === 0) {
            return { success: false, message: "Photo not found" };
          }
          
          try {
            const item = items[0];
            const app = Application.currentApplication();
            app.includeStandardAdditions = true;
            
            // Create a temporary folder if needed
            const folderPath = args.path.substring(0, args.path.lastIndexOf('/'));
            app.doShellScript(`mkdir -p "${folderPath}"`);
            
            // Export the photo
            item.export({ to: Path(args.path) });
            
            return { 
              success: true, 
              message: "Photo exported successfully", 
              path: args.path 
            };
          } catch (e) {
            return { 
              success: false, 
              message: `Error exporting photo: ${e}` 
            };
          }
        } catch (e) {
          return { 
            success: false, 
            message: `Error accessing Photos app: ${e}` 
          };
        }
      },
      { id: photoId, path: outputPath }
    );

    return result as { success: boolean; message: string; path?: string };
  } catch (error) {
    return {
      success: false,
      message: `Error exporting photo: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Open a photo in the Photos app
 * @param photoId ID of the photo to open
 * @returns Result of the operation
 */
async function openPhoto(photoId: string): Promise<{ success: boolean; message: string }> {
  try {
    if (!await checkPhotosAccess()) {
      return { success: false, message: "Cannot access Photos app" };
    }

    const result = await run(
      (args: { id: string }) => {
        try {
          const Photos = Application("Photos");
          Photos.activate();
          
          const items = Photos.mediaItems.whose({ id: args.id })();
          
          if (items.length === 0) {
            return { success: false, message: "Photo not found" };
          }
          
          try {
            const item = items[0];
            item.show();
            return { success: true, message: "Photo opened in Photos app" };
          } catch (e) {
            return { success: false, message: `Error opening photo: ${e}` };
          }
        } catch (e) {
          return { success: false, message: `Error accessing Photos app: ${e}` };
        }
      },
      { id: photoId }
    );

    return result as { success: boolean; message: string };
  } catch (error) {
    return {
      success: false,
      message: `Error opening photo: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Get all people recognized in Photos
 * @returns Array of people names
 */
async function getPeople(): Promise<string[]> {
  try {
    if (!await checkPhotosAccess()) {
      return [];
    }

    const people = await run(() => {
      try {
        const Photos = Application("Photos");
        
        try {
          // Try to get albums whose kind is "person"
          const personAlbums = Photos.albums.whose({ kind: "person" })();
          return personAlbums.map((album: any) => album.name());
        } catch (e) {
          // Fallback if the 'kind' property is not available
          try {
            // Look for the "People" folder and get its albums
            const peopleFolder = Photos.folders.whose({ name: "People" })()[0];
            if (peopleFolder) {
              return peopleFolder.albums().map((album: any) => album.name());
            }
          } catch (e2) {
            // Another fallback - look for albums that might be person albums
            try {
              const allAlbums = Photos.albums();
              // Filter albums that are likely to be person albums (heuristic)
              return allAlbums
                .filter((album: any) => {
                  // Check if this has properties typical of a person album
                  try {
                    return album.name() && 
                           !album.name().includes("Family") && 
                           album.mediaItems().length > 0;
                  } catch {
                    return false;
                  }
                })
                .map((album: any) => album.name());
            } catch (e3) {
              return [];
            }
          }
        }
        return [];
      } catch (e) {
        return [];
      }
    });

    return people as string[];
  } catch (error) {
    console.error(`Error getting people: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Search for photos containing a specific person
 * @param personName Name of the person to search for
 * @param limit Optional limit on the number of results
 * @returns Array of photos containing the person
 */
async function getPhotosByPerson(personName: string, limit?: number): Promise<Photo[]> {
  try {
    if (!await checkPhotosAccess()) {
      return [];
    }

    const photos = await run(
      (args: { name: string; limit?: number }) => {
        try {
          const Photos = Application("Photos");
          
          try {
            // Try to find the person album
            const personAlbums = Photos.albums.whose({ name: args.name })();
            
            if (personAlbums.length === 0) {
              return [];
            }
            
            const personAlbum = personAlbums[0];
            let mediaItems = personAlbum.mediaItems();
            
            // Apply limit if specified
            if (args.limit && mediaItems.length > args.limit) {
              mediaItems = mediaItems.slice(0, args.limit);
            }
            
            return mediaItems.map((item: any) => {
              try {
                return {
                  id: item.id(),
                  filename: item.filename(),
                  date: item.date() ? item.date().toISOString() : null,
                  favorite: item.favorite(),
                  description: item.description() || null,
                  keywords: item.keywords ? item.keywords() : [],
                  albumNames: [personAlbum.name()],
                  width: item.width(),
                  height: item.height()
                };
              } catch (itemError) {
                return {
                  id: item.id ? item.id() : "unknown",
                  filename: item.filename ? item.filename() : "unknown",
                  date: null,
                  favorite: false,
                  description: null,
                  keywords: [],
                  albumNames: [personAlbum.name()],
                  width: 0,
                  height: 0
                };
              }
            });
          } catch (e) {
            return [];
          }
        } catch (e) {
          return [];
        }
      },
      { name: personName, limit }
    );

    return photos as Photo[];
  } catch (error) {
    console.error(`Error getting photos by person: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Find all screenshots in the Photos library using multiple methods
 * @param limit Optional limit on the number of results
 * @returns Array of screenshot photos
 */
async function findScreenshots(limit?: number): Promise<Photo[]> {
  try {
    if (!await checkPhotosAccess()) {
      return [];
    }

    const photos = await run(
      (args: { limit?: number }) => {
        try {
          const Photos = Application("Photos");
          const allMediaItems = Photos.mediaItems();
          
          // Use multiple methods to identify screenshots
          const screenshots = allMediaItems.filter((item: any) => {
            try {
              // 1. Check filename for "Screenshot" or "Screen Shot"
              const filename = item.filename ? item.filename() : "";
              if (filename.includes("Screenshot") || filename.includes("Screen Shot") || 
                  filename.includes("screenshot") || filename.includes("screen shot")) {
                return true;
              }
              
              // 2. Check if it's in a Screenshots album
              try {
                const containingAlbums = Photos.albums.whose({
                  mediaItems: { id: item.id() }
                })();
                
                for (const album of containingAlbums) {
                  const albumName = album.name();
                  if (albumName.includes("Screenshot") || albumName.includes("Screen Shot") ||
                      albumName.includes("screenshot") || albumName.includes("screen shot")) {
                    return true;
                  }
                }
              } catch (e) {
                // Continue if we can't check albums
              }
              
              // 3. Check keywords for "screenshot"
              try {
                const keywords = item.keywords ? item.keywords() : [];
                for (const keyword of keywords) {
                  if (keyword.toLowerCase().includes("screenshot") || 
                      keyword.toLowerCase().includes("screen shot")) {
                    return true;
                  }
                }
              } catch (e) {
                // Continue if we can't check keywords
              }
              
              // 4. Check if it's a PNG file (most screenshots are PNG)
              if (filename.toLowerCase().endsWith(".png")) {
                // Additional check for screenshot dimensions (typically they match device screen size)
                // or check if it was created by system screenshot tool
                try {
                  const description = item.description ? item.description() : "";
                  if (description.includes("Screenshot") || description.includes("Screen Shot")) {
                    return true;
                  }
                } catch (e) {
                  // Continue if we can't check description
                }
              }
              
              return false;
            } catch (e) {
              return false;
            }
          });
          
          // Apply limit if specified
          const results = args.limit ? screenshots.slice(0, args.limit) : screenshots;
          
          return results.map((item: any) => {
            try {
              // Get albums this photo is in
              const containingAlbums = Photos.albums.whose({
                mediaItems: { id: item.id() }
              })();
              
              const albumNames = containingAlbums.map((album: any) => album.name());
              
              return {
                id: item.id(),
                filename: item.filename(),
                date: item.date() ? item.date().toISOString() : null,
                favorite: item.favorite(),
                description: item.description() || null,
                keywords: item.keywords ? item.keywords() : [],
                albumNames: albumNames,
                width: item.width(),
                height: item.height()
              };
            } catch (itemError) {
              return {
                id: item.id ? item.id() : "unknown",
                filename: item.filename ? item.filename() : "unknown",
                date: null,
                favorite: false,
                description: null,
                keywords: [],
                albumNames: [],
                width: 0,
                height: 0
              };
            }
          });
        } catch (e) {
          return [];
        }
      },
      { limit }
    );

    return photos as Photo[];
  } catch (error) {
    console.error(`Error finding screenshots: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

export default {
  getAllAlbums,
  getPhotosFromAlbum,
  searchPhotosByText,
  searchPhotosByDateRange,
  getFavoritePhotos,
  getMemories,
  getRecentPhotos,
  exportPhoto,
  openPhoto,
  getPeople,
  getPhotosByPerson,
  findScreenshots,
}; 