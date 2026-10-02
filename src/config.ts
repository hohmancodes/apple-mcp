import { readFileSync } from "node:fs";
import { z } from "zod";

const name = z.string().trim().min(1).max(512);
export const configSchema = z.object({
  version: z.literal(1),
  notes: z.array(z.object({ account: name, folder: name }).strict()).max(100).default([]),
  mail: z.array(z.object({ account: name, mailbox: name }).strict()).max(100).default([]),
  calendars: z.array(name).max(100).default([]),
  messageChats: z.array(name).max(100).default([]),
  limits: z.object({
    maxResults: z.number().int().min(1).max(100).default(25),
    maxWindowDays: z.number().int().min(1).max(366).default(31),
    maxResponseBytes: z.number().int().min(1024).max(1048576).default(65536),
  }).strict().default({ maxResults: 25, maxWindowDays: 31, maxResponseBytes: 65536 }),
}).strict();

export type BridgeConfig = z.infer<typeof configSchema>;
export type Mode = "mock" | "apple";

export const mockConfig: BridgeConfig = configSchema.parse({
  version: 1,
  notes: [{ account: "Demo Notes Account", folder: "Demo Notes" }],
  mail: [{ account: "Demo Mail Account", mailbox: "Demo Inbox" }],
  calendars: ["Demo Calendar"],
  messageChats: ["demo-chat"],
});

export function loadConfig(path: string): BridgeConfig {
  // Neither parse errors nor file contents are printed: this file may name private scopes.
  const config = configSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  if (!config.notes.length && !config.mail.length && !config.calendars.length && !config.messageChats.length) {
    throw new Error("Choose at least one Apple data scope in the local settings file.");
  }
  const names = [...config.notes.flatMap(s => [s.account, s.folder]), ...config.mail.flatMap(s => [s.account, s.mailbox]), ...config.calendars, ...config.messageChats];
  if (names.some(value => value.startsWith("YOUR "))) {
    throw new Error("Replace the example scope names before enabling Apple data.");
  }
  return config;
}

export function parseOptions(args: string[]): { mode: Mode; configPath?: string } {
  let mode: Mode = "mock";
  let explicitMode = false;
  let configPath: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--mock" || arg === "--apple") {
      if (explicitMode) throw new Error("Choose exactly one mode: --mock or --apple.");
      mode = arg === "--apple" ? "apple" : "mock";
      explicitMode = true;
    } else if (arg === "--config" && args[i + 1] && !args[i + 1].startsWith("--")) {
      if (configPath) throw new Error("Provide one settings file.");
      configPath = args[++i];
    } else {
      throw new Error("Unknown option. Use --mock, or --apple --config <local settings file>.");
    }
  }
  if (mode === "apple" && !configPath) throw new Error("Apple mode requires --config <local settings file>.");
  if (mode === "mock" && configPath) throw new Error("A settings file requires explicit --apple mode.");
  return { mode, configPath };
}
