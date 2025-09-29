# 🚀 Instructions to install Redis

The API needs Redis to work correctly. Here are several options:

## 🐳 Option 1: Docker (RECOMMENDED)

If you have Docker installed:

```bash
# Download and start Redis
docker run -d -p 6379:6379 --name redis redis:alpine

# Verify it's running
docker ps

# To stop Redis
docker stop redis

# To start Redis again
docker start redis

# To remove the container
docker rm redis
```

## 🐧 Option 2: WSL (Windows Subsystem for Linux)

If you use Windows:

```bash
# Install WSL if you don't have it
wsl --install

# Open WSL
wsl

# Install Redis
sudo apt update
sudo apt install redis-server

# Start Redis
redis-server

# In another terminal, verify connection
redis-cli ping
```

## 📦 Option 3: Install native Redis on Windows

1. Download Redis Stack from: https://redis.io/download
2. Install the .msi file
3. Redis will run automatically as a service

## 🔍 Verify that Redis works

Once installed, you can verify it works:

```bash
# Connect with Redis client
redis-cli

# Inside the client, execute:
ping
# Should respond: PONG

# Exit the client
exit
```

## 🚀 Run the application

Once Redis is running:

```bash
npm run dev
```

You should see:
```
✅ Redis connected successfully
✅ On-demand processing system configured
```

## ❌ If you're still having problems

1. Verify that Redis is running on port 6379
2. Check the environment variables in `.env`
3. Make sure there's no firewall blocking the port

## 🔧 Advanced configuration

You can customize the Redis connection with environment variables:

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
```