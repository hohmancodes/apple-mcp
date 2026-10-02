import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") throw new Error("Build the Calendar helper on the home Mac.");
const target = fileURLToPath(new URL("../build/calendar/src/", import.meta.url));
mkdirSync(target, { recursive: true });
// Compile only. This does not run the helper or request Calendar access.
execFileSync("swiftc", ["-O", "-o", `${target}calendar-helper`, fileURLToPath(new URL("../calendar/swift/CalendarHelper.swift", import.meta.url)), "-framework", "EventKit", "-framework", "Foundation", "-module-cache-path", `${target}swift-module-cache`], { stdio: "inherit" });
