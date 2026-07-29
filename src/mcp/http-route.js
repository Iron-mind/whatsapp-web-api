import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import { createMcpServer } from './factory.js';

const sessions = new Map();

/**
 * Attaches the MCP Streamable HTTP transport to an Express app at the given mount path.
 *
 * @param {import('express').Express} app
 * @param {string} mountPath
 */
export function mountMcpHttpRoute(app, mountPath = '/mcp') {
  app.post(mountPath, async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'];
      let transport;

      if (sessionId && sessions.has(sessionId)) {
        transport = sessions.get(sessionId);
      } else {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            sessions.set(id, transport);
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            sessions.delete(transport.sessionId);
          }
        };

        const server = createMcpServer();
        await server.connect(transport);
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('MCP HTTP error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal MCP server error' });
      }
    }
  });

  app.get(mountPath, async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'];
      let transport;

      if (sessionId && sessions.has(sessionId)) {
        transport = sessions.get(sessionId);
      } else {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            sessions.set(id, transport);
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            sessions.delete(transport.sessionId);
          }
        };

        const server = createMcpServer();
        await server.connect(transport);
      }

      await transport.handleRequest(req, res);
    } catch (error) {
      console.error('MCP HTTP SSE error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal MCP server error' });
      }
    }
  });
}
