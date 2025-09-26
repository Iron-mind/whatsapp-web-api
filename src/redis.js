import Redis from 'ioredis';

// Configuración de Redis
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

let hasShownRedisError = false; // Flag para mostrar el error solo una vez

// Manejo de errores de Redis
redis.on('error', (err) => {
  if (err.code === 'ECONNREFUSED' && !hasShownRedisError) {
    hasShownRedisError = true;
    console.error('\n🚨 ERROR: No se puede conectar a Redis');
    console.error('📋 Para solucionar este problema, ejecuta uno de estos comandos:\n');
    console.error('🐳 Opción 1 - Usar Docker (RECOMENDADO):');
    console.error('   docker run -d -p 6379:6379 --name redis redis:alpine\n');
    console.error('🐧 Opción 2 - Usar WSL (Windows):');
    console.error('   wsl --install');
    console.error('   wsl');
    console.error('   sudo apt update && sudo apt install redis-server');
    console.error('   redis-server\n');
    console.error('🔗 Opción 3 - Redis Stack (Windows):');
    console.error('   Descargar de: https://redis.io/download\n');
    console.error('⚠️  El servidor continuará ejecutándose pero las funciones de cola no funcionarán sin Redis.');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
});

redis.on('connect', () => {
  hasShownRedisError = false; // Reset flag when connected
  console.log('✅ Conectado exitosamente a Redis');
});

redis.on('ready', () => {
  console.log('🚀 Redis está listo para usar');
});

// Nombres de las claves en Redis
const QUEUE_KEY = 'whatsapp:message_queue';
const MESSAGES_KEY_PREFIX = 'whatsapp:messages:';

// Variable para almacenar la función de procesamiento (se asignará externamente)
let processQueueFunction = null;

// Función para establecer la función de procesamiento
export function setProcessQueueFunction(processFunction) {
  processQueueFunction = processFunction;
}

// Función para verificar conexión de Redis
export async function checkRedisConnection() {
  try {
    await redis.ping();
    return true;
  } catch (error) {
    return false;
  }
}

// Función para agregar un mensaje a la cola
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
      console.warn('⚠️ Redis no disponible - el mensaje no se guardará en cola');
      throw new Error('Redis connection not available. Please start Redis server.');
    }

    // Agregar el mensaje a la cola (lista de Redis)
    await redis.lpush(QUEUE_KEY, JSON.stringify(messageData));
    
    // También guardar en la estructura de mensajes por número
    const phoneKey = `${MESSAGES_KEY_PREFIX}${countryPrefix}${phone}`;
    await redis.lpush(phoneKey, JSON.stringify(messageData));
    
    console.log(`✅ Mensaje agregado a la cola para ${countryPrefix}${phone}`);
    
    // Disparar procesamiento automático si está configurado
    if (processQueueFunction) {
      console.log('🚀 Disparando procesamiento automático de cola...');
      // Ejecutar en segundo plano sin bloquear la respuesta
      setImmediate(() => {
        processQueueFunction().catch(err => 
          console.error('Error en procesamiento automático:', err)
        );
      });
    }
    
    return messageData;
  } catch (error) {
    console.error('❌ Error agregando mensaje a la cola:', error.message);
    throw error;
  }
}

// Función para obtener el próximo mensaje de la cola (no enviado)
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
    console.error('Error obteniendo próximo mensaje:', error);
    throw error;
  }
}

// Función para marcar un mensaje como enviado
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
        
        console.log(`Mensaje ${messageId} marcado como enviado`);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error marcando mensaje como enviado:', error);
    throw error;
  }
}

// Función para limpiar mensajes enviados (mantener solo 20 por número)
export async function cleanupOldMessages(phone, countryPrefix) {
  try {
    const phoneKey = `${MESSAGES_KEY_PREFIX}${countryPrefix}${phone}`;
    const messages = await redis.lrange(phoneKey, 0, -1);
    
    if (messages.length > 20) {
      // Mantener solo los primeros 20 mensajes (más recientes)
      await redis.ltrim(phoneKey, 0, 19);
      console.log(`Limpieza realizada para ${countryPrefix}${phone}: mantenidos 20 mensajes de ${messages.length}`);
    }
  } catch (error) {
    console.error('Error limpiando mensajes antiguos:', error);
    throw error;
  }
}

// Función para obtener mensajes por número
export async function getMessagesByPhone(phone, countryPrefix) {
  try {
    const phoneKey = `${MESSAGES_KEY_PREFIX}${countryPrefix}${phone}`;
    const messages = await redis.lrange(phoneKey, 0, -1);
    
    return messages.map(msg => JSON.parse(msg));
  } catch (error) {
    console.error('Error obteniendo mensajes por teléfono:', error);
    throw error;
  }
}

// Función para obtener un resumen de todos los mensajes agrupados por número
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
    console.error('Error generando reporte de mensajes:', error);
    throw error;
  }
}

// Función para limpiar mensajes enviados de la cola principal
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
    
    console.log(`Cola limpiada: ${pendingMessages.length} mensajes pendientes mantenidos`);
  } catch (error) {
    console.error('Error limpiando mensajes enviados de la cola:', error);
    throw error;
  }
}

export default redis;
