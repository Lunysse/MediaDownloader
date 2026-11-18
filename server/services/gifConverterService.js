const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { getBinaryPaths } = require('./youtubeService');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

/**
 * Convierte un archivo de video en un GIF animado de alta calidad con FFmpeg
 */
function convertVideoToGif(options, onProgress, onProcessSpawn) {
  return new Promise((resolve, reject) => {
    const { ffmpegCmd } = getBinaryPaths();
    const {
      inputPath,
      outputDir = path.join(PROJECT_ROOT, 'downloads'),
      quality = 'medium', // 'high' | 'medium' | 'light'
      startTime = '00:00:00',
      duration = 10,
      baseName = 'Animacion'
    } = options;

    if (!inputPath || !fs.existsSync(inputPath)) {
      return reject(new Error('El archivo de video de origen no existe o es inaccesible.'));
    }

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Configuración según la calidad seleccionada
    let scaleWidth = 480;
    let fps = 15;
    let maxColors = 256;

    if (quality === 'high') {
      scaleWidth = 600;
      fps = 20;
      maxColors = 256;
    } else if (quality === 'light') {
      scaleWidth = 320;
      fps = 12;
      maxColors = 128;
    }

    const cleanBase = baseName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || 'Animacion';
    const targetFileName = `${cleanBase}_${Date.now()}.gif`;
    const targetFilePath = path.join(outputDir, targetFileName);

    if (onProgress) {
      onProgress({
        stage: 'processing',
        percent: 20,
        message: `Optimizando paleta de colores para calidad ${quality.toUpperCase()} (${scaleWidth}px @ ${fps}fps)...`
      });
    }

    const ffmpegArgs = [
      '-y',
      '-ss', startTime,
      '-t', String(duration),
      '-i', inputPath,
      '-vf', `fps=${fps},scale=${scaleWidth}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=${maxColors}:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`,
      '-loop', '0',
      targetFilePath
    ];

    const child = spawn(ffmpegCmd, ffmpegArgs);
    if (onProcessSpawn) onProcessSpawn(child);

    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString('utf8');
      if (onProgress) {
        onProgress({
          stage: 'processing',
          percent: 65,
          message: 'Codificando cuadros del GIF...'
        });
      }
    });

    child.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(targetFilePath)) {
        return reject(new Error(`Fallo en la conversión a GIF con FFmpeg: ${stderr.slice(-300) || 'Código ' + code}`));
      }

      const stat = fs.statSync(targetFilePath);
      const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);

      if (onProgress) {
        onProgress({
          stage: 'completed',
          percent: 100,
          message: `¡GIF creado con éxito! (${sizeMb} MB)`,
          filePath: targetFilePath
        });
      }

      resolve({
        filePath: targetFilePath,
        fileName: targetFileName,
        fileSize: `${sizeMb} MB`
      });
    });

    child.on('error', (err) => {
      reject(new Error(`Error al iniciar FFmpeg: ${err.message}`));
    });
  });
}

module.exports = {
  convertVideoToGif
};
