import { whatsappClient } from './whatsapp-web.js';
import { 
  getNextMessage, 
  markMessageAsSent, 
  cleanupOldMessages, 
  cleanupSentMessages 
} from './redis.js';

let isProcessing = false;

// Function to process an individual message
async function processMessage(messageData) {
  const { phone, countryPrefix, message, id } = messageData;
  const fullPhone = `${countryPrefix}${phone}@c.us`;
  
  try {
    console.log(`Sending message to ${countryPrefix}${phone}: ${message.substring(0, 50)}...`);
    
    // Verificar si el cliente de WhatsApp está listo
    if (!whatsappClient.info) {
      console.error('WhatsApp client is not ready');
      return false;
    }
    
    // Enviar el mensaje
    await whatsappClient.sendMessage(fullPhone, message, { linkPreview: true });
    
    // Marcar como enviado
    await markMessageAsSent(id);
    
    // Limpiar mensajes antiguos si es necesario
    await cleanupOldMessages(phone, countryPrefix);
    
    console.log(`✅ Message sent successfully to ${countryPrefix}${phone}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error sending message to ${countryPrefix}${phone}:`, error.message);
    return false;
  }
}

// Main function to process the queue on demand
export async function processMessageQueue() {
  if (isProcessing) {
    console.log('Processing already in progress, skipping...');
    return {
      success: false,
      message: 'Processing already in progress',
      processed: 0
    };
  }
  
  isProcessing = true;
  console.log('🔄 Starting message queue processing (on demand)');
  
  try {
    let processedCount = 0;
    let maxIterations = 50; // Límite de seguridad para evitar bucles infinitos
    let currentIteration = 0;
    
    while (currentIteration < maxIterations) {
      currentIteration++;
      
      // Obtener el próximo mensaje a procesar
      const nextMessage = await getNextMessage();
      
      if (!nextMessage) {
        console.log('✅ No more pending messages in the queue');
        break;
      }
      
      console.log(`Procesando mensaje ${processedCount + 1}: ID ${nextMessage.id}`);
      
      // Procesar el mensaje
      const success = await processMessage(nextMessage);
      
      if (success) {
        processedCount++;
        
        // Esperar 2 segundos entre envíos para evitar limitaciones de WhatsApp
        if (currentIteration < maxIterations) {
          console.log('⏳ Waiting 2 seconds before the next message...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } else {
        console.log('⚠️ Error processing message, will try again in the next cycle');
        // No marcamos como enviado, se intentará de nuevo
        break; // Salir del bucle para evitar procesar más mensajes si hay errores
      }
    }
    
    console.log(`🎉 Processing completed: ${processedCount} messages sent`);
    
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
    console.error('❌ Error during queue processing:', error);
    return {
      success: false,
      message: 'Error processing queue: ' + error.message,
      processed: 0
    };
  } finally {
    isProcessing = false;
  }
}

// Function to get the current processor status
export function getProcessorStatus() {
  return {
    isProcessing,
    lastProcessed: new Date().toISOString()
  };
}