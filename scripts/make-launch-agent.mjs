import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { root, readTunnelConfig } from "./tunnel-config.mjs";

const xml = s => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
try {
  readTunnelConfig();
  const logDir = resolve(homedir(), "Library/Logs/PersonalAppleMCP");
  const output = resolve(root, "build/com.personal.apple-mcp.plist");
  mkdirSync(resolve(root, "build"), { recursive: true });
  writeFileSync(output, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.personal.apple-mcp</string>
<key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(resolve(root, "scripts/run-tunnel.mjs"))}</string></array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>30</integer>
<key>StandardOutPath</key><string>${xml(resolve(logDir, "tunnel.log"))}</string>
<key>StandardErrorPath</key><string>${xml(resolve(logDir, "tunnel-error.log"))}</string>
</dict></plist>`, { mode: 0o600 });
  console.log(`Created ${output}. No service was installed or started.`);
} catch {
  console.error("Set tunnel.local.json on the home Mac before making the login service.");
  process.exitCode = 1;
}
