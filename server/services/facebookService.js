const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { getBinaryPaths } = require('./youtubeService');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

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
 * Obtiene información detallada de un video de Facebook (Reels, Watch, Video Posts)
 */
function getFacebookInfo(url) {
  return new Promise((resolve, reject) => {
    const { ytDlpCmd } = getBinaryPaths();
    const args = [
      '--dump-single-json',
      '--no-playlist',
      '--no-warnings',
      '--no-exec',
      '--',
      url
    ];

    const child = spawn(ytDlpCmd, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`No se pudo obtener información del video de Facebook: ${stderr || 'Código ' + code}`));
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
          { label: 'Máxima Calidad HD (Mejor disponible)', value: 'best' }
        ];

        sortedHeights.forEach(h => {
          let label = `${h}p`;
          if (h >= 1080) label += ' (Full HD)';
          else if (h >= 720) label += ' (HD)';
          else if (h >= 480) label += ' (SD)';
          videoQualities.push({ label, value: `${h}` });
        });

        resolve({
          id: info.id,
          title: (info.description || info.title || 'Video de Facebook').slice(0, 180),
          uploader: info.uploader || info.channel || 'Facebook User',
          thumbnail: info.thumbnail,
          duration: info.duration,
          durationFormatted: formatDuration(info.duration),
          url: info.webpage_url || url,
          qualities: videoQualities
        });
      } catch (err) {
        reject(new Error(`Fallo al parsear metadatos de Facebook: ${err.message}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Fallo al ejecutar motor de Facebook: ${err.message}`));
    });
  });
}

/**
 * Descarga video o audio de Facebook con yt-dlp y FFmpeg
 */
function downloadFacebook(options, onProgress, onProcessSpawn) {
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
        '-o', '%(title).150s [%(resolution)s].%(ext)s'
      );
    } else {
      args.push(
        '-x',
        '--audio-format', audioFormat,
        '--audio-quality', '0',
        '-o', '%(title).150s.%(ext)s'
      );
    }

    args.push('--', url);

    const child = spawn(ytDlpCmd, args);
    if (onProcessSpawn) onProcessSpawn(child);

    let downloadedFilePath = null;
    let isCancelled = false;

    child.stdout.on('data', (data) => {
      const text = data.toString('utf8');
      const lines = text.split('\n');

      for (const line of lines) {
        const destMatch = line.match(/\[(?:download|Merger)\]\s+Destination:\s+(.+)$/i);
        if (destMatch && destMatch[1]) {
          downloadedFilePath = destMatch[1].trim();
        }

        const alreadyMatch = line.match(/\[download\]\s+(.+?)\s+has already been downloaded/i);
        if (alreadyMatch && alreadyMatch[1]) {
          downloadedFilePath = alreadyMatch[1].trim();
        }

        const progMatch = line.match(/\[download\]\s+([\d\.]+)%\s+of\s+~?([\d\.]+\w+)\s+at\s+([\d\.]+\w+\/s)\s+ETA\s+([\d:]+)/i);
        if (progMatch) {
          const percent = parseFloat(progMatch[1]);
          const speed = progMatch[3];
          const eta = progMatch[4];
          onProgress({
            stage: 'downloading',
            percent,
            speed,
            eta,
            message: `Descargando de Facebook: ${percent}%`
          });
        }
      }
    });

    child.on('close', (code) => {
      if (isCancelled) return;
      if (code === 0) {
        onProgress({
          stage: 'completed',
          percent: 100,
          message: '¡Descarga de Facebook finalizada con éxito!',
          filePath: downloadedFilePath
        });
        resolve({ filePath: downloadedFilePath });
      } else {
        reject(new Error(`Descarga de Facebook finalizada con error (código ${code})`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Fallo al iniciar descarga de Facebook: ${err.message}`));
    });
  });
}

module.exports = {
  getFacebookInfo,
  downloadFacebook
};
