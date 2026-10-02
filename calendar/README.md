# @griches/apple-calendar-mcp

For this fork’s private home Mac bridge, use the [root setup](../README.md). The `@griches` npm releases do not include these changes. This app server supports `--read-only`, which removes every write tool.

An [MCP](https://modelcontextprotocol.io) server that gives AI assistants access to Apple Calendar on macOS. Read operations use EventKit directly for fast, reliable access; write operations use AppleScript.

## Quick Start

```bash
npx @griches/apple-calendar-mcp
```

## Tools

| Tool | Description |
|------|-------------|
| `list_calendars` | List all calendars |
| `list_all_events` | List events across all calendars within a date range |
| `list_events` | List events in a specific calendar within a date range |
| `get_event` | Get full details of an event by summary/title, including alerts |
| `create_event` | Create a new event with date, time, location, description, and optional alerts |
| `update_event` | Update an existing event's details, including alerts |
| `delete_event` | Delete an event by summary/title |
| `search_events` | Search events by summary/title across calendars |

### `create_event` parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `calendar` | string | ✅ | Name of the target calendar |
| `summary` | string | ✅ | Event title |
| `start_date` | string | ✅ | Start date/time, e.g. `"15 March 2026 at 2:00 PM"` |
| `end_date` | string | ✅ | End date/time |
| `location` | string | — | Event location |
| `description` | string | — | Notes for the event |
| `all_day` | boolean | — | Mark as an all-day event |
| `alert_minutes` | number \| number[] | — | Minutes before the event to send an alert, e.g. `30` or `[30, 120]` for multiple alerts |

### `update_event` parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `summary` | string | ✅ | Current event title (used to find the event) |
| `calendar` | string | — | Calendar to search in (all calendars if omitted) |
| `new_summary` | string | — | New event title |
| `start_date` | string | — | New start date/time |
| `end_date` | string | — | New end date/time |
| `location` | string | — | New location |
| `description` | string | — | New notes |
| `all_day` | boolean | — | All-day flag |
| `alert_minutes` | number \| number[] | — | Replace all alerts with these values. Pass `[]` to remove all alerts. Omit to leave alerts unchanged. |

### `get_event` response

`get_event` returns the full event details including an `alarms` array:

```json
{
  "summary": "Team Meeting",
  "startDate": "Monday, 15 March 2026 at 2:00:00 PM",
  "endDate": "Monday, 15 March 2026 at 3:00:00 PM",
  "location": "Conference Room A",
  "description": null,
  "url": null,
  "allDay": false,
  "alerts": [
    { "offsetMinutes": 30 },
    { "offsetMinutes": 120 }
  ]
}
```

## Configuration

### Claude Code

```bash
claude mcp add apple-calendar -- npx @griches/apple-calendar-mcp
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apple-calendar": {
      "command": "npx",
      "args": ["@griches/apple-calendar-mcp"]
    }
  }
}
```

## Requirements

- **macOS 13+**
- **Node.js** 24

## License

MIT — see the [main repository](https://github.com/griches/apple-mcp) for full details.
