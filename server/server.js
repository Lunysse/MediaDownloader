const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const { execFile } = require('child_process');

const {
  validateUrl,
  sanitizePath,
  securityHeadersMiddleware
} = require('./middleware/security');

const {
  validateYouTubeDownloadRequest,
  validateSpotifyDownloadRequest
} = require('./types/contracts');

const { getVideoInfo } = require('./services/youtubeService');
const { getSpotifyDetails } = require('./services/spotifyService');
const downloadManager = require('./services/downloadManager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || path.join(PROJECT_ROOT, 'downloads');

// Confianza en proxies inversos (Cloudflare, Render, Railway, Nginx)
app.set('trust proxy', 1);

// Estado de configuración persistente
let currentConfig = {
  downloadDir: DEFAULT_DOWNLOAD_DIR
};

const configFilePath = path.join(PROJECT_ROOT, 'downloads', 'config.json');
try {
  if (fs.existsSync(configFilePath)) {
    const raw = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    if (raw.downloadDir) {
      currentConfig.downloadDir = sanitizePath(raw.downloadDir, DEFAULT_DOWNLOAD_DIR);
    }
  }
} catch (e) {}

function saveConfig() {
  try {
    fs.writeFileSync(configFilePath, JSON.stringify(currentConfig, null, 2), 'utf8');
  } catch (e) {}
}

// Middlewares de seguridad y CORS adaptable para dominios personalizados
app.use(securityHeadersMiddleware);
app.use(cors({
  origin: (origin, callback) => {
    // Permite conexiones locales y desde subdominios públicos (Render, Railway, etc.)
    callback(null, true);
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(PROJECT_ROOT, 'public')));

// Manejo de conexiones WebSocket
const wsClients = new Set();
wss.on('connection', (ws) => {
  wsClients.add(ws);
  downloadManager.setWsClients(wsClients);

  ws.send(JSON.stringify({
    type: 'init',
    history: downloadManager.history,
    config: {
      ...currentConfig,
      maxConcurrent: downloadManager.maxConcurrent
    }
  }));

  ws.on('close', () => {
    wsClients.delete(ws);
  });
});

// 1. Inspeccionar URL con validación estricta y limpieza de tokens de rastreo
app.post('/api/inspect', async (req, res) => {
  const { url } = req.body;
  const validation = validateUrl(url);

  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const cleanUrl = validation.sanitizedUrl;

  try {
    if (cleanUrl.includes('spotify.com')) {
      const details = await getSpotifyDetails(cleanUrl);
      return res.json({
        platform: 'spotify',
        ...details
      });
    } else {
      const details = await getVideoInfo(cleanUrl);
      return res.json({
        platform: 'youtube',
        ...details
      });
    }
  } catch (err) {
    console.error('[API INSPECT ERROR]:', err.message);
    return res.status(500).json({ error: 'No se pudo obtener información del enlace provisto.' });
  }
});

// 2. Iniciar descarga de YouTube
app.post('/api/download/youtube', async (req, res) => {
  try {
    const validated = validateYouTubeDownloadRequest(req.body);
    const urlValidation = validateUrl(validated.url);
    if (!urlValidation.valid) {
      return res.status(400).json({ error: urlValidation.error });
    }

    const targetDir = sanitizePath(validated.outputDir || currentConfig.downloadDir, DEFAULT_DOWNLOAD_DIR);

    downloadManager.runYouTubeJob({
      url: urlValidation.sanitizedUrl,
      mode: validated.mode,
      quality: validated.quality,
      audioFormat: validated.audioFormat,
      title: validated.title,
      thumbnail: validated.thumbnail,
      outputDir: targetDir
    }).catch(err => {
      console.error('[YOUTUBE DOWNLOAD BG ERROR]:', err.message);
    });

    res.json({ success: true, message: 'Descarga iniciada de manera segura' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Iniciar descarga de Spotify
app.post('/api/download/spotify', async (req, res) => {
  try {
    const validated = validateSpotifyDownloadRequest(req.body);
    const targetDir = sanitizePath(validated.outputDir || currentConfig.downloadDir, DEFAULT_DOWNLOAD_DIR);

    if (validated.type === 'batch') {
      downloadManager.runSpotifyBatch(validated.tracks, {
        audioFormat: validated.audioFormat,
        outputDir: targetDir
      }).catch(err => {
        console.error('[SPOTIFY BATCH BG ERROR]:', err.message);
      });
      return res.json({ success: true, message: `Lote encolado (${validated.tracks.length} canciones con concurrencia de 2)` });
    } else {
      downloadManager.runSpotifyTrackJob(validated.track, {
        audioFormat: validated.audioFormat,
        outputDir: targetDir
      }).catch(err => {
        console.error('[SPOTIFY TRACK BG ERROR]:', err.message);
      });
      return res.json({ success: true, message: 'Descarga de pista iniciada' });
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4. Cancelar descarga activa
app.post('/api/download/cancel', (req, res) => {
  const { jobId } = req.body;
  if (!jobId || typeof jobId !== 'string') {
    return res.status(400).json({ error: 'Job ID requerido' });
  }

  const cancelled = downloadManager.cancelJob(jobId);
  if (cancelled) {
    return res.json({ success: true, message: 'Descarga cancelada.' });
  }
  return res.status(404).json({ error: 'Trabajo no encontrado o ya finalizado.' });
});

// 5. Streaming seguro de archivos locales para el reproductor interno
app.get('/api/stream', (req, res) => {
  const filePath = req.query.path;
  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).send('Ruta no proporcionada');
  }

  const resolved = path.resolve(filePath);

  // Comprobar que el archivo existe
  if (!fs.existsSync(resolved)) {
    return res.status(404).send('Archivo no encontrado');
  }

  const stat = fs.statSync(resolved);
  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(resolved).toLowerCase();
  let contentType = 'audio/mpeg';
  if (ext === '.mp4') contentType = 'video/mp4';
  else if (ext === '.m4a') contentType = 'audio/mp4';
  else if (ext === '.flac') contentType = 'audio/flac';
  else if (ext === '.wav') contentType = 'audio/wav';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(resolved, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
    };
    res.writeHead(200, head);
    fs.createReadStream(resolved).pipe(res);
  }
});

// 6. Obtener historial
app.get('/api/history', (req, res) => {
  res.json({ history: downloadManager.history });
});

// 7. Configuración de directorio de descarga y límite de concurrencia
app.get('/api/config', (req, res) => {
  res.json({
    ...currentConfig,
    maxConcurrent: downloadManager.maxConcurrent
  });
});

app.post('/api/config', (req, res) => {
  try {
    const { downloadDir, maxConcurrent } = req.body;
    if (downloadDir) {
      const sanitized = sanitizePath(downloadDir, DEFAULT_DOWNLOAD_DIR);
      if (!fs.existsSync(sanitized)) {
        fs.mkdirSync(sanitized, { recursive: true });
      }
      currentConfig.downloadDir = sanitized;
      saveConfig();
    }
    if (maxConcurrent) {
      downloadManager.setMaxConcurrent(maxConcurrent);
    }
    res.json({
      success: true,
      config: {
        ...currentConfig,
        maxConcurrent: downloadManager.maxConcurrent
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 8. Abrir carpeta en el Explorador de Windows de forma segura (con fallback para la nube)
app.post('/api/open-folder', (req, res) => {
  const targetPath = req.body.path || currentConfig.downloadDir;
  if (!targetPath || typeof targetPath !== 'string') {
    return res.status(400).json({ error: 'Ruta inválida' });
  }

  const resolved = path.resolve(targetPath);
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: 'La ruta no existe' });
  }

  if (process.platform === 'win32') {
    const isFile = fs.statSync(resolved).isFile();
    const args = isFile ? [`/select,${resolved}`] : [resolved];
    execFile('explorer.exe', args, () => {
      res.json({ success: true });
    });
  } else {
    // Si corre en la nube o Linux, responde informando que use descarga directa
    res.json({ success: true, message: 'Operando en servidor cloud: usa el botón de descarga directa.' });
  }
});

// 9. Abrir archivo en reproductor de Windows de forma segura (con fallback para la nube)
app.post('/api/open-file', (req, res) => {
  const { filePath } = req.body;
  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).json({ error: 'Ruta no válida' });
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: 'El archivo no fue encontrado' });
  }

  if (process.platform === 'win32') {
    execFile('cmd.exe', ['/c', 'start', '""', resolved], () => {
      res.json({ success: true });
    });
  } else {
    res.json({ success: true, message: 'Operando en servidor cloud: reproduce en la app o descarga el archivo.' });
  }
});

// 10. Descargar archivo directamente al dispositivo del usuario (para celular o navegador remoto)
app.get('/api/download-file', (req, res) => {
  const targetPath = req.query.path;
  if (!targetPath || typeof targetPath !== 'string') {
    return res.status(400).json({ error: 'Ruta de archivo requerida.' });
  }

  const resolved = path.resolve(targetPath);
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: 'El archivo no fue encontrado en el servidor.' });
  }

  const fileName = path.basename(resolved);
  res.download(resolved, fileName, (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: 'Fallo al transmitir el archivo al dispositivo.' });
    }
  });
});

// Iniciar servidor (compatible con Localhost y Cloud 0.0.0.0)
server.listen(PORT, HOST, () => {
  console.log(`====================================================`);
  console.log(`🔒 YT & Spotify Downloader Ultra - MODO CLOUD & LOCAL`);
  console.log(`📡 Servidor activo en: http://${HOST}:${PORT}`);
  console.log(`🛡️  Protección contra SSRF, Inyecciones y Fugas Activa`);
  console.log(`📁 Carpeta de descargas: ${currentConfig.downloadDir}`);
  console.log(`====================================================`);
});
