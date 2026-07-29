import { z } from 'zod';
import {
  checkRedisConnection,
  getMessagesReport,
  getMessagesByPhone,
} from '../../redis.js';
import { processMessageQueue, getProcessorStatus } from '../../queue-processor.js';

const reportConfig = {
  title: 'Get messages report',
  description:
    'Returns a summary of all messages grouped by phone number, including total, sent and pending counts.',
};

const phoneMessagesConfig = {
  title: 'Get messages by phone',
  description: 'Returns the message history for a specific phone number.',
  inputSchema: z.object({
    phone: z.string().describe('Phone number without country prefix, e.g. 3001234567'),
    countryPrefix: z
      .string()
      .optional()
      .describe('International country code without + or 00, e.g. 57. Defaults to 57.'),
  }),
};

const processQueueConfig = {
  title: 'Process message queue',
  description:
    'Forces immediate processing of pending messages in the Redis queue. Waits until the batch finishes.',
};

const queueStatusConfig = {
  title: 'Get queue processor status',
  description: 'Returns whether the queue processor is currently running and the last processed time.',
};

async function reportHandler() {
  const redisAvailable = await checkRedisConnection();
  if (!redisAvailable) {
    return {
      content: [{ type: 'text', text: 'Redis is not available. Queue reports cannot be generated.' }],
      isError: true,
    };
  }

  const report = await getMessagesReport();
  return {
    content: [{ type: 'text', text: JSON.stringify(report, null, 2) }],
  };
}

async function phoneMessagesHandler(args) {
  const { phone, countryPrefix = '57' } = args;
  const redisAvailable = await checkRedisConnection();
  if (!redisAvailable) {
    return {
      content: [{ type: 'text', text: 'Redis is not available. Cannot retrieve messages.' }],
      isError: true,
    };
  }

  const messages = await getMessagesByPhone(phone, countryPrefix);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            phone: `${countryPrefix}${phone}`,
            total: messages.length,
            sent: messages.filter((m) => m.sent).length,
            pending: messages.filter((m) => !m.sent).length,
            messages,
          },
          null,
          2
        ),
      },
    ],
  };
}

async function processQueueHandler() {
  const redisAvailable = await checkRedisConnection();
  if (!redisAvailable) {
    return {
      content: [{ type: 'text', text: 'Redis is not available. Cannot process queue.' }],
      isError: true,
    };
  }

  const result = await processMessageQueue();
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

async function queueStatusHandler() {
  const status = getProcessorStatus();
  return {
    content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
  };
}

export const queueTools = [
  { name: 'get_whatsapp_messages_report', config: reportConfig, handler: reportHandler },
  { name: 'get_whatsapp_messages_by_phone', config: phoneMessagesConfig, handler: phoneMessagesHandler },
  { name: 'process_whatsapp_queue', config: processQueueConfig, handler: processQueueHandler },
  { name: 'get_whatsapp_queue_status', config: queueStatusConfig, handler: queueStatusHandler },
];
