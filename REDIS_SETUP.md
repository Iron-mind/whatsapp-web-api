# 🚀 Instrucciones para instalar Redis

La API necesita Redis para funcionar correctamente. Aquí tienes varias opciones:

## 🐳 Opción 1: Docker (RECOMENDADO)

Si tienes Docker instalado:

```bash
# Descargar e iniciar Redis
docker run -d -p 6379:6379 --name redis redis:alpine

# Verificar que está ejecutándose
docker ps

# Para detener Redis
docker stop redis

# Para iniciar Redis de nuevo
docker start redis

# Para eliminar el contenedor
docker rm redis
```

## 🐧 Opción 2: WSL (Windows Subsystem for Linux)

Si usas Windows:

```bash
# Instalar WSL si no lo tienes
wsl --install

# Abrir WSL
wsl

# Instalar Redis
sudo apt update
sudo apt install redis-server

# Iniciar Redis
redis-server

# En otra terminal, verificar conexión
redis-cli ping
```

## 📦 Opción 3: Instalar Redis nativo en Windows

1. Descargar Redis Stack desde: https://redis.io/download
2. Instalar el archivo .msi
3. Redis se ejecutará automáticamente como servicio

## 🔍 Verificar que Redis funciona

Una vez instalado, puedes verificar que funciona:

```bash
# Conectar con cliente de Redis
redis-cli

# Dentro del cliente, ejecutar:
ping
# Debería responder: PONG

# Salir del cliente
exit
```

## 🚀 Ejecutar la aplicación

Una vez que Redis esté ejecutándose:

```bash
npm run dev
```

Deberías ver:
```
✅ Redis conectado exitosamente
✅ Sistema de procesamiento bajo demanda configurado
```

## ❌ Si sigues teniendo problemas

1. Verifica que Redis esté ejecutándose en el puerto 6379
2. Revisa las variables de entorno en `.env`
3. Asegúrate de que no haya firewall bloqueando el puerto

## 🔧 Configuración avanzada

Puedes personalizar la conexión a Redis con variables de entorno:

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=tu_password
```