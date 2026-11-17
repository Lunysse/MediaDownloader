const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn, execFile } = require('child_process');
const { getBinaryPaths } = require('./youtubeService');

// Inicializar spotify-url-info con node-fetch
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const spotify = require('spotify-url-info')(fetch);

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const TEMP_DIR = path.join(PROJECT_ROOT, 'downloads', '.temp');

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function formatDuration(ms) {
  if (!ms) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function sanitizeFilename(name) {
  // Elimina caracteres no permitidos en sistemas Windows y nombres de dispositivo reservados
  let clean = name.replace(/[\\/:*?"<>|]/g, '').trim();
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  if (reserved.test(clean)) clean = `_${clean}`;
  return clean || 'Track';
}

/**
 * Descarga una imagen remota a un archivo temporal
 */
function downloadImage(url, destPath) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const file = fs.createWriteStream(destPath);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location, destPath).then(resolve);
      }
      if (res.statusCode !== 200) {
        file.close();
        return resolve(null);
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(destPath));
      });
    }).on('error', () => {
      file.close();
      resolve(null);
    });
  });
}

/**
 * Obtiene los metadatos completos de un enlace de Spotify (Track, Álbum o Playlist)
 */
async function getSpotifyDetails(url) {
  try {
    const preview = await spotify.getPreview(url);
    const isCollection = preview.type === 'album' || preview.type === 'playlist';
    let tracks = [];

    if (isCollection) {
      const rawTracks = await spotify.getTracks(url);
      tracks = rawTracks.map((t, index) => ({
        index: index + 1,
        name: t.name || t.title,
        artist: t.artist || (t.artists && t.artists.map(a => a.name).join(', ')) || preview.artist || 'Desconocido',
        album: preview.title || 'Álbum Desconocido',
        durationFormatted: formatDuration(t.duration || t.duration_ms),
        duration: t.duration || t.duration_ms,
        previewUrl: t.previewUrl || null,
        cover: preview.image,
        year: preview.date ? preview.date.substring(0, 4) : ''
      }));
    } else {
      tracks = [{
        index: 1,
        name: preview.title || preview.track,
        artist: preview.artist || 'Desconocido',
        album: preview.album || preview.title,
        durationFormatted: 'N/A',
        previewUrl: preview.audio || null,
        cover: preview.image,
        year: preview.date ? preview.date.substring(0, 4) : ''
      }];
    }

    return {
      type: preview.type,
      title: preview.title,
      artist: preview.artist,
      cover: preview.image,
      trackCount: tracks.length,
      tracks
    };
  } catch (err) {
    throw new Error(`No se pudo obtener información de Spotify: ${err.message}`);
  }
}

/**
 * Descarga una pista individual de Spotify buscando en YouTube Music e incrustando metadatos HD
 */
