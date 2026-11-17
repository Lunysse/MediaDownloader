# ==============================================================================
# Dockerfile para MediaDownloader Ultra (Edición Lunysse)
# Despliegue 24/7 en la nube (Render, Railway, Fly.io o VPS Linux)
# ==============================================================================

FROM node:20-bookworm-slim

# Instalar dependencias del sistema operativo: Python 3, FFmpeg y utilitarios
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    ffmpeg \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Descargar e instalar el binario nativo de yt-dlp para Linux
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Directorio de la aplicación en el contenedor
WORKDIR /app

# Copiar manifiesto de dependencias e instalar solo paquetes de producción
COPY package.json ./
RUN npm install --omit=dev

# Copiar código fuente del servidor y frontend
COPY server/ ./server/
COPY public/ ./public/

# Crear carpeta de descargas persistente
RUN mkdir -p /app/downloads/downloads

# Configuración de variables de entorno para la nube
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DOWNLOAD_DIR=/app/downloads

# Puerto expuesto por el contenedor
EXPOSE 3000

# Comando de inicio del servidor
CMD ["node", "server/server.js"]
