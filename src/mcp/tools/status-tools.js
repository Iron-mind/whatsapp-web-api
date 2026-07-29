import { z } from 'zod';
import { checkRedisConnection } from '../../redis.js';
import { whatsappClient } from '../../whatsapp-web.js';

const whatsappStatusConfig = {
  title: 'Get WhatsApp client status',
  description:
    'Returns whether the WhatsApp client is authenticated and the linked phone number if available.',
};

const redisStatusConfig = {
  title: 'Get Redis connection status',
  description: 'Returns the current Redis connection status and configured host/port.',
};

async function whatsappStatusHandler() {
  const ready = Boolean(whatsappClient.info);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            ready,
            phone: whatsappClient.info?.wid?.user || null,
            info: ready ? 'WhatsApp client is authenticated and ready.' : 'WhatsApp client is not ready yet.',
          },
          null,
          2
        ),
      },
    ],
  };
}

async function redisStatusHandler() {
  const connected = await checkRedisConnection();
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            connected,
            host: process.env.REDIS_HOST || 'localhost',
            port: Number(process.env.REDIS_PORT) || 6379,
            message: connected
              ? 'Redis connected correctly'
              : 'Redis not available - start it with docker run -d -p 6379:6379 --name redis redis:alpine',
          },
          null,
          2
        ),
      },
    ],
  };
}

export const statusTools = [
  { name: 'get_whatsapp_status', config: whatsappStatusConfig, handler: whatsappStatusHandler },
  { name: 'get_redis_status', config: redisStatusConfig, handler: redisStatusHandler },
];