function downloadSpotifyTrack(track, options, onProgress, onProcessSpawn) {
  return new Promise(async (resolve, reject) => {
    const { ytDlpCmd, ffmpegCmd, binDir, hasLocalFfmpeg } = getBinaryPaths();
    const {
      outputDir = path.join(PROJECT_ROOT, 'downloads'),
      audioFormat = 'mp3'
    } = options;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const cleanArtist = sanitizeFilename(track.artist);
    const cleanTitle = sanitizeFilename(track.name);
    const finalFileName = `${cleanArtist} - ${cleanTitle}.${audioFormat}`;
    const finalFilePath = path.join(outputDir, finalFileName);

    // Archivos temporales para procesamiento
    const tempAudioName = `temp_${Date.now()}_${Math.floor(Math.random() * 10000)}.${audioFormat}`;
    const tempAudioPath = path.join(TEMP_DIR, tempAudioName);
    const tempCoverPath = path.join(TEMP_DIR, `cover_${Date.now()}.jpg`);

    let isCancelled = false;

    function cleanup() {
      try {
        if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
        if (fs.existsSync(tempCoverPath)) fs.unlinkSync(tempCoverPath);
      } catch (e) {}
    }

    onProgress({
      stage: 'preparing',
      percent: 5,
      message: `Buscando pista en alta calidad: ${track.artist} - ${track.name}`
    });

    // 1. Descargar carátula de Spotify si está disponible
    if (track.cover) {
      await downloadImage(track.cover, tempCoverPath);
    }

    if (isCancelled) {
      cleanup();
      return reject(new Error('Descarga cancelada por el usuario.'));
    }

    // 2. Query de búsqueda de alta fidelidad: YouTube Music / Official Audio Topic
    const searchQuery = `ytsearch1:${track.artist} - ${track.name} audio`;

    const ytArgs = [
      '--newline',
      '--no-exec',
      '-x',
      '--audio-format', audioFormat,
      '--audio-quality', '0',
      '--no-playlist',
      '-o', tempAudioPath
    ];

    if (process.platform === 'win32') {
      ytArgs.push('--windows-filenames');
    }

    if (hasLocalFfmpeg) {
      ytArgs.push('--ffmpeg-location', binDir);
    }

    ytArgs.push('--', searchQuery);

    const child = spawn(ytDlpCmd, ytArgs);

    if (typeof onProcessSpawn === 'function') {
      onProcessSpawn(child, () => {
        isCancelled = true;
        cleanup();
      });
    }

    child.stdout.on('data', (data) => {
      if (isCancelled) return;
      const text = data.toString('utf8');
      const progMatch = text.match(/\[download\]\s+([\d\.]+)%\s+of\s+([~a-zA-Z0-9\.\s]+)\s+at\s+([a-zA-Z0-9\.\s\/]+)\s+ETA\s+([0-9\:]+)/i);
      if (progMatch) {
        const percent = parseFloat(progMatch[1]);
        const speed = progMatch[3].trim();
        const eta = progMatch[4].trim();
        onProgress({
          stage: 'downloading',
          percent: Math.min(85, Math.floor(percent * 0.85)),
          speed,
          eta,
          message: `Descargando audio HD... ${percent}% (${speed})`
        });
      } else if (text.includes('[ExtractAudio]') || text.includes('[ffmpeg]')) {
        onProgress({
          stage: 'processing',
          percent: 90,
          message: 'Extrayendo flujo de audio de alta fidelidad...'
        });
      }
    });

    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString('utf8');
    });

    child.on('close', (code) => {
      if (isCancelled) {
        cleanup();
        onProgress({
          stage: 'cancelled',
          percent: 0,
          message: 'Descarga cancelada por el usuario.'
        });
        return reject(new Error('Descarga cancelada por el usuario.'));
      }

      if (code !== 0) {
        cleanup();
        return reject(new Error(`Error descargando audio de ${track.name}: ${stderr}`));
      }

      onProgress({
        stage: 'tagging',
        percent: 95,
        message: 'Incrustando portada original de Spotify y metadatos ID3...'
      });

      // 3. Incrustar metadatos oficiales y carátula con FFmpeg
      tagFileWithFfmpeg(tempAudioPath, tempCoverPath, finalFilePath, track, audioFormat, ffmpegCmd)
        .then(() => {
          cleanup();
          onProgress({
            stage: 'completed',
            percent: 100,
            filePath: finalFilePath,
            message: `¡Completado!: ${cleanTitle}`
          });
          resolve({ success: true, filePath: finalFilePath, track });
        })
        .catch(() => {
          if (fs.existsSync(tempAudioPath)) {
            try {
              fs.renameSync(tempAudioPath, finalFilePath);
            } catch (e) {}
          }
          cleanup();
          onProgress({
            stage: 'completed',
            percent: 100,
            filePath: finalFilePath,
            message: `¡Completado!: ${cleanTitle}`
          });
          resolve({ success: true, filePath: finalFilePath, track });
        });
    });

    child.on('error', (err) => {
      cleanup();
      if (isCancelled) return;
      reject(err);
    });
  });
}

/**
 * Incrusta metadatos y carátula usando FFmpeg
 */
function tagFileWithFfmpeg(inputAudio, inputCover, outputFile, track, format, ffmpegCmd) {
  return new Promise((resolve, reject) => {
    const hasCover = fs.existsSync(inputCover);
    const args = ['-y', '-i', inputAudio];

    if (hasCover) {
      args.push('-i', inputCover);
      args.push(
        '-map', '0:a',
        '-map', '1:v',
        '-c:a', 'copy',
        '-c:v', 'mjpeg',
        '-metadata:s:v', 'title="Album cover"',
        '-metadata:s:v', 'comment="Cover (front)"'
      );
    } else {
      args.push('-c', 'copy');
    }

    if (format === 'mp3') {
      args.push('-id3v2_version', '3');
    }

    if (track.name) args.push('-metadata', `title=${track.name}`);
    if (track.artist) args.push('-metadata', `artist=${track.artist}`);
    if (track.album) args.push('-metadata', `album=${track.album}`);
    if (track.year) args.push('-metadata', `date=${track.year}`);
    if (track.index) args.push('-metadata', `track=${track.index}`);

    args.push(outputFile);

    execFile(ffmpegCmd, args, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

module.exports = {
  getSpotifyDetails,
  downloadSpotifyTrack
};
