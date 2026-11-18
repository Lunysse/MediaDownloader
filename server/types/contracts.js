/**
 * Contratos de Datos y Esquemas Estrictos
 * Elimina modelos ambiguos y valida estructuras en tiempo de ejecución.
 */

const JobStatus = Object.freeze({
  STARTING: 'starting',
  DOWNLOADING: 'downloading',
  PROCESSING: 'processing',
  TAGGING: 'tagging',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ERROR: 'error'
});

const MediaPlatform = Object.freeze({
  YOUTUBE: 'youtube',
  SPOTIFY: 'spotify',
  TWITTER: 'twitter',
  FACEBOOK: 'facebook',
  GIF: 'gif'
});

const DownloadMode = Object.freeze({
  VIDEO: 'video',
  AUDIO: 'audio',
  GIF: 'gif'
});

const AllowedAudioFormats = Object.freeze(['mp3', 'm4a', 'flac', 'wav']);

/**
 * Valida la estructura de una solicitud de descarga de YouTube
 */
function validateYouTubeDownloadRequest(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Cuerpo de la petición inválido.');
  }

  const { url, mode, quality, audioFormat } = body;
  if (!url || typeof url !== 'string') {
    throw new Error('El campo "url" es obligatorio y debe ser una cadena.');
  }

  const normalizedMode = mode === DownloadMode.AUDIO ? DownloadMode.AUDIO : DownloadMode.VIDEO;
  const normalizedFormat = AllowedAudioFormats.includes(audioFormat) ? audioFormat : 'mp3';
  const cleanQuality = quality ? String(quality).trim() : 'best';

  return {
    url: url.trim(),
    mode: normalizedMode,
    quality: cleanQuality,
    audioFormat: normalizedFormat,
    title: body.title ? String(body.title).substring(0, 250) : undefined,
    thumbnail: body.thumbnail ? String(body.thumbnail) : undefined,
    outputDir: body.outputDir ? String(body.outputDir) : undefined
  };
}

/**
 * Valida la estructura de una solicitud de descarga de Spotify
 */
function validateSpotifyDownloadRequest(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Cuerpo de la petición inválido.');
  }

  const normalizedFormat = AllowedAudioFormats.includes(body.audioFormat) ? body.audioFormat : 'mp3';

  if (Array.isArray(body.tracks) && body.tracks.length > 0) {
    const validatedTracks = body.tracks.map((t, index) => {
      if (!t.name || !t.artist) {
        throw new Error(`Pista en posición ${index} no tiene título o artista.`);
      }
      return {
        name: String(t.name).substring(0, 200).trim(),
        artist: String(t.artist).substring(0, 200).trim(),
        album: t.album ? String(t.album).substring(0, 200).trim() : undefined,
        year: t.year ? String(t.year).substring(0, 10).trim() : undefined,
        cover: t.cover ? String(t.cover) : undefined,
        index: t.index || (index + 1)
      };
    });

    return {
      type: 'batch',
      tracks: validatedTracks,
      audioFormat: normalizedFormat,
      outputDir: body.outputDir ? String(body.outputDir) : undefined
    };
  } else if (body.track && typeof body.track === 'object') {
    const t = body.track;
    if (!t.name || !t.artist) {
      throw new Error('La pista debe contener al menos un título y un artista.');
    }
    return {
      type: 'single',
      track: {
        name: String(t.name).substring(0, 200).trim(),
        artist: String(t.artist).substring(0, 200).trim(),
        album: t.album ? String(t.album).substring(0, 200).trim() : undefined,
        year: t.year ? String(t.year).substring(0, 10).trim() : undefined,
        cover: t.cover ? String(t.cover) : undefined,
        index: 1
      },
      audioFormat: normalizedFormat,
      outputDir: body.outputDir ? String(body.outputDir) : undefined
    };
  } else {
    throw new Error('Debe proporcionarse una pista individual ("track") o una lista de canciones ("tracks").');
  }
}

/**
 * Valida la estructura de una solicitud de descarga de X (Twitter)
 */
function validateTwitterDownloadRequest(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Cuerpo de la petición inválido.');
  }

  const { url, mode, quality, audioFormat, asGif } = body;
  if (!url || typeof url !== 'string') {
    throw new Error('El campo "url" es obligatorio y debe ser una cadena.');
  }

  let normalizedMode = DownloadMode.VIDEO;
  if (mode === DownloadMode.AUDIO) normalizedMode = DownloadMode.AUDIO;
  else if (mode === DownloadMode.GIF || asGif === true) normalizedMode = DownloadMode.GIF;

  const normalizedFormat = AllowedAudioFormats.includes(audioFormat) ? audioFormat : 'mp3';
  const cleanQuality = quality ? String(quality).trim() : 'best';

  return {
    url: url.trim(),
    mode: normalizedMode,
    quality: cleanQuality,
    audioFormat: normalizedFormat,
    asGif: normalizedMode === DownloadMode.GIF,
    title: body.title ? String(body.title).substring(0, 250) : undefined,
    thumbnail: body.thumbnail ? String(body.thumbnail) : undefined,
    outputDir: body.outputDir ? String(body.outputDir) : undefined
  };
}

/**
 * Valida la estructura de una solicitud de descarga de Facebook
 */
function validateFacebookDownloadRequest(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Cuerpo de la petición inválido.');
  }

  const { url, mode, quality, audioFormat } = body;
  if (!url || typeof url !== 'string') {
    throw new Error('El campo "url" es obligatorio y debe ser una cadena.');
  }

  const normalizedMode = mode === DownloadMode.AUDIO ? DownloadMode.AUDIO : DownloadMode.VIDEO;
  const normalizedFormat = AllowedAudioFormats.includes(audioFormat) ? audioFormat : 'mp3';
  const cleanQuality = quality ? String(quality).trim() : 'best';

  return {
    url: url.trim(),
    mode: normalizedMode,
    quality: cleanQuality,
    audioFormat: normalizedFormat,
    title: body.title ? String(body.title).substring(0, 250) : undefined,
    thumbnail: body.thumbnail ? String(body.thumbnail) : undefined,
    outputDir: body.outputDir ? String(body.outputDir) : undefined
  };
}

/**
 * Valida la estructura de una solicitud de conversión de video a GIF
 */
function validateGifConversionRequest(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Cuerpo de la petición inválido.');
  }

  const quality = ['high', 'medium', 'light'].includes(body.quality) ? body.quality : 'medium';
  const startTime = typeof body.startTime === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(body.startTime.trim()) 
    ? body.startTime.trim() 
    : '00:00:00';
  const duration = (body.duration && !isNaN(body.duration) && Number(body.duration) > 0 && Number(body.duration) <= 60)
    ? Number(body.duration)
    : 10;

  return {
    quality,
    startTime,
    duration,
    videoUrl: body.videoUrl ? String(body.videoUrl).trim() : undefined
  };
}

module.exports = {
  JobStatus,
  MediaPlatform,
  DownloadMode,
  AllowedAudioFormats,
  validateYouTubeDownloadRequest,
  validateSpotifyDownloadRequest,
  validateTwitterDownloadRequest,
  validateFacebookDownloadRequest,
  validateGifConversionRequest
};
