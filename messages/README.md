# @griches/apple-messages-mcp

For this fork’s private home Mac bridge, use the [root setup](../README.md). The `@griches` npm releases do not include these changes. This app server supports `--read-only`, which removes every write tool.

An [MCP](https://modelcontextprotocol.io) server that gives AI assistants access to Apple Messages on macOS. Reads messages from the Messages database (SQLite) and sends messages via AppleScript.

## Quick Start

```bash
npx @griches/apple-messages-mcp
```

## Tools

| Tool | Description |
|------|-------------|
| `list_chats` | List recent chats with last message preview |
| `get_chat_messages` | Get message history for a specific chat (with optional date range filtering) |
| `search_messages` | Search messages by text content |
| `send_message` | Send an iMessage or SMS |
| `get_chat_participants` | Get participants of a chat |

## Configuration

### Claude Code

```bash
claude mcp add apple-messages -- npx @griches/apple-messages-mcp
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apple-messages": {
      "command": "npx",
      "args": ["@griches/apple-messages-mcp"]
    }
  }
}
```

## Requirements

- **macOS** (uses AppleScript and macOS Messages database)
- **Node.js** 24 (uses built-in `node:sqlite`)
- **Full Disk Access** granted to your terminal app (System Settings > Privacy & Security > Full Disk Access) — required for reading the Messages database

## Permissions

- **Reading messages**: Requires Full Disk Access for your terminal app to read `~/Library/Messages/chat.db`
- **Sending messages**: macOS will prompt you to allow your terminal app to control the Messages app via AppleScript

## License

MIT — see the [main repository](https://github.com/griches/apple-mcp) for full details.
