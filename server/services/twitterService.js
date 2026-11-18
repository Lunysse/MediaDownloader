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
 * Obtiene información detallada de una publicación de X (Twitter)
 */
function getTwitterInfo(url) {
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
        return reject(new Error(`No se pudo obtener información de X (Twitter): ${stderr || 'Código ' + code}`));
      }

      try {
        const info = JSON.parse(stdout);

        // Detectar si es GIF animado de Twitter o video tradicional
        const hasTweetVideoUrl = Boolean(
          (info.url && info.url.includes('/tweet_video/')) ||
          (Array.isArray(info.formats) && info.formats.some(f => f.url && f.url.includes('/tweet_video/')))
        );

        const isGif = hasTweetVideoUrl || (info.acodec === 'none' && info.vcodec && info.duration && info.duration <= 10);

        // Extraer enlace directo del archivo multimedia (para reproducir de inmediato en cualquier sitio)
        let directMediaUrl = '';
        if (info.url && (info.url.includes('.mp4') || info.url.includes('twimg.com'))) {
          directMediaUrl = info.url;
        } else if (Array.isArray(info.formats) && info.formats.length > 0) {
          const directFormats = info.formats
            .filter(f => f.url && (f.url.includes('.mp4') || f.url.includes('twimg.com')))
            .sort((a, b) => ((b.height || 0) * (b.width || 0)) - ((a.height || 0) * (a.width || 0)));
          if (directFormats.length > 0) {
            directMediaUrl = directFormats[0].url;
          }
        }
        if (!directMediaUrl && info.webpage_url) {
          directMediaUrl = info.webpage_url;
        }

        // Calidades de video disponibles
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
          { label: 'Máxima Calidad (Mejor disponible)', value: 'best' }
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
          title: (info.description || info.title || 'Publicación en X (Twitter)').slice(0, 180),
          uploader: info.uploader || info.uploader_id || 'Twitter User',
          uploaderHandle: info.uploader_id ? `@${info.uploader_id}` : (info.uploader ? `@${info.uploader}` : ''),
          thumbnail: info.thumbnail,
          duration: info.duration,
          durationFormatted: formatDuration(info.duration),
          url: info.webpage_url || url,
          directMediaUrl: directMediaUrl,
          isGif: isGif,
          qualities: videoQualities
        });
      } catch (err) {
        reject(new Error(`Fallo al parsear metadatos de X (Twitter): ${err.message}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Fallo al ejecutar motor de X (Twitter): ${err.message}`));
    });
  });
}

/**
 * Descarga video o convierte a GIF desde X (Twitter)
 */
function downloadTwitter(options, onProgress, onProcessSpawn) {
  return new Promise((resolve, reject) => {
    const { ytDlpCmd, ffmpegCmd, binDir, hasLocalFfmpeg } = getBinaryPaths();
    const {
      url,
      mode = 'video', // 'video' | 'audio' | 'gif'
      quality = 'best',
      audioFormat = 'mp3',
      asGif = false,
      outputDir = path.join(PROJECT_ROOT, 'downloads')
    } = options;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const isGifMode = mode === 'gif' || asGif === true;

    // Si es modo GIF nativo, descargamos el MP4 a un archivo temporal y lo convertimos a .gif con FFmpeg
    if (isGifMode) {
      onProgress({ stage: 'starting', percent: 5, message: 'Preparando descarga de animación de X...' });

      const tempDir = path.join(PROJECT_ROOT, 'downloads', '.temp');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      const tempVideo = path.join(tempDir, `twitter_${Date.now()}_raw.mp4`);
      const targetGifName = `X_GIF_${Date.now()}.gif`;
      const finalGifPath = path.join(outputDir, targetGifName);

      const dlArgs = [
        '--newline',
        '--no-exec',
        '-f', 'best',
        '-o', tempVideo,
        '--',
        url
      ];

      const child = spawn(ytDlpCmd, dlArgs);
      if (onProcessSpawn) onProcessSpawn(child);

      child.on('close', (code) => {
        if (code !== 0 || !fs.existsSync(tempVideo)) {
          return reject(new Error('Fallo al descargar video base de Twitter para convertir a GIF.'));
        }

        onProgress({ stage: 'processing', percent: 60, message: 'Convirtiendo loop a GIF animado de alta resolución...' });

        // Conversión FFmpeg de dos pasadas con paleta optimizada
        const ffmpegArgs = [
          '-y',
          '-i', tempVideo,
          '-vf', 'fps=18,scale=540:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5',
          '-loop', '0',
          finalGifPath
        ];

        const ffmpegProc = spawn(ffmpegCmd, ffmpegArgs);
        if (onProcessSpawn) onProcessSpawn(ffmpegProc);

        ffmpegProc.on('close', (fCode) => {
          // Limpiar archivo temporal
          try { if (fs.existsSync(tempVideo)) fs.unlinkSync(tempVideo); } catch (e) {}

          if (fCode !== 0 || !fs.existsSync(finalGifPath)) {
            return reject(new Error('Fallo en la codificación del archivo GIF con FFmpeg.'));
          }

          onProgress({ stage: 'completed', percent: 100, message: '¡GIF generado con éxito!', filePath: finalGifPath });
          resolve({ filePath: finalGifPath, fileName: targetGifName });
        });

        ffmpegProc.on('error', (err) => {
          try { if (fs.existsSync(tempVideo)) fs.unlinkSync(tempVideo); } catch (e) {}
          reject(new Error(`Error al invocar FFmpeg para GIF: ${err.message}`));
        });
      });

      child.on('error', (err) => {
        reject(new Error(`Error al invocar yt-dlp para X: ${err.message}`));
      });

      return;
    }

    // Modo Video o Audio estándar
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
      // Audio mode
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
            message: `Descargando de X: ${percent}%`
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
          message: '¡Descarga de X finalizada con éxito!',
          filePath: downloadedFilePath
        });
        resolve({ filePath: downloadedFilePath });
      } else {
        reject(new Error(`Descarga de X finalizada con error (código ${code})`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Fallo al iniciar descarga de X: ${err.message}`));
    });
  });
}

module.exports = {
  getTwitterInfo,
  downloadTwitter
};
