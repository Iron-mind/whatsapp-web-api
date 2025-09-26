import { whatsappClient } from './whatsapp-web.js';
import { 
  getNextMessage, 
  markMessageAsSent, 
  cleanupOldMessages, 
  cleanupSentMessages 
} from './redis.js';

let isProcessing = false;

// Función para procesar un mensaje individual
async function processMessage(messageData) {
  const { phone, countryPrefix, message, id } = messageData;
  const fullPhone = `${countryPrefix}${phone}@c.us`;
  
  try {
    console.log(`Enviando mensaje a ${countryPrefix}${phone}: ${message.substring(0, 50)}...`);
    
    // Verificar si el cliente de WhatsApp está listo
    if (!whatsappClient.info) {
      console.error('Cliente de WhatsApp no está listo');
      return false;
    }
    
    // Enviar el mensaje
    await whatsappClient.sendMessage(fullPhone, message, { linkPreview: true });
    
    // Marcar como enviado
    await markMessageAsSent(id);
    
    // Limpiar mensajes antiguos si es necesario
    await cleanupOldMessages(phone, countryPrefix);
    
    console.log(`✅ Mensaje enviado exitosamente a ${countryPrefix}${phone}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error enviando mensaje a ${countryPrefix}${phone}:`, error.message);
    return false;
  }
}

// Función principal para procesar la cola bajo demanda
export async function processMessageQueue() {
  if (isProcessing) {
    console.log('Ya hay un procesamiento en curso, saltando...');
    return {
      success: false,
      message: 'Processing already in progress',
      processed: 0
    };
  }
  
  isProcessing = true;
  console.log('🔄 Iniciando procesamiento de cola de mensajes (bajo demanda)');
  
  try {
    let processedCount = 0;
    let maxIterations = 50; // Límite de seguridad para evitar bucles infinitos
    let currentIteration = 0;
    
    while (currentIteration < maxIterations) {
      currentIteration++;
      
      // Obtener el próximo mensaje a procesar
      const nextMessage = await getNextMessage();
      
      if (!nextMessage) {
        console.log('✅ No hay más mensajes pendientes en la cola');
        break;
      }
      
      console.log(`Procesando mensaje ${processedCount + 1}: ID ${nextMessage.id}`);
      
      // Procesar el mensaje
      const success = await processMessage(nextMessage);
      
      if (success) {
        processedCount++;
        
        // Esperar 2 segundos entre envíos para evitar limitaciones de WhatsApp
        if (currentIteration < maxIterations) {
          console.log('⏳ Esperando 2 segundos antes del siguiente mensaje...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } else {
        console.log('⚠️ Error procesando mensaje, se intentará de nuevo en el próximo ciclo');
        // No marcamos como enviado, se intentará de nuevo
        break; // Salir del bucle para evitar procesar más mensajes si hay errores
      }
    }
    
    console.log(`🎉 Procesamiento completado: ${processedCount} mensajes enviados`);
    
    // Limpiar mensajes enviados de la cola principal cada cierto tiempo
    if (processedCount > 0) {
      await cleanupSentMessages();
    }
    
    return {
      success: true,
      message: 'Queue processing completed',
      processed: processedCount
    };
    
  } catch (error) {
    console.error('❌ Error durante el procesamiento de la cola:', error);
    return {
      success: false,
      message: 'Error processing queue: ' + error.message,
      processed: 0
    };
  } finally {
    isProcessing = false;
  }
}

// Función para obtener el estado actual del procesador
export function getProcessorStatus() {
  return {
    isProcessing,
    lastProcessed: new Date().toISOString()
  };
}