const roomManager = require('../rooms/roomManager');
const { getGiftCatalog } = require('../tiktok/giftCatalog');

// Usuario de TikTok: letras, números, "_" y ".", de 2 a 24 caracteres. Se acepta con o sin "@".
const USERNAME_PATTERN = /^@?[a-zA-Z0-9_.]{2,24}$/;

const ERROR_RESPONSES = {
  ALREADY_CONNECTED: { status: 409, message: 'Ya hay una conexión activa. Usa POST /api/tiktok/disconnect primero.' },
  USER_OFFLINE: { status: 404, message: 'Ese usuario no está en LIVE ahora mismo.' },
  RATE_LIMIT: { status: 429, message: 'Demasiados intentos de conexión. Espera unos minutos y vuelve a probar.' },
  CONNECTION_FAILED: { status: 502, message: 'No se pudo conectar con TikTok. Revisa la terminal del servidor.' },
};

// Cada streamer tiene su propia conexión con TikTok, dentro de su sala

// POST /api/tiktok/connect   body: { "username": "usuario_en_live" }
async function connect(req, res) {
  const { username } = req.body || {};

  if (typeof username !== 'string' || !USERNAME_PATTERN.test(username.trim())) {
    return res.status(400).json({
      error: 'Envía "username" con el usuario de TikTok (ej: "mi_usuario" o "@mi_usuario").',
    });
  }

  try {
    const room = await roomManager.getRoom(req.user.id);
    const status = await room.connectTikTok(username.trim().replace(/^@/, ''));
    res.json(status);
  } catch (error) {
    const response = ERROR_RESPONSES[error.code] || ERROR_RESPONSES.CONNECTION_FAILED;
    res.status(response.status).json({ error: response.message });
  }
}

// POST /api/tiktok/disconnect
async function disconnect(req, res, next) {
  try {
    const room = await roomManager.getRoom(req.user.id);
    await room.disconnectTikTok();
    res.json(room.getTikTokStatus());
  } catch (error) {
    next(error);
  }
}

// GET /api/tiktok/status
async function getStatus(req, res, next) {
  try {
    const room = await roomManager.getRoom(req.user.id);
    res.json(room.getTikTokStatus());
  } catch (error) {
    next(error);
  }
}

// GET /api/tiktok/gifts -> catálogo de regalos de TikTok con sus imágenes
async function getGifts(req, res) {
  try {
    res.json(await getGiftCatalog());
  } catch (error) {
    console.error('[TIKTOK] Error al obtener el catálogo de regalos:', error.message);
    res.status(502).json({ error: 'No se pudo obtener el catálogo de regalos de TikTok. Inténtalo más tarde.' });
  }
}

module.exports = { connect, disconnect, getStatus, getGifts };
