# Apple MCP tools

[![smithery badge](https://smithery.ai/badge/@Dhravya/apple-mcp)](https://smithery.ai/server/@Dhravya/apple-mcp)

This is a collection of apple-native tools for the [MCP protocol](https://modelcontextprotocol.com/docs/mcp-protocol).

Here's a step-by-step video about how to set this up, with a demo. - https://x.com/DhravyaShah/status/1892694077679763671

<a href="https://glama.ai/mcp/servers/gq2qg6kxtu">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/gq2qg6kxtu/badge" alt="Apple Server MCP server" />
</a>

![image](https://github.com/user-attachments/assets/56a5ccfa-cb1a-4226-80c5-6cc794cefc34)


<details>
<summary>Here's the JSON to copy</summary>

```
{
  "mcpServers": {
    "apple-mcp": {
      "command": "bunx",
      "args": ["--no-cache", "apple-mcp@latest"]
    }
}

```

</details>

#### Quick install

To install Apple MCP for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@Dhravya/apple-mcp):

```bash
npx -y @smithery/cli@latest install @Dhravya/apple-mcp --client claude
```

... and for cursor, you can do:

```bash
npx -y @smithery/cli@latest install @Dhravya/apple-mcp --client cursor
```


## Features

- Messages:
  - Send messages using the Apple Messages app
  - Read out messages
- Notes:
  - List notes
  - Search & read notes in Apple Notes app
- Contacts:
  - Search contacts for sending messages
- Emails:
  - Send emails with multiple recipients (to, cc, bcc) and file attachments
  - Search emails with custom queries, mailbox selection, and result limits
  - Schedule emails for future delivery
  - List and manage scheduled emails
  - Check unread email counts globally or per mailbox
- Reminders:
  - List all reminders and reminder lists
  - Search for reminders by text
  - Create new reminders with optional due dates and notes
  - Open the Reminders app to view specific reminders
- Calendar:
  - Search calendar events with customizable date ranges
  - List upcoming events
  - Create new calendar events with details like title, location, and notes
  - Open calendar events in the Calendar app
- Web Search:
  - Search the web using DuckDuckGo
  - Retrieve and process content from search results
- Maps:
  - Search for locations and addresses
  - Save locations to favorites
  - Get directions between locations
  - Drop pins on the map
  - Create and list guides
  - Add places to guides
- Music:
  - Search for songs, albums, artists, and playlists
  - Play specific tracks by name and artist
  - Control playback (play, pause, next, previous)
  - Get current playing track information

- TODO: Search and open photos in Apple Photos app


You can also daisy-chain commands to create a workflow. Like:
"can you please read the note about people i met in the conference, find their contacts and emails, and send them a message saying thank you for the time."

(it works!)

Or with music:
"search for some pop music and play a Taylor Swift track"


#### Manual installation

You just need bun, install with `brew install oven-sh/bun/bun`

Now, edit your `claude_desktop_config.json` with this:

```claude_desktop_config.json
{
  "mcpServers": {
    "apple-mcp": {
      "command": "bunx",
      "args": ["@dhravya/apple-mcp@latest"]
    }
  }
}
```

### Usage

Now, ask Claude to use the `apple-mcp` tool.

```
Can you send a message to John Doe?
```

```
find all the notes related to AI and send it to my girlfriend
```

```
create a reminder to "Buy groceries" for tomorrow at 5pm
```

## Local Development

```bash
git clone https://github.com/dhravya/apple-mcp.git
cd apple-mcp
bun install
bun run index.ts
```

enjoy!
