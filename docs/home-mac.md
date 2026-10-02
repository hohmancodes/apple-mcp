# Home Mac setup

Use the Mac that will stay at home, signed into your Apple account.
This setup first connects fake data. Enable real data only after your dot can call the fake server.

## Build on the home Mac

Install Homebrew if needed. Install Node 24, the OpenAI tunnel client, and Apple's command line build tools:

```sh
brew install node@24 openai/tools/tunnel-client
xcode-select --install
export PATH="$(brew --prefix node@24)/bin:$PATH"
```

Clone this fork into a folder you will keep. These commands use the development branch until its pull request is merged:

```sh
git clone --branch codex/home-mac-bridge https://github.com/hohmancodes/apple-mcp.git PersonalAppleMCP
cd PersonalAppleMCP
npm ci --ignore-scripts
npm test
npm run build:calendar
```

The Calendar build compiles a local helper. It does not run it or read events.

## Create a private tunnel

Open [OpenAI Platform Tunnels](https://platform.openai.com/settings/organization/tunnels).
Use your personal Platform organization and your personal ChatGPT workspace.
Create a tunnel and keep its tunnel ID.
Keep use of this tunnel limited to you.

The person who creates it needs Tunnels Read + Manage.
The runtime key's owner needs Tunnels Read + Use.
Create a separate runtime API key at [Platform API keys](https://platform.openai.com/settings/organization/api-keys).
Use the runtime key for the home Mac, not an admin key.
Do not paste the key into chat, Git, a command argument, or a settings file.

Open Keychain Access on the home Mac. In the login keychain, create a password item:

- Item name: `personal-apple-mcp-tunnel`
- Account: `personal-apple-mcp`
- Password: the runtime API key

Keep Keychain's access prompts enabled. Allow the local launcher to read this item when asked.
The launcher captures the key in memory and passes it to the tunnel process through its environment.
It never prints the key. The Apple server removes it from its own environment at startup.

Create the local tunnel settings:

```sh
cp tunnel.example.json tunnel.local.json
chmod 600 tunnel.local.json
command -v tunnel-client
```

Edit `tunnel.local.json`. Set `tunnelId` to the real ID.
Set `clientPath` to the full path from `command -v tunnel-client`.
Keep `mode` as `mock`.
The example uses the Keychain names above.
Local settings files are ignored by Git.

## Prove the remote link with fake data

In the repo folder, start the tunnel in the foreground:

```sh
npm run tunnel
```

In another terminal on that Mac, check readiness:

```sh
curl --fail http://127.0.0.1:8087/readyz
```

The local health page is on loopback only. Do not expose it through the router.
The tunnel must stay running for discovery and tool calls.
Run only one tunnel process for a given tunnel ID. Stop the old process before starting another.

In ChatGPT, open Plugins and add a developer-mode app.
Choose the Tunnel connection and this tunnel ID.
Enable that app for your dot if your account exposes that choice.
The exact UI and dot support must be checked in your account.

Ask your dot:

> Call bridge_status. Then call bridge_echo with text "home Mac test". Tell me the mode and echoed text.

It must report `mock`, `synthetic: true`, and `home Mac test`.
Then ask it to list tools. There must be no write or shell tools.
Stop here if the app cannot be enabled for your dot. Do not enable real data to work around a connection failure.

## Choose real sources

Stop the foreground tunnel with Control-C.

```sh
cp config.example.json config.local.json
chmod 600 config.local.json
```

Edit `config.local.json` with the exact sources you allow:

- Notes: account name and folder name together.
- Mail: account name and mailbox name together.
- Calendar: a unique calendar name. Duplicate names fail closed.
- Messages: the exact chat ID from Messages' local database. A contact's display name is not a chat ID.

Use `[]` for apps you do not want to share. Delete all example names.
The server has no remote tool that lists every account or chat.
Start with one test folder, mailbox, calendar, or chat.
Pick sources locally on the home Mac, not through an unrestricted remote discovery tool.
You can use a SQLite viewer locally to inspect the `chat_identifier` column in `~/Library/Messages/chat.db` if you need a chat ID. Keep that database local.

The default limits are 25 results, a 31-day date window, and 64 KiB per response.
Calendar and message dates use midnight in the home Mac's time zone. The end date is exclusive.
Message search matches stored text; Apple's archived rich text search can miss results.
Notes return their HTML body; attachments and locked note content may not be readable.
A note ID can change if Apple recreates or moves the note. List the chosen folder again if an ID stops working.
Mail searches subjects or senders. Read a specific mail ID for its body.
Mailboxes with duplicate names inside an account fail closed. Start with a simple mailbox such as INBOX.

Set `mode` to `apple` in `tunnel.local.json`. Start `npm run tunnel` again.
Ask for `bridge_status` and `bridge_scopes` first. They read no app content.
Then make one small read from each chosen source.

macOS will need local access grants:

- Notes and Mail: allow Automation when macOS asks. Keep those apps set up and able to open.
- Calendar: allow access to Calendars for the compiled helper when macOS asks.
- Messages: Full Disk Access for the Node executable that reads `chat.db`. A terminal grant alone may not cover a login service.

These system grants can be broader than the chosen sources. The server enforces the source limits before each read.
Full Calendar read access is named “full access” by Apple; the bridge still exposes only read tools.
Do these steps while logged into the home Mac. Permission prompts cannot be answered through the tunnel.

## Start after login

Only install this on the home Mac after the foreground tunnel works.
Stop the foreground process first.

```sh
npm run service:make
plutil -lint build/com.personal.apple-mcp.plist
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/PersonalAppleMCP"
cp build/com.personal.apple-mcp.plist "$HOME/Library/LaunchAgents/com.personal.apple-mcp.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.personal.apple-mcp.plist"
curl --fail http://127.0.0.1:8087/readyz
```

The generator records the current absolute Node and repo paths. Regenerate it after moving the repo or changing Node.
The login service runs as your user. It starts after login, not before FileVault unlock.
It retries after a crash. It does not change sleep or power settings.

Check the dot while the screen is locked. Then reboot, unlock FileVault, log in, and check again.
Allow the Mac to stay awake on power in System Settings if it sleeps between calls.
The login keychain must remain available to the service.
If reads fail after lock, check the Apple app and Keychain permissions locally.
Do not claim the home Mac is ready until these checks pass.

Logs are in `~/Library/Logs/PersonalAppleMCP`. Keep normal logging; do not turn on payload capture or debug body logs for real data.
The Apple bridge suppresses app error content. Treat tunnel logs as private.
There is no automatic source update. Review changes, stop the service, rebuild, and start again.

## Stop, remove, or revoke

Stop the login service:

```sh
launchctl bootout "gui/$(id -u)/com.personal.apple-mcp"
```

Remove its login entry:

```sh
rm "$HOME/Library/LaunchAgents/com.personal.apple-mcp.plist"
```

Disable the app in ChatGPT to remove dot access.
Revoke the runtime API key in Platform and remove the Keychain item if the Mac or key is lost.
Delete the tunnel in Platform when you no longer need it.
Stopping this bridge does not stop LMCP. Remove LMCP separately once this replacement is proven.

## Trust and sources

The path is dot → OpenAI tunnel service → home tunnel client → this Apple bridge.
Both directions use HTTPS. No public Apple server or inbound router port is needed.
This is not encryption that hides content from OpenAI: OpenAI terminates the connection and receives tool results.
The runtime key authenticates the Mac. Platform tunnel permissions and the linked ChatGPT workspace control callers.
This first version is for your own private developer-mode app, not public plugin distribution.

- [OpenAI Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [Open-source tunnel client](https://github.com/openai/tunnel-client)
- [Tunnel client configuration](https://github.com/openai/tunnel-client/blob/v0.0.15/docs/configuration.md)
- [Tunnel permissions](https://github.com/openai/tunnel-client/blob/v0.0.15/docs/permissions.md)
- [Dot apps](https://learn.chatgpt.com/docs/dots/computers-and-apps)
