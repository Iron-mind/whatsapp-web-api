import express from 'express';
import { getQRHtmlString, whatsappClient } from './whatsapp-web.js';
import {
  addMessageToQueue,
  getMessagesReport,
  getMessagesByPhone,
  setProcessQueueFunction,
  checkRedisConnection
} from './redis.js';
import { processMessageQueue, getProcessorStatus } from './queue-processor.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const port = process.env.PORT || 6900;

// Configurar el motor de vistas Pug
app.set('view engine', 'pug');

// Ruta raíz
app.get('/test', (req, res) => {
  // res.render('index', { title: 'Mi primera aplicación Express' });
  res.json({ message: 'Hello World' });
});


app.get('/whatsapp-web/qr', (req, res) => {
  try {

    let phoneNumber = whatsappClient.info?.wid.user

    if (phoneNumber) {

      return res.send(
        "Phone number already associated " +
        phoneNumber
      );
    }
    getQRHtmlString(res);
  } catch (err) {
    console.log(err);
    res.json({ message: 'Error', success: false });
  }
});

app.post('/whatsapp-web/message', async (req, res) => {
  try {
    //phone sample: 573002222222 
    console.log(req.body);

    let { phone, message, countryPrefix } = req.body;
    countryPrefix = countryPrefix || "57";

    // Validar que el cliente esté listo
    if (!whatsappClient.info) {
      return res.json({ message: 'client wp not ready', success: false });
    }

    // Validar datos requeridos
    if (!phone || !message) {
      return res.json({ message: 'phone and message are required', success: false });
    }

    // Verificar conexión a Redis
    const redisAvailable = await checkRedisConnection();
    if (!redisAvailable) {
      return res.json({
        message: 'Redis server not available. Please start Redis server first.',
        success: false,
        details: 'Run: docker run -d -p 6379:6379 --name redis redis:alpine'
      });
    }

    // Agregar mensaje a la cola en lugar de enviarlo directamente
    const messageData = await addMessageToQueue(phone, countryPrefix, message);

    res.json({
      message: 'Message queued successfully',
      success: true,
      messageId: messageData.id,
      queuedAt: messageData.created_at
    });

  } catch (error) {
    console.log(error);
    res.json({ message: 'Error: ' + error.message, success: false });
  }
});

// Ruta para obtener el reporte de mensajes agrupados por número
app.get('/whatsapp-web/messages/report', async (req, res) => {
  try {
    const report = await getMessagesReport();
    res.json({
      success: true,
      report,
      totalPhones: Object.keys(report).length
    });
  } catch (error) {
    console.log(error);
    res.json({ message: 'Error getting messages report: ' + error, success: false });
  }
});

// Ruta para obtener mensajes de un número específico
app.get('/whatsapp-web/messages/:countryPrefix/:phone', async (req, res) => {
  try {
    const { phone, countryPrefix } = req.params;
    const messages = await getMessagesByPhone(phone, countryPrefix);

    res.json({
      success: true,
      phone: `${countryPrefix}${phone}`,
      messages,
      total: messages.length,
      sent: messages.filter(msg => msg.sent).length,
      pending: messages.filter(msg => !msg.sent).length
    });
  } catch (error) {
    console.log(error);
    res.json({ message: 'Error getting messages: ' + error, success: false });
  }
});

// Ruta para obtener el estado del procesador de cola
app.get('/whatsapp-web/queue/status', (req, res) => {
  try {
    const status = getProcessorStatus();
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.log(error);
    res.json({ message: 'Error getting processor status: ' + error, success: false });
  }
});

// Ruta para verificar estado de Redis
app.get('/whatsapp-web/redis/status', async (req, res) => {
  try {
    const redisAvailable = await checkRedisConnection();
    res.json({
      success: true,
      redis: {
        connected: redisAvailable,
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        message: redisAvailable
          ? 'Redis conectado correctamente'
          : 'Redis no disponible - ejecuta: docker run -d -p 6379:6379 --name redis redis:alpine'
      }
    });
  } catch (error) {
    console.log(error);
    res.json({ message: 'Error checking Redis status: ' + error, success: false });
  }
});

// Ruta para forzar el procesamiento de la cola manualmente
app.post('/whatsapp-web/queue/process', async (req, res) => {
  try {
    // Ejecutar procesamiento de cola y esperar resultado
    const result = await processMessageQueue();

    res.json({
      success: result.success,
      message: result.message,
      processed: result.processed
    });
  } catch (error) {
    console.log(error);
    res.json({ message: 'Error starting queue processing: ' + error, success: false });
  }
});
app.listen(port, async () => {
  console.log(`🚀 Servidor escuchando en el puerto ${port}`);

  // Verificar conexión a Redis
  console.log('🔍 Verificando conexión a Redis...');
  const redisAvailable = await checkRedisConnection();

  if (redisAvailable) {
    console.log('✅ Redis conectado exitosamente');
    // Configurar la función de procesamiento en el módulo de redis
    setProcessQueueFunction(processMessageQueue);
    console.log('✅ Sistema de procesamiento bajo demanda configurado');
  } else {
    console.log('❌ Redis no está disponible');
    console.log('⚠️  El servidor funcionará pero las funciones de cola estarán deshabilitadas');
    console.log('📋 Para habilitar Redis, ejecuta: docker run -d -p 6379:6379 --name redis redis:alpine');
  }
});