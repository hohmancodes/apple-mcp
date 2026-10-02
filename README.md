# Personal Apple MCP

A private, read-only bridge for Apple Notes, Mail, Calendar, and Messages.
Run it on a home Mac signed into your Apple account.
Connect it to your ChatGPT dot through OpenAI Secure MCP Tunnel.

This is a fork of [griches/apple-mcp](https://github.com/griches/apple-mcp).
The root server is new. It uses the fork's Apple read adapters.
The old app packages are still here; they are not used as remote servers.
The `@griches` npm packages do not contain this fork's fixes.

## What it allows

- Read only the Notes account and folder pairs you choose.
- Read only the Mail account and mailbox pairs you choose.
- Read only the calendars and chat IDs you choose.
- Limit result counts, date ranges, and response size.

There are no send, edit, delete, shell, file, or arbitrary script tools in the root server.
An empty source list disables that app's tools.
Real reads require both `--apple` and a local settings file.
The default uses fake data and opens no Apple app or Messages database.

## Try fake data

Use Node 24:

```sh
npm ci --ignore-scripts
npm test
npm start
```

`npm start` speaks MCP over standard input/output. It waits for an MCP client.
Use `bridge_status`, `bridge_scopes`, and `bridge_echo` to check a connection.

## Set up the home Mac

Follow [the home Mac setup](docs/home-mac.md).
It starts with fake data, then tests your dot, then enables the sources you choose.
It includes a login service generator and stop/remove steps.

The tunnel connects out over HTTPS. No home router port is opened.
A runtime API key authenticates the Mac. ChatGPT sign-in and tunnel permissions govern remote use.
OpenAI can see the content sent through this link. This removes LMCP from the path, not OpenAI.
See [OpenAI's tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

## Current state

Local tests use fake data only. They also try every write tool in the four old servers with `--read-only` and require it to fail.
The Calendar helper compiles on macOS without running or reading events.
Real Apple reads, remote dot calls, and lock/reboot behavior still need a home Mac test.

[Upstream documentation](docs/upstream-readme.md) is preserved for reference.
Contacts, Reminders, and Maps are outside this bridge's scope.
