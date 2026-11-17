const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const BIN_DIR = path.join(PROJECT_ROOT, 'bin');

function getBinaryPaths() {
  const isWin = process.platform === 'win32';
  const localYtDlp = isWin ? path.join(BIN_DIR, 'yt-dlp.exe') : path.join(BIN_DIR, 'yt-dlp');
  const ytDlpCmd = fs.existsSync(localYtDlp) ? localYtDlp : 'yt-dlp';

  const localFfmpeg = isWin ? path.join(BIN_DIR, 'ffmpeg.exe') : path.join(BIN_DIR, 'ffmpeg');
  const ffmpegCmd = fs.existsSync(localFfmpeg) ? localFfmpeg : 'ffmpeg';
  const hasLocalFfmpeg = fs.existsSync(localFfmpeg);

  return { ytDlpCmd, ffmpegCmd, binDir: BIN_DIR, hasLocalFfmpeg };
}

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Obtiene información detallada del video o playlist con blindaje de argumentos
 */
function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const { ytDlpCmd } = getBinaryPaths();
    const args = [
      '--dump-single-json',
      '--no-playlist',
      '--no-warnings',
      '--no-exec',
      '--', // Previene inyección de flags en la URL
      url
    ];

    const child = spawn(ytDlpCmd, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString('utf8');
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString('utf8');
    });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Error al obtener información de YouTube: ${stderr || 'Código de salida ' + code}`));
      }

      try {
        const info = JSON.parse(stdout);
        const availableHeights = new Set();
        
        if (Array.isArray(info.formats)) {
          info.formats.forEach(f => {
            if (f.height && f.vcodec && f.vcodec !== 'none') {
              availableHeights.add(f.height);
            }
          });
        }

        const sortedHeights = Array.from(availableHeights).sort((a, b) => b - a);
        
        const videoQualities = [
          { label: 'Mejor disponible (Automático)', value: 'best' }
        ];

        sortedHeights.forEach(h => {
          let label = `${h}p`;
          if (h >= 2160) label += ' (4K Ultra HD)';
          else if (h >= 1440) label += ' (2K Quad HD)';
          else if (h >= 1080) label += ' (Full HD)';
          else if (h >= 720) label += ' (HD)';
          videoQualities.push({ label, value: `${h}` });
        });

        resolve({
          id: info.id,
          title: info.title,
          thumbnail: info.thumbnail,
          uploader: info.uploader || info.channel || 'Desconocido',
          duration: info.duration,
          durationFormatted: formatDuration(info.duration),
          viewCount: info.view_count,
          url: info.webpage_url || url,
          qualities: videoQualities
        });
      } catch (err) {
        reject(new Error(`Fallo al parsear metadatos: ${err.message}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Fallo al ejecutar yt-dlp: ${err.message}`));
    });
  });
}

/**
 * Descarga video o audio con yt-dlp, blindaje de argumentos y soporte de cancelación
 */
function downloadYouTube(options, onProgress, onProcessSpawn) {
  return new Promise((resolve, reject) => {
    const { ytDlpCmd, binDir, hasLocalFfmpeg } = getBinaryPaths();
    const {
      url,
      mode = 'video',
      quality = 'best',
      audioFormat = 'mp3',
      outputDir = path.join(PROJECT_ROOT, 'downloads')
    } = options;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const args = [
      '--newline',
      '--no-exec',
      '-P', outputDir
    ];

    if (process.platform === 'win32') {
      args.push('--windows-filenames');
    }

    if (hasLocalFfmpeg) {
      args.push('--ffmpeg-location', binDir);
    }

    if (mode === 'video') {
      let formatFilter = 'bestvideo+bestaudio/best';
      if (quality !== 'best' && !isNaN(quality)) {
        formatFilter = `bestvideo[height<=?${quality}]+bestaudio/best[height<=?${quality}]/best`;
      }
      args.push(
        '-f', formatFilter,
        '--merge-output-format', 'mp4',
        '-o', '%(title)s [%(resolution)s].%(ext)s'
      );
    } else {
      // Audio mode
      args.push(
        '-x',
        '--audio-format', audioFormat,
        '--audio-quality', '0',
        '--embed-thumbnail',
        '--add-metadata',
        '-o', '%(title)s.%(ext)s'
      );
    }

    // Delimitador de seguridad: asegura que la URL no sea interpretada como argumento
    args.push('--', url);

    const child = spawn(ytDlpCmd, args);
    let downloadedFilePath = '';
    let isCancelled = false;

    if (typeof onProcessSpawn === 'function') {
      onProcessSpawn(child, () => {
        isCancelled = true;
      });
    }

    child.stdout.on('data', (data) => {
      if (isCancelled) return;
      const text = data.toString('utf8');
      const lines = text.split('\n');

      for (const line of lines) {
        const destMatch = line.match(/\[(?:download|Merger|ExtractAudio)\] (?:Destination:|Merging formats into) (.+)/i);
        if (destMatch && destMatch[1]) {
          downloadedFilePath = destMatch[1].trim().replace(/^["']|["']$/g, '');
        }

        const progMatch = line.match(/\[download\]\s+([\d\.]+)%\s+of\s+([~a-zA-Z0-9\.\s]+)\s+at\s+([a-zA-Z0-9\.\s\/]+)\s+ETA\s+([0-9\:]+)/i);
        if (progMatch) {
          const percent = parseFloat(progMatch[1]);
          const totalSize = progMatch[2].trim();
          const speed = progMatch[3].trim();
          const eta = progMatch[4].trim();

          if (!isNaN(percent)) {
            onProgress({
              stage: 'downloading',
              percent,
              totalSize,
              speed,
              eta,
              message: `Descargando... ${percent}% (${speed})`
            });
          }
        } else if (line.includes('[Merger]') || line.includes('[ExtractAudio]') || line.includes('[ffmpeg]')) {
          onProgress({
            stage: 'processing',
            percent: 98,
            message: 'Procesando y empaquetando con FFmpeg...'
          });
        }
      }
    });

    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString('utf8');
    });

    child.on('close', (code) => {
      if (isCancelled) {
        onProgress({
          stage: 'cancelled',
          percent: 0,
          message: 'Descarga cancelada por el usuario.'
        });
        return reject(new Error('Descarga cancelada por el usuario.'));
      }

      if (code === 0) {
        onProgress({
          stage: 'completed',
          percent: 100,
          filePath: downloadedFilePath,
          message: '¡Descarga completada con éxito!'
        });
        resolve({ success: true, filePath: downloadedFilePath });
      } else {
        const errorMsg = stderr || `Error durante la descarga (código ${code})`;
        onProgress({
          stage: 'error',
          error: errorMsg,
          message: 'Error en la descarga'
        });
        reject(new Error(errorMsg));
      }
    });

    child.on('error', (err) => {
      if (isCancelled) return;
      onProgress({
        stage: 'error',
        error: err.message,
        message: 'Error al iniciar el proceso'
      });
      reject(err);
    });
  });
}

module.exports = {
  getVideoInfo,
  downloadYouTube,
  getBinaryPaths
};
