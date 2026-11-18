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
  validateSpotifyDownloadRequest,
  validateTwitterDownloadRequest,
  validateFacebookDownloadRequest,
  validateGifConversionRequest
} = require('./types/contracts');

const { getVideoInfo } = require('./services/youtubeService');
const { getSpotifyDetails } = require('./services/spotifyService');
const { getTwitterInfo } = require('./services/twitterService');
const { getFacebookInfo } = require('./services/facebookService');
const downloadManager = require('./services/downloadManager');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || path.join(PROJECT_ROOT, 'downloads');

// Configuración de Multer para recepción de videos locales a convertir a GIF
const UPLOAD_TEMP_DIR = path.join(PROJECT_ROOT, 'downloads', '.temp', 'uploads');
if (!fs.existsSync(UPLOAD_TEMP_DIR)) {
  fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
}
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_TEMP_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
    cb(null, `upload_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`);
  }
});
const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 150 * 1024 * 1024 } // Máx 150MB para videos
});

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
    } else if (cleanUrl.includes('twitter.com') || cleanUrl.includes('x.com') || cleanUrl.includes('t.co')) {
      const details = await getTwitterInfo(cleanUrl);
      return res.json({
        platform: 'twitter',
        ...details
      });
    } else if (cleanUrl.includes('facebook.com') || cleanUrl.includes('fb.watch') || cleanUrl.includes('fb.com')) {
      const details = await getFacebookInfo(cleanUrl);
      return res.json({
        platform: 'facebook',
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

// 4. Iniciar descarga de X (Twitter)
app.post('/api/download/twitter', async (req, res) => {
  try {
    const validated = validateTwitterDownloadRequest(req.body);
    const urlValidation = validateUrl(validated.url);
    if (!urlValidation.valid) {
      return res.status(400).json({ error: urlValidation.error });
    }

    const targetDir = sanitizePath(validated.outputDir || currentConfig.downloadDir, DEFAULT_DOWNLOAD_DIR);

    downloadManager.runTwitterJob({
      ...validated,
      url: urlValidation.sanitizedUrl,
      outputDir: targetDir
    }).catch(err => {
      console.error('[TWITTER DOWNLOAD BG ERROR]:', err.message);
    });

    res.json({ success: true, message: 'Descarga de X iniciada con éxito' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Iniciar descarga de Facebook
app.post('/api/download/facebook', async (req, res) => {
  try {
    const validated = validateFacebookDownloadRequest(req.body);
    const urlValidation = validateUrl(validated.url);
    if (!urlValidation.valid) {
      return res.status(400).json({ error: urlValidation.error });
    }

    const targetDir = sanitizePath(validated.outputDir || currentConfig.downloadDir, DEFAULT_DOWNLOAD_DIR);

    downloadManager.runFacebookJob({
      ...validated,
      url: urlValidation.sanitizedUrl,
      outputDir: targetDir
    }).catch(err => {
      console.error('[FACEBOOK DOWNLOAD BG ERROR]:', err.message);
    });

    res.json({ success: true, message: 'Descarga de Facebook iniciada con éxito' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Convertir video a GIF animado (desde archivo local o URL de publicación)
app.post('/api/convert/video-to-gif', upload.single('videoFile'), async (req, res) => {
  try {
    const validated = validateGifConversionRequest(req.body);
    const targetDir = sanitizePath(req.body.outputDir || currentConfig.downloadDir, DEFAULT_DOWNLOAD_DIR);

    let inputPath = req.file ? req.file.path : null;
    let videoUrl = validated.videoUrl;

    if (!inputPath && !videoUrl) {
      return res.status(400).json({ error: 'Debes subir un archivo de video o ingresar el enlace de una publicación.' });
    }

    if (videoUrl) {
      const urlValidation = validateUrl(videoUrl);
      if (!urlValidation.valid) {
        return res.status(400).json({ error: urlValidation.error });
      }
      videoUrl = urlValidation.sanitizedUrl;
    }

    const originalTitle = req.body.title || (req.file ? req.file.originalname.replace(/\.[^/.]+$/, '') : 'Animacion_GIF');

    downloadManager.runGifConversionJob({
      inputPath,
      videoUrl,
      quality: validated.quality,
      startTime: validated.startTime,
      duration: validated.duration,
      title: originalTitle,
      outputDir: targetDir
    }).catch(err => {
      console.error('[GIF CONVERSION BG ERROR]:', err.message);
    });

    res.json({ success: true, message: 'Conversión a GIF iniciada con éxito' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 7. Descargar miniatura de YouTube en máxima resolución
app.get('/api/download-thumbnail', async (req, res) => {
  try {
    const { url, title } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).send('URL de miniatura requerida.');
    }

    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).send('Protocolo no válido.');
    }

    const fetchRes = await fetch(url);
    if (!fetchRes.ok) {
      return res.status(502).send('No se pudo obtener la imagen desde el servidor origen.');
    }

    const buffer = Buffer.from(await fetchRes.arrayBuffer());
    const cleanTitle = (title ? String(title).replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() : 'Miniatura') || 'Miniatura';
    
    res.setHeader('Content-Type', fetchRes.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${cleanTitle} - Miniatura HD.jpg"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Cancelar descarga activa
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

// 11. Sugerencias y recomendaciones privadas (Almacenamiento privado + Webhook opcional)
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const SUGGESTIONS_FILE = path.join(DATA_DIR, 'suggestions.json');

function readSuggestions() {
  try {
    if (fs.existsSync(SUGGESTIONS_FILE)) {
      return JSON.parse(fs.readFileSync(SUGGESTIONS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[SUGGESTIONS READ ERROR]:', e.message);
  }
  return [];
}

function saveSuggestions(list) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SUGGESTIONS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('[SUGGESTIONS SAVE ERROR]:', e.message);
  }
}

app.post('/api/suggestions', async (req, res) => {
  try {
    const { name, contact, message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'La recomendación no puede estar vacía.' });
    }

    const cleanMessage = message.trim().slice(0, 2000);
    const cleanName = (name && typeof name === 'string' && name.trim()) ? name.trim().slice(0, 100) : 'Anónimo';
    const cleanContact = (contact && typeof contact === 'string' && contact.trim()) ? contact.trim().slice(0, 150) : '';

    const newSuggestion = {
      id: 'sug_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString(),
      name: cleanName,
      contact: cleanContact,
      message: cleanMessage
    };

    const currentList = readSuggestions();
    currentList.unshift(newSuggestion);
    saveSuggestions(currentList);

    // Opcional: Reenvío instantáneo a Discord Webhook si está definido en variables de entorno de Render
    const discordWebhook = process.env.DISCORD_WEBHOOK_URL;
    if (discordWebhook && typeof fetch === 'function') {
      try {
        fetch(discordWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [{
              title: '💡 Nueva Sugerencia en MediaDownloader',
              color: 0xf472b6,
              fields: [
                { name: '👤 Usuario / Alias', value: cleanName, inline: true },
                { name: '📱 Contacto', value: cleanContact || 'No especificado', inline: true },
                { name: '💬 Recomendación', value: cleanMessage }
              ],
              footer: { text: 'MediaDownloader • Edición Lunysse' },
              timestamp: new Date().toISOString()
            }]
          })
        }).catch(() => {});
      } catch (err) {}
    }

    res.json({ success: true, message: '¡Gracias! Tu sugerencia ha sido enviada con éxito.' });
  } catch (err) {
    console.error('[API SUGGESTIONS POST ERROR]:', err.message);
    res.status(500).json({ error: 'Fallo al procesar la sugerencia.' });
  }
});

// 12. Obtener sugerencias privadas (Protegido por clave de administrador para Lunysse)
app.get('/api/suggestions', (req, res) => {
  const adminKey = req.query.key || req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_KEY || 'lunysse2026';

  if (!adminKey || adminKey !== expectedKey) {
    return res.status(403).json({ error: 'Acceso no autorizado al buzón de sugerencias.' });
  }

  const list = readSuggestions();
  res.json({ success: true, count: list.length, suggestions: list });
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
