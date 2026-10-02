import { readFileSync, existsSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../", import.meta.url));
export function readTunnelConfig() {
  const settings = JSON.parse(readFileSync(resolve(root, "tunnel.local.json"), "utf8"));
  const fields = ["tunnelId", "clientPath", "keychainService", "keychainAccount", "mode"];
  if (Object.keys(settings).some(k => !fields.includes(k))) throw new Error("Unknown tunnel setting.");
  if (!/^tunnel_[a-zA-Z0-9_-]+$/.test(settings.tunnelId) || settings.tunnelId.includes("YOUR")) throw new Error("Set the tunnel ID.");
  if (!isAbsolute(settings.clientPath) || !existsSync(settings.clientPath)) throw new Error("Set the full path to tunnel-client.");
  for (const k of ["keychainService", "keychainAccount"]) {
    if (typeof settings[k] !== "string" || !settings[k].length || settings[k].length > 512 || /[\x00-\x1f]/.test(settings[k])) throw new Error("Set the Keychain item name and account.");
  }
  if (!["mock", "apple"].includes(settings.mode)) throw new Error("Choose mock or apple mode.");
  return settings;
}

export function quoteCommandPart(value) {
  if (/[\x00\r\n]/.test(value)) throw new Error("Invalid command path.");
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function tunnelArguments(settings, nodePath = process.execPath) {
  const command = [nodePath, resolve(root, "build/src/index.js"), settings.mode === "apple" ? "--apple" : "--mock"];
  if (settings.mode === "apple") command.push("--config", resolve(root, "config.local.json"));
  return ["run", "--control-plane.tunnel-id", settings.tunnelId, "--control-plane.api-key", "env:CONTROL_PLANE_API_KEY", "--mcp.command", command.map(quoteCommandPart).join(" "), "--health.listen-addr", "127.0.0.1:8087", "--log.level", "warn"];
}
