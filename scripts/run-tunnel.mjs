import { execFileSync, spawn } from "node:child_process";
import { readTunnelConfig, tunnelArguments, root } from "./tunnel-config.mjs";

let child;
try {
  if (process.platform !== "darwin") throw new Error();
  const settings = readTunnelConfig();
  const key = execFileSync("/usr/bin/security", ["find-generic-password", "-s", settings.keychainService, "-a", settings.keychainAccount, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  if (!key.startsWith("sk-") || /[\r\n]/.test(key)) throw new Error();
  // Use a small environment. The key is never part of the command or a config file.
  const env = { HOME: process.env.HOME, USER: process.env.USER, LOGNAME: process.env.LOGNAME, PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin", TMPDIR: process.env.TMPDIR, CONTROL_PLANE_API_KEY: key };
  child = spawn(settings.clientPath, tunnelArguments(settings), { cwd: root, env, stdio: "inherit" });
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
  child.on("error", () => { console.error("Tunnel could not start. Check its path and local settings."); process.exitCode = 1; });
  child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
} catch {
  console.error("Tunnel could not start. Check tunnel.local.json and its Keychain item on the home Mac.");
  process.exitCode = 1;
}
