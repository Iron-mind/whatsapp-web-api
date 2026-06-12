# WhatsApp Web API

A REST API for sending WhatsApp messages through WhatsApp Web using a queue system to avoid banning for mass sending.

## Features

- ✅ Message queue system with Redis
- ✅ Automatic on-demand processing (triggered when adding messages)
- ✅ Sequential sending to avoid WhatsApp limitations
- ✅ Lock to prevent multiple concurrent processing
- ✅ Message history storage by number
- ✅ Automatic cleanup of old messages (keeps 20 per number)
- ✅ Endpoints to query message status
- ✅ Error handling and retries

## Prerequisites

- Node.js v16 o superior
- Redis server
- npm o pnpm

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Configure environment variables (optional):
   ```bash
   cp .env.example .env
   ```
4. Start Redis server
5. Run the application:
   ```bash
   pnpm dev
   ```

## API Endpoints

### WhatsApp Authentication

#### `GET /whatsapp-web/qr`
Gets the QR code to authenticate with WhatsApp Web.

**Successful response:**
- HTML with QR code to scan
- If already authenticated: text with associated number

---

### Message Sending

#### `POST /whatsapp-web/message`
Adds a message to the sending queue (does not send it immediately).

**Body:**
```json
{
  "phone": "3001234567",
  "message": "Hello, this is a test message",
  "countryPrefix": "57"
}
```

**Successful response:**
```json
{
  "message": "Message queued successfully",
  "success": true,
  "messageId": "3001234567_1695456789123_abc123xyz",
  "queuedAt": "2023-09-23T10:30:00.000Z"
}
```

---

### Message Queries

#### `GET /whatsapp-web/messages/report`
Gets a summary of all messages grouped by number.

**Successful response:**
```json
{
  "success": true,
  "report": {
    "573001234567": {
      "total": 15,
      "sent": 12,
      "pending": 3,
      "lastMessage": "2023-09-23T10:30:00.000Z"
    }
  },
  "totalPhones": 1
}
```

#### `GET /whatsapp-web/messages/:countryPrefix/:phone`
Gets all messages from a specific number.

**Example:** `GET /whatsapp-web/messages/57/3001234567`

**Successful response:**
```json
{
  "success": true,
  "phone": "573001234567",
  "messages": [
    {
      "phone": "3001234567",
      "countryPrefix": "57",
      "message": "Hello world",
      "sent": true,
      "created_at": "2023-09-23T10:30:00.000Z",
      "sent_at": "2023-09-23T10:32:00.000Z",
      "id": "3001234567_1695456789123_abc123xyz"
    }
  ],
  "total": 1,
  "sent": 1,
  "pending": 0
}
```

---

### Queue Control

#### `GET /whatsapp-web/queue/status`
Gets the current status of the queue processor.

**Successful response:**
```json
{
  "success": true,
  "isProcessing": false,
  "lastProcessed": "2023-09-23T10:32:00.000Z"
}
```

#### `GET /whatsapp-web/redis/status`
Checks the status of the Redis connection.

**Successful response:**
```json
{
  "success": true,
  "redis": {
    "connected": true,
    "host": "localhost",
    "port": 6379,
    "message": "Redis connected correctly"
  }
}
```

#### `POST /whatsapp-web/queue/process`
Forces manual processing of the queue and waits for it to finish.

**Successful response:**
```json
{
  "success": true,
  "message": "Queue processing completed",
  "processed": 3
}
```

---

## Queue System Operation

1. **Reception**: Messages are added to a Redis queue when they arrive via POST
2. **Automatic activation**: Adding a message automatically triggers processing
3. **Concurrency lock**: Only one processing can run at a time
4. **Sequential sending**: One message is sent every 2 seconds to avoid limitations
5. **Complete draining**: The processor continues until the queue is completely empty
6. **Persistence**: Messages are stored by number until 20 are exceeded
7. **Cleanup**: Old messages are automatically deleted by number

## Environment Variables

| Variable | Description | Default value |
|----------|-------------|---------------|
| `PORT` | Server port | `6900` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis password | `null` |

## Data Structure

### Message in queue:
```javascript
{
  phone: "3001234567",
  countryPrefix: "57", 
  message: "Message text",
  sent: false,
  created_at: "2023-09-23T10:30:00.000Z",
  sent_at: null,
  id: "unique_message_id"
}
```

## Testing

1. Run the application: `pnpm dev`
2. Scan QR at: `http://localhost:6900/whatsapp-web/qr`
3. Send test message:
   ```bash
   curl -X POST http://localhost:6900/whatsapp-web/message \
     -H "Content-Type: application/json" \
     -d '{"phone":"3001234567","message":"Hello from the API","countryPrefix":"57"}'
   ```
4. Check status: `http://localhost:6900/whatsapp-web/messages/report`
