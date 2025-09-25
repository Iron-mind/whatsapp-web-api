# WhatsApp Web API

Una API REST para enviar mensajes de WhatsApp a través de WhatsApp Web usando un sistema de cola para evitar el baneo por envío masivo.

## Características

- ✅ Sistema de cola de mensajes con Redis
- ✅ Procesamiento automático bajo demanda (se activa al agregar mensajes)
- ✅ Envío secuencial para evitar limitaciones de WhatsApp
- ✅ Candado para evitar múltiples procesamentos concurrentes
- ✅ Almacenamiento de historial de mensajes por número
- ✅ Limpieza automática de mensajes antiguos (mantiene 20 por número)
- ✅ Endpoints para consultar estado de mensajes
- ✅ Manejo de errores y reintentos

## Prerrequisitos

- Node.js v16 o superior
- Redis server
- npm o pnpm

## Instalación

1. Clonar el repositorio
2. Instalar dependencias:
   ```bash
   pnpm install
   ```
3. Configurar variables de entorno (opcional):
   ```bash
   cp .env.example .env
   ```
4. Iniciar Redis server
5. Ejecutar la aplicación:
   ```bash
   pnpm dev
   ```

## Endpoints de la API

### Autenticación WhatsApp

#### `GET /whatsapp-web/qr`
Obtiene el código QR para autenticar con WhatsApp Web.

**Respuesta exitosa:**
- HTML con el código QR para escanear
- Si ya está autenticado: texto con el número asociado

---

### Envío de mensajes

#### `POST /whatsapp-web/message`
Agrega un mensaje a la cola de envío (no lo envía inmediatamente).

**Body:**
```json
{
  "phone": "3001234567",
  "message": "Hola, este es un mensaje de prueba",
  "countryPrefix": "57"
}
```

**Respuesta exitosa:**
```json
{
  "message": "Message queued successfully",
  "success": true,
  "messageId": "3001234567_1695456789123_abc123xyz",
  "queuedAt": "2023-09-23T10:30:00.000Z"
}
```

---

### Consulta de mensajes

#### `GET /whatsapp-web/messages/report`
Obtiene un resumen de todos los mensajes agrupados por número.

**Respuesta exitosa:**
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
Obtiene todos los mensajes de un número específico.

**Ejemplo:** `GET /whatsapp-web/messages/57/3001234567`

**Respuesta exitosa:**
```json
{
  "success": true,
  "phone": "573001234567",
  "messages": [
    {
      "phone": "3001234567",
      "countryPrefix": "57",
      "message": "Hola mundo",
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

### Control de cola

#### `GET /whatsapp-web/queue/status`
Obtiene el estado actual del procesador de cola.

**Respuesta exitosa:**
```json
{
  "success": true,
  "isProcessing": false,
  "lastProcessed": "2023-09-23T10:32:00.000Z"
}
```

#### `GET /whatsapp-web/redis/status`
Verifica el estado de la conexión a Redis.

**Respuesta exitosa:**
```json
{
  "success": true,
  "redis": {
    "connected": true,
    "host": "localhost",
    "port": 6379,
    "message": "Redis conectado correctamente"
  }
}
```

#### `POST /whatsapp-web/queue/process`
Fuerza el procesamiento manual de la cola y espera a que termine.

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Queue processing completed",
  "processed": 3
}
```

---

## Funcionamiento del sistema de cola

1. **Recepción**: Los mensajes se agregan a una cola Redis cuando llegan vía POST
2. **Activación automática**: Al agregar un mensaje se dispara automáticamente el procesamiento
3. **Candado de concurrencia**: Solo puede ejecutarse un procesamiento a la vez
4. **Envío secuencial**: Se envía un mensaje cada 2 segundos para evitar limitaciones
5. **Vaciado completo**: El procesador continúa hasta vaciar completamente la cola
6. **Persistencia**: Los mensajes se almacenan por número hasta que se superen 20
7. **Limpieza**: Se eliminan automáticamente mensajes antiguos por número

## Variables de entorno

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `PORT` | Puerto del servidor | `6900` |
| `REDIS_HOST` | Host de Redis | `localhost` |
| `REDIS_PORT` | Puerto de Redis | `6379` |
| `REDIS_PASSWORD` | Contraseña de Redis | `null` |

## Estructura de datos

### Mensaje en cola:
```javascript
{
  phone: "3001234567",
  countryPrefix: "57", 
  message: "Texto del mensaje",
  sent: false,
  created_at: "2023-09-23T10:30:00.000Z",
  sent_at: null,
  id: "unique_message_id"
}
```

## Testing

1. Ejecutar la aplicación: `pnpm dev`
2. Escanear QR en: `http://localhost:6900/whatsapp-web/qr`
3. Enviar mensaje de prueba:
   ```bash
   curl -X POST http://localhost:6900/whatsapp-web/message \
     -H "Content-Type: application/json" \
     -d '{"phone":"3001234567","message":"Hola desde la API","countryPrefix":"57"}'
   ```
4. Verificar estado: `http://localhost:6900/whatsapp-web/messages/report`
