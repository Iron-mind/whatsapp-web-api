import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './src/mcp/factory.js';

// When running in stdio mode, suppress normal application logs so they do not
// corrupt the JSON-RPC stream. Error logs are still emitted to stderr.
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;

console.log = () => {};
console.info = () => {};

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in MCP stdio server:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection in MCP stdio server:', reason);
});

async function main() {
  const transport = new StdioServerTransport();
  const server = createMcpServer();
  await server.connect(transport);

  // Restore logs only after the transport closes, in case they are useful for debugging.
  transport.onclose = () => {
    console.log = originalConsoleLog;
    console.info = originalConsoleInfo;
    console.log('MCP stdio transport closed');
  };
}

main().catch((error) => {
  console.error('Failed to start MCP stdio server:', error);
  process.exit(1);
});
