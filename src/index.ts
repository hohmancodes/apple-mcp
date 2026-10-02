#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAppleBackend, createMockBackend } from "./backend.js";
import { loadConfig, mockConfig, parseOptions } from "./config.js";
import { createBridge } from "./server.js";

// The tunnel runtime key is not needed by any Apple adapter.
delete process.env.CONTROL_PLANE_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_ADMIN_KEY;

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const config = options.mode === "apple" ? loadConfig(options.configPath!) : mockConfig;
  const server = createBridge(config, options.mode, options.mode === "apple" ? createAppleBackend() : createMockBackend());
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await server.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await server.connect(new StdioServerTransport());
}

main().catch(() => {
  console.error("Personal Apple MCP could not start. Use --mock, or --apple --config <valid local settings file>.");
  process.exitCode = 1;
});
