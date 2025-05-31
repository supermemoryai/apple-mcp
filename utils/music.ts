import { run } from '@jxa/run';
import { runAppleScript } from 'run-applescript';

interface Track {
  name: string;
  artist: string;
  album: string;
  duration: number;
  id: string;
  year?: number;
  genre?: string;
}

interface Album {
  name: string;
  artist: string;
  year?: number;
  trackCount: number;
  id: string;
}

interface Artist {
  name: string;
  id: string;
}

interface Playlist {
  name: string;
  trackCount: number;
  id: string;
}

interface SearchResult {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
}

async function checkMusicAccess(): Promise<boolean> {
  try {
    await runAppleScript(`
tell application "Music"
    get name
end tell`);
    return true;
  } catch (error) {
    throw new Error("Cannot access Music app. Please make sure Apple Music is installed and grant access in System Preferences > Security & Privacy > Privacy > Automation.");
  }
}

/**
 * Search for music content in Apple Music (local library only)
 * @param query Search query for tracks, albums, artists, or playlists
 * @param type Optional filter for search type: 'tracks', 'albums', 'artists', 'playlists', or 'all'
 * @param limit Maximum number of results per category
 */
async function searchMusic(
  query: string, 
  type: 'tracks' | 'albums' | 'artists' | 'playlists' | 'all' = 'all', 
  limit: number = 10
): Promise<SearchResult> {
  try {
    if (!await checkMusicAccess()) {
      return { tracks: [], albums: [], artists: [], playlists: [] };
    }

    console.error(`searchMusic - Searching local library for: "${query}", type: "${type}"`);

    // Use AppleScript for more reliable searching of local library
    const escapedQuery = query.replace(/"/g, '\\"');
    
    let script = `
tell application "Music"
    set searchResults to ""
    
    try
        set tracksList to ""
        set albumsList to ""
        set artistsList to ""
        set playlistsList to ""
        
        -- Search tracks (if requested)
        if "${type}" is "tracks" or "${type}" is "all" then
            set foundTracks to (every track whose name contains "${escapedQuery}")
            set trackCount to 0
            repeat with aTrack in foundTracks
                if trackCount < ${limit} then
                    set trackName to name of aTrack
                    set trackArtist to artist of aTrack
                    set trackAlbum to album of aTrack
                    set tracksList to tracksList & "TRACK:" & trackName & "|" & trackArtist & "|" & trackAlbum & "\\n"
                    set trackCount to trackCount + 1
                end if
            end repeat
        end if
        
        -- Search albums (if requested)
        if "${type}" is "albums" or "${type}" is "all" then
            set foundTracks to (every track whose album contains "${escapedQuery}")
            set albumMap to {}
            set albumCount to 0
            repeat with aTrack in foundTracks
                if albumCount < ${limit} then
                    set albumName to album of aTrack
                    set albumArtist to artist of aTrack
                    set albumKey to albumName & "|" & albumArtist
                    -- Simple duplicate checking
                    if albumMap does not contain albumKey then
                        set albumsList to albumsList & "ALBUM:" & albumName & "|" & albumArtist & "\\n"
                        set end of albumMap to albumKey
                        set albumCount to albumCount + 1
                    end if
                end if
            end repeat
        end if
        
        -- Search artists (if requested)
        if "${type}" is "artists" or "${type}" is "all" then
            set foundTracks to (every track whose artist contains "${escapedQuery}")
            set artistMap to {}
            set artistCount to 0
            repeat with aTrack in foundTracks
                if artistCount < ${limit} then
                    set artistName to artist of aTrack
                    if artistMap does not contain artistName then
                        set artistsList to artistsList & "ARTIST:" & artistName & "\\n"
                        set end of artistMap to artistName
                        set artistCount to artistCount + 1
                    end if
                end if
            end repeat
        end if
        
        -- Search playlists (if requested)
        if "${type}" is "playlists" or "${type}" is "all" then
            set foundPlaylists to (every playlist whose name contains "${escapedQuery}")
            set playlistCount to 0
            repeat with aPlaylist in foundPlaylists
                if playlistCount < ${limit} then
                    set playlistName to name of aPlaylist
                    set trackCount to count of tracks of aPlaylist
                    set playlistsList to playlistsList & "PLAYLIST:" & playlistName & "|" & trackCount & "\\n"
                    set playlistCount to playlistCount + 1
                end if
            end repeat
        end if
        
        return tracksList & albumsList & artistsList & playlistsList
        
    on error errMsg
        return "ERROR: " & errMsg
    end try
end tell`;

    const result = await runAppleScript(script);
    
    if (result.startsWith("ERROR:")) {
      throw new Error(result.substring(7));
    }

    // Parse the results
    const searchResults: SearchResult = {
      tracks: [],
      albums: [],
      artists: [],
      playlists: []
    };

    const lines = result.split('\n').filter(line => line.trim() !== '');
    
    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length >= 2) {
        const type = parts[0];
        const data = parts[1].split('|');
        
        switch (type) {
          case 'TRACK':
            if (data.length >= 3) {
              searchResults.tracks.push({
                name: data[0],
                artist: data[1],
                album: data[2],
                duration: 0, // Not easily available via AppleScript
                id: '', // Not easily available via AppleScript
                year: undefined,
                genre: undefined
              });
            }
            break;
          case 'ALBUM':
            if (data.length >= 2) {
              searchResults.albums.push({
                name: data[0],
                artist: data[1],
                year: undefined,
                trackCount: 0, // Would require additional query
                id: ''
              });
            }
            break;
          case 'ARTIST':
            if (data.length >= 1) {
              searchResults.artists.push({
                name: data[0],
                id: ''
              });
            }
            break;
          case 'PLAYLIST':
            if (data.length >= 2) {
              searchResults.playlists.push({
                name: data[0],
                trackCount: parseInt(data[1]) || 0,
                id: ''
              });
            }
            break;
        }
      }
    }

    return searchResults;
  } catch (error) {
    throw new Error(`Error searching music: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Play a specific track by name and artist
 * @param trackName Name of the track
 * @param artistName Optional artist name for more precise matching
 */
async function playTrack(trackName: string, artistName?: string): Promise<{ success: boolean; message: string }> {
  try {
    if (!await checkMusicAccess()) {
      return {
        success: false,
        message: "Cannot access Music app. Please grant access in System Settings."
      };
    }

    console.error(`playTrack - Playing: "${trackName}"${artistName ? ` by ${artistName}` : ''}`);

    const escapedTrackName = trackName.replace(/"/g, '\\"');
    const escapedArtistName = artistName ? artistName.replace(/"/g, '\\"') : '';

    let script = `
tell application "Music"
    activate
    
    set foundTracks to {}
    
    try
        -- Search for tracks matching the name
        if "${escapedArtistName}" is not "" then
            -- Search with both track name and artist
            set allTracks to (every track whose name contains "${escapedTrackName}" and artist contains "${escapedArtistName}")
        else
            -- Search with just track name
            set allTracks to (every track whose name contains "${escapedTrackName}")
        end if
        
        if (count of allTracks) is 0 then
            return "No tracks found matching \\"${escapedTrackName}\\"${artistName ? ` by ${escapedArtistName}` : ''}"
        end if
        
        -- Get the first matching track
        set selectedTrack to item 1 of allTracks
        
        -- Try to play the track
        play selectedTrack
        
        -- Get track details for confirmation
        set trackName to name of selectedTrack
        set trackArtist to artist of selectedTrack
        set trackAlbum to album of selectedTrack
        
        return "SUCCESS: Now playing: \\"" & trackName & "\\" by " & trackArtist & " from " & trackAlbum
        
    on error errMsg
        return "ERROR: " & errMsg
    end try
    
end tell`;

    const result = await runAppleScript(script);
    
    if (result.startsWith("SUCCESS:")) {
      return {
        success: true,
        message: result.substring(9) // Remove "SUCCESS: " prefix
      };
    } else if (result.startsWith("ERROR:")) {
      return {
        success: false,
        message: result.substring(7) // Remove "ERROR: " prefix
      };
    } else {
      return {
        success: false,
        message: result
      };
    }

  } catch (error) {
    return {
      success: false,
      message: `Error playing track: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Get current playback information
 */
async function getCurrentTrack(): Promise<{ success: boolean; message: string; track?: Track }> {
  try {
    if (!await checkMusicAccess()) {
      return {
        success: false,
        message: "Cannot access Music app. Please grant access in System Settings."
      };
    }

    const script = `
tell application "Music"
    try
        set currentTrack to current track
        
        if currentTrack is missing value then
            return "NO_TRACK"
        end if
        
        set trackName to name of currentTrack
        set trackArtist to artist of currentTrack
        set trackAlbum to album of currentTrack
        set trackDuration to duration of currentTrack
        
        set playerState to player state
        set playerPos to player position
        
        set stateText to ""
        if playerState is playing then
            set stateText to "playing"
        else if playerState is paused then
            set stateText to "paused"
        else if playerState is stopped then
            set stateText to "stopped"
        else
            set stateText to "unknown"
        end if
        
        return "SUCCESS:" & trackName & "|" & trackArtist & "|" & trackAlbum & "|" & trackDuration & "|" & stateText & "|" & playerPos
        
    on error errMsg
        return "ERROR:" & errMsg
    end try
end tell`;

    const result = await runAppleScript(script);
    
    if (result === "NO_TRACK") {
      return {
        success: true,
        message: "No track is currently playing"
      };
    }
    
    if (result.startsWith("ERROR:")) {
      return {
        success: false,
        message: result.substring(6)
      };
    }
    
    if (result.startsWith("SUCCESS:")) {
      const data = result.substring(8).split('|');
      if (data.length >= 6) {
        const track: Track = {
          name: data[0],
          artist: data[1],
          album: data[2],
          duration: parseFloat(data[3]) || 0,
          id: '',
          year: undefined,
          genre: undefined
        };
        
        const state = data[4];
        const position = parseFloat(data[5]) || 0;
        
        return {
          success: true,
          message: `Currently ${state}: "${track.name}" by ${track.artist} (${Math.floor(position)}s/${Math.floor(track.duration)}s)`,
          track
        };
      }
    }
    
    return {
      success: false,
      message: "Unable to get current track information"
    };

  } catch (error) {
    return {
      success: false,
      message: `Error getting current track: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Control music playback
 * @param action Action to perform: 'play', 'pause', 'next', 'previous'
 */
async function controlPlayback(action: 'play' | 'pause' | 'next' | 'previous'): Promise<{ success: boolean; message: string }> {
  try {
    if (!await checkMusicAccess()) {
      return {
        success: false,
        message: "Cannot access Music app. Please grant access in System Settings."
      };
    }

    const result = await run((args: { action: string }) => {
      try {
        const Music = Application('Music');
        
        switch (args.action) {
          case 'play':
            Music.play();
            return { success: true, message: "Resumed playback" };
          case 'pause':
            Music.pause();
            return { success: true, message: "Paused playback" };
          case 'next':
            Music.nextTrack();
            return { success: true, message: "Skipped to next track" };
          case 'previous':
            Music.previousTrack();
            return { success: true, message: "Went to previous track" };
          default:
            return { success: false, message: `Unknown action: ${args.action}` };
        }
      } catch (e) {
        return {
          success: false,
          message: `Error controlling playback: ${e}`
        };
      }
    }, { action });

    return result;
  } catch (error) {
    return {
      success: false,
      message: `Error controlling playback: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export default {
  searchMusic,
  playTrack,
  getCurrentTrack,
  controlPlayback
}; 