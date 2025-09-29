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
    
    // Check if the WhatsApp client is ready
    if (!whatsappClient.info) {
      console.error('WhatsApp client is not ready');
      return false;
    }
    
    // Send the message
    await whatsappClient.sendMessage(fullPhone, message, { linkPreview: true });
    
    // Mark as sent
    await markMessageAsSent(id);
    
    // Clean up old messages if necessary
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
    let maxIterations = 100; // Safety limit to avoid infinite loops
    let currentIteration = 0;
    
    while (currentIteration < maxIterations) {
      currentIteration++;
      
      // Get the next message to process
      const nextMessage = await getNextMessage();
      
      if (!nextMessage) {
        console.log('✅ No more pending messages in the queue');
        break;
      }
      
      console.log(`Processing message ${processedCount + 1}: ID ${nextMessage.id}`);
      
      // Process the message
      const success = await processMessage(nextMessage);
      
      if (success) {
        processedCount++;
        
        // Wait 2 seconds between sends to avoid WhatsApp limitations
        if (currentIteration < maxIterations) {
          console.log('⏳ Waiting 2 seconds before the next message...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } else {
        console.log('⚠️ Error processing message, will try again in the next cycle');
        // We do not mark as sent, it will be tried again
        break; // Exit the loop to avoid processing more messages if there are errors
      }
    }
    
    console.log(`🎉 Processing completed: ${processedCount} messages sent`);
    
    // Clean up sent messages from the main queue every certain time
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