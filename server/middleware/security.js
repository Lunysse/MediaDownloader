const path = require('path');
const fs = require('fs');

/**
 * Módulo de Seguridad y Privacidad
 * - Previene Command Injection, SSRF, Argument Injection y Path Traversal
 * - Limpia tokens de rastreo para evitar filtración de metadatos del usuario
 */

// Dominios estrictamente permitidos
const ALLOWED_DOMAINS = [
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'open.spotify.com',
  'spotify.com'
];

// Directorios protegidos de Windows donde NO se permite guardar descargas
const PROTECTED_SYSTEM_PATHS = [
  process.env.WINDIR || 'C:\\Windows',
  process.env.SYSTEMROOT || 'C:\\Windows',
  process.env.PROGRAMFILES || 'C:\\Program Files',
  process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
  path.join(process.env.WINDIR || 'C:\\Windows', 'System32')
].map(p => p.toLowerCase());

/**
 * Limpia parámetros de rastreo y telemetría de las URLs
 * Protege contra filtración de identidad en enlaces compartidos
 */
function sanitizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  
  let trimmed = rawUrl.trim();
  
  try {
    const parsed = new URL(trimmed);
    
    // Lista de parámetros de telemetría y rastreo conocidos
    const trackingParams = [
      'si',           // Spotify Share ID / Identificador de usuario que compartió
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
      'feature',      // Parámetro de tracking de YouTube
      'app'
    ];

    trackingParams.forEach(param => {
      parsed.searchParams.delete(param);
    });

    // Limpiar radios automáticas de YouTube Music si es un track individual
    if (parsed.searchParams.has('list') && parsed.searchParams.get('list').startsWith('RD')) {
      parsed.searchParams.delete('list');
      parsed.searchParams.delete('index');
    }

    return parsed.toString();
  } catch (e) {
    // Si no es parseable como URL estándar, devolver limpio de espacios
    return trimmed;
  }
}

/**
 * Valida rigurosamente si la URL es segura y pertenece a una plataforma autorizada
 */
function validateUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'La URL no puede estar vacía.' };
  }

  const trimmed = rawUrl.trim();

  // 1. Prohibir argumentos CLI inyectados (URLs que comiencen con '-')
  if (trimmed.startsWith('-')) {
    return { valid: false, error: 'Entrada inválida: intento de inyección de argumentos detectado.' };
  }

  // 2. Comprobar caracteres peligrosos de shell
  if (/[;&|`$<>]/.test(trimmed)) {
    return { valid: false, error: 'Entrada inválida: contiene caracteres de shell no permitidos.' };
  }

  // 3. Parsear URL con protocolo estándar
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (err) {
    return { valid: false, error: 'El formato de la URL no es válido.' };
  }

  // 4. Exclusivamente HTTP o HTTPS
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Protocolo no permitido. Solo se aceptan enlaces HTTPS o HTTP.' };
  }

  // 5. Prevenir SSRF (Server-Side Request Forgery) hacia localhost o redes privadas
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('172.16.') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return { valid: false, error: 'Acceso a direcciones locales o privadas denegado (SSRF Guard).' };
  }

  // 6. Validar contra la lista blanca de dominios autorizados
  const isAllowed = ALLOWED_DOMAINS.some(allowed => 
    hostname === allowed || hostname.endsWith('.' + allowed)
  );

  if (!isAllowed) {
    return {
      valid: false,
      error: 'Dominio no autorizado. Solo se permiten enlaces oficiales de YouTube y Spotify.'
    };
  }

  return { valid: true, sanitizedUrl: sanitizeUrl(trimmed), hostname };
}

/**
 * Valida y canonicaliza rutas de guardado para evitar Path Traversal
 */
function sanitizePath(userPath, defaultBaseDir) {
  if (!userPath || typeof userPath !== 'string') {
    return defaultBaseDir;
  }

  const resolved = path.resolve(userPath.trim());
  const lower = resolved.toLowerCase();

  // Comprobar que no apunte a directorios críticos del sistema operativo
  for (const protectedPath of PROTECTED_SYSTEM_PATHS) {
    if (lower === protectedPath || lower.startsWith(protectedPath + path.sep)) {
      throw new Error(`Acceso denegado: No está permitido guardar en directorios del sistema (${protectedPath}).`);
    }
  }

  return resolved;
}

/**
 * Middleware para aplicar encabezados de seguridad HTTP
 */
function securityHeadersMiddleware(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' https: http: data: blob: ws: wss:; connect-src 'self' https: http: ws: wss:;");
  next();
}

module.exports = {
  sanitizeUrl,
  validateUrl,
  sanitizePath,
  securityHeadersMiddleware
};
