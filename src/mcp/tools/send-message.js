import {
  addMessageToQueue,
  checkRedisConnection,
} from '../../redis.js';
import { processMessageQueue } from '../../queue-processor.js';
import { whatsappClient } from '../../whatsapp-web.js';

/**
 * Sends or enqueues a WhatsApp message.
 *
 * @param {{ phone: string; message: string; countryPrefix?: string }} args
 * @returns {Promise<{ content: Array<{ type: 'text'; text: string }> }>}
 */
export async function sendMessageTool(args) {
  const { phone, message, countryPrefix = '57' } = args;

  if (!phone || !message) {
    return {
      content: [
        { type: 'text', text: 'Error: "phone" and "message" are required.' },
      ],
      isError: true,
    };
  }

  if (!whatsappClient.info) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: WhatsApp client is not ready. Authenticate first via GET /whatsapp-web/qr.',
        },
      ],
      isError: true,
    };
  }

  try {
    const redisAvailable = await checkRedisConnection();

    if (!redisAvailable) {
      const fullPhone = `${countryPrefix}${phone}@c.us`;
      await whatsappClient.sendMessage(fullPhone, message);
      return {
        content: [
          {
            type: 'text',
            text: `Message sent directly to ${countryPrefix}${phone} (Redis not available).`,
          },
        ],
      };
    }

    const messageData = await addMessageToQueue(phone, countryPrefix, message);
    processMessageQueue();

    return {
      content: [
        {
          type: 'text',
          text: `Message queued for ${countryPrefix}${phone}. Message ID: ${messageData.id}. Queue processing started.`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
}
