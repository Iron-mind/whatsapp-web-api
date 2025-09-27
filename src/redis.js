import Redis from 'ioredis';

// Redis configuration
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || null,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  maxRetriesOnFailover: 1,
  retryDelayOnFailover: 100,
  enableOfflineQueue: false,
});

let hasShownRedisError = false; // Flag to show error only once

// Redis error handling
redis.on('error', (err) => {
  if (err.code === 'ECONNREFUSED' && !hasShownRedisError) {
    hasShownRedisError = true;
    console.error('\n🚨 ERROR: Cannot connect to Redis');
    console.error('📋 To solve this problem, run one of these commands:\n');
    console.error('🐳 Option 1 - Use Docker (RECOMMENDED):');
    console.error('   docker run -d -p 6379:6379 --name redis redis:alpine\n');
    console.error('🐧 Option 2 - Use WSL (Windows):');
    console.error('   wsl --install');
    console.error('   wsl');
    console.error('   sudo apt update && sudo apt install redis-server');
    console.error('   redis-server\n');
    console.error('🔗 Option 3 - Redis Stack (Windows):');
    console.error('   Descargar de: https://redis.io/download\n');
    console.error('⚠️  The server will continue running but queue functions will not work without Redis.');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
});

redis.on('connect', () => {
  hasShownRedisError = false; // Reset flag when connected
  console.log('✅ Successfully connected to Redis');
});

redis.on('ready', () => {
  console.log('🚀 Redis is ready to use');
});

// Redis key names
const QUEUE_KEY = 'whatsapp:message_queue';
const MESSAGES_KEY_PREFIX = 'whatsapp:messages:';

// Variable to store the processing function (will be assigned externally)
let processQueueFunction = null;

// Function to set the processing function
export function setProcessQueueFunction(processFunction) {
  processQueueFunction = processFunction;
}

// Function to check Redis connection
export async function checkRedisConnection() {
  try {
    await redis.ping();
    return true;
  } catch (error) {
    return false;
  }
}

// Function to add a message to the queue
export async function addMessageToQueue(phone, countryPrefix, message) {
  const messageData = {
    phone,
    countryPrefix: countryPrefix || "57",
    message,
    sent: false,
    created_at: new Date().toISOString(),
    sent_at: null,
    id: `${phone}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  };

  try {
    // Verificar si Redis está disponible
    const redisAvailable = await checkRedisConnection();
    if (!redisAvailable) {
      console.warn('⚠️ Redis not available - message will not be saved in queue');
      throw new Error('Redis connection not available. Please start Redis server.');
    }

    // Agregar el mensaje a la cola (lista de Redis)
    await redis.lpush(QUEUE_KEY, JSON.stringify(messageData));
    
    // También guardar en la estructura de mensajes por número
    const phoneKey = `${MESSAGES_KEY_PREFIX}${countryPrefix}${phone}`;
    await redis.lpush(phoneKey, JSON.stringify(messageData));
    
    console.log(`✅ Message added to queue for ${countryPrefix}${phone}`);
    
    // Disparar procesamiento automático si está configurado
    if (processQueueFunction) {
      console.log('🚀 Triggering automatic queue processing...');
      // Ejecutar en segundo plano sin bloquear la respuesta
      setImmediate(() => {
        processQueueFunction().catch(err => 
          console.error('Error en procesamiento automático:', err)
        );
      });
    }
    
    return messageData;
  } catch (error) {
    console.error('❌ Error adding message to queue:', error.message);
    throw error;
  }
}

// Function to get the next message from the queue (not sent)
export async function getNextMessage() {
  try {
    // Obtener todos los mensajes de la cola
    const messages = await redis.lrange(QUEUE_KEY, 0, -1);
    
    if (messages.length === 0) {
      return null;
    }

    // Buscar el mensaje más antiguo que no haya sido enviado
    for (let i = messages.length - 1; i >= 0; i--) {
      const messageData = JSON.parse(messages[i]);
      if (!messageData.sent) {
        return {
          ...messageData,
          index: i
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error getting next message:', error);
    throw error;
  }
}

// Function to mark a message as sent
export async function markMessageAsSent(messageId, sentAt = null) {
  try {
    // Obtener todos los mensajes de la cola
    const messages = await redis.lrange(QUEUE_KEY, 0, -1);
    
    for (let i = 0; i < messages.length; i++) {
      const messageData = JSON.parse(messages[i]);
      
      if (messageData.id === messageId) {
        // Actualizar el mensaje
        messageData.sent = true;
        messageData.sent_at = sentAt || new Date().toISOString();
        
        // Reemplazar en la cola
        await redis.lset(QUEUE_KEY, i, JSON.stringify(messageData));
        
        // También actualizar en la estructura de mensajes por número
        const phoneKey = `${MESSAGES_KEY_PREFIX}${messageData.countryPrefix}${messageData.phone}`;
        const phoneMessages = await redis.lrange(phoneKey, 0, -1);
        
        for (let j = 0; j < phoneMessages.length; j++) {
          const phoneMessageData = JSON.parse(phoneMessages[j]);
          if (phoneMessageData.id === messageId) {
            await redis.lset(phoneKey, j, JSON.stringify(messageData));
            break;
          }
        }
        
        console.log(`Message ${messageId} marked as sent`);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error marking message as sent:', error);
    throw error;
  }
}

// Function to clean up sent messages (keep only 20 per number)
export async function cleanupOldMessages(phone, countryPrefix) {
  try {
    const phoneKey = `${MESSAGES_KEY_PREFIX}${countryPrefix}${phone}`;
    const messages = await redis.lrange(phoneKey, 0, -1);
    
    if (messages.length > 20) {
      // Mantener solo los primeros 20 mensajes (más recientes)
      await redis.ltrim(phoneKey, 0, 19);
      console.log(`Cleanup performed for ${countryPrefix}${phone}: kept 20 messages out of ${messages.length}`);
    }
  } catch (error) {
    console.error('Error cleaning up old messages:', error);
    throw error;
  }
}

// Function to get messages by number
export async function getMessagesByPhone(phone, countryPrefix) {
  try {
    const phoneKey = `${MESSAGES_KEY_PREFIX}${countryPrefix}${phone}`;
    const messages = await redis.lrange(phoneKey, 0, -1);
    
    return messages.map(msg => JSON.parse(msg));
  } catch (error) {
    console.error('Error getting messages by phone:', error);
    throw error;
  }
}

// Function to get a summary of all messages grouped by number
export async function getMessagesReport() {
  try {
    const keys = await redis.keys(`${MESSAGES_KEY_PREFIX}*`);
    const report = {};
    
    for (const key of keys) {
      const phone = key.replace(MESSAGES_KEY_PREFIX, '');
      const messages = await redis.lrange(key, 0, -1);
      
      const parsedMessages = messages.map(msg => JSON.parse(msg));
      const sentCount = parsedMessages.filter(msg => msg.sent).length;
      const pendingCount = parsedMessages.filter(msg => !msg.sent).length;
      
      report[phone] = {
        total: parsedMessages.length,
        sent: sentCount,
        pending: pendingCount,
        lastMessage: parsedMessages[0] ? new Date(parsedMessages[0].created_at) : null
      };
    }
    
    return report;
  } catch (error) {
    console.error('Error generating messages report:', error);
    throw error;
  }
}

// Function to clean up sent messages from the main queue
export async function cleanupSentMessages() {
  try {
    const messages = await redis.lrange(QUEUE_KEY, 0, -1);
    const pendingMessages = [];
    
    // Filtrar solo mensajes no enviados
    for (const msg of messages) {
      const messageData = JSON.parse(msg);
      if (!messageData.sent) {
        pendingMessages.push(msg);
      }
    }
    
    // Limpiar la cola y volver a agregar solo mensajes pendientes
    await redis.del(QUEUE_KEY);
    if (pendingMessages.length > 0) {
      await redis.rpush(QUEUE_KEY, ...pendingMessages);
    }
    
    console.log(`Queue cleaned: ${pendingMessages.length} pending messages kept`);
  } catch (error) {
    console.error('Error cleaning sent messages from queue:', error);
    throw error;
  }
}

export default redis;
