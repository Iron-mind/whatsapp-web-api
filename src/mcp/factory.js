import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { sendMessageTool } from './tools/send-message.js';
import { queueTools } from './tools/queue-tools.js';
import { statusTools } from './tools/status-tools.js';

/**
 * Creates and configures a shared McpServer instance with the WhatsApp Web API tools.
 *
 * @returns {McpServer}
 */
export function createMcpServer() {
  const server = new McpServer({
    name: 'whatsapp-web-api-mcp',
    version: process.env.npm_package_version || '1.1.0',
  });

  server.registerTool(
    'send_whatsapp_message',
    {
      title: 'Send WhatsApp message',
      description:
        'Enqueue or directly send a WhatsApp message to a given phone number. If Redis is available the message is queued and processed sequentially; otherwise it is sent immediately.',
      inputSchema: z.object({
        phone: z.string().describe('Phone number without country prefix, e.g. 3001234567'),
        message: z.string().describe('Text message to send'),
        countryPrefix: z
          .string()
          .optional()
          .describe('International country code without + or 00, e.g. 57. Defaults to 57.'),
      }),
    },
    sendMessageTool
  );

  for (const tool of queueTools) {
    server.registerTool(tool.name, tool.config, tool.handler);
  }

  for (const tool of statusTools) {
    server.registerTool(tool.name, tool.config, tool.handler);
  }

  return server;
}
