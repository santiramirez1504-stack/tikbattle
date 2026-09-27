const crypto = require('crypto');

// Clave secreta y aleatoria para la URL del overlay de un streamer (32 caracteres hexadecimales).
// Imposible de adivinar; si se filtra, el streamer puede generar otra desde el dashboard.
const OVERLAY_KEY_PATTERN = /^[a-f0-9]{32}$/;

function generateOverlayKey() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = { generateOverlayKey, OVERLAY_KEY_PATTERN };
