# ---- Stage 1: Build ----
FROM node:22-bookworm-slim AS builder

# Install pnpm v9 (v11 enforces strict build checks that break puppeteer)
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy dependency manifests
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# ---- Stage 2: Runtime ----
FROM node:22-bookworm-slim

# Install Chromium and all required system libraries for Puppeteer/WhatsApp Web
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-sandbox \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use the system-installed Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Create non-root user for security
RUN groupadd -r nodeapp && useradd -r -g nodeapp -G audio,video nodeapp \
    && mkdir -p /home/nodeapp/Downloads \
    && chown -R nodeapp:nodeapp /home/nodeapp

WORKDIR /app

# Copy node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application source code
COPY index.js ./
COPY src/ ./src/

# Create volumes for persistent WhatsApp session data
RUN mkdir -p /app/.wwebjs_auth /app/.wwebjs_cache \
    && chown -R nodeapp:nodeapp /app

# Switch to non-root user
USER nodeapp

# Expose the application port
EXPOSE 6900

# Healthcheck using Node.js (no extra dependencies needed)
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:6900/test').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

# Start the application
CMD ["node", "index.js"]
