const roomManager = require('../rooms/roomManager');

const MAX_USERNAME_LENGTH = 50;
const MAX_MESSAGE_LENGTH = 300;
const MAX_GIFT_LENGTH = 50;

function isValidText(value, maxLength) {
  return typeof value === 'string' && value.trim() !== '' && value.length <= maxLength;
}

// Foto de perfil opcional para probar el MVP con foto: solo direcciones https://
function toAvatarUrl(value) {
  return typeof value === 'string' && value.startsWith('https://') && value.length <= 2000 ? value : null;
}

// Los eventos simulados van a la sala del streamer que hace la petición (requiere sesión)

// POST /api/simulation/chat   body: { "username": "usuario1", "message": "Cuba", "avatarUrl"?: "https://..." }
async function simulateChat(req, res) {
  const { username, message, avatarUrl } = req.body || {};

  if (!isValidText(username, MAX_USERNAME_LENGTH) || !isValidText(message, MAX_MESSAGE_LENGTH)) {
    return res.status(400).json({
      error: `Envía "username" (máx. ${MAX_USERNAME_LENGTH} caracteres) y "message" (máx. ${MAX_MESSAGE_LENGTH}).`,
    });
  }

  const room = await roomManager.getRoom(req.user.id);
  const countryId = room.processEvent({
    type: 'CHAT',
    source: 'simulation',
    username: username.trim(),
    avatarUrl: toAvatarUrl(avatarUrl),
    message,
    timestamp: new Date().toISOString(),
  });

  res.json({ countryId, state: room.getState() });
}

// POST /api/simulation/gift   body: { "username": "usuario1", "gift": "Rosa", "avatarUrl"?: "https://..." }
async function simulateGift(req, res) {
  const { username, gift, avatarUrl } = req.body || {};

  if (!isValidText(username, MAX_USERNAME_LENGTH) || !isValidText(gift, MAX_GIFT_LENGTH)) {
    return res.status(400).json({
      error: `Envía "username" (máx. ${MAX_USERNAME_LENGTH} caracteres) y "gift" (máx. ${MAX_GIFT_LENGTH}).`,
    });
  }

  const room = await roomManager.getRoom(req.user.id);
  const result = room.processEvent({
    type: 'GIFT',
    source: 'simulation',
    username: username.trim(),
    avatarUrl: toAvatarUrl(avatarUrl),
    giftName: gift,
    giftId: null,
    timestamp: new Date().toISOString(),
  });

  res.json({ result, state: room.getState() });
}

// Si algo falla (ej. la base de datos al crear la sala), el error va al manejador de errores de server.js
function catchErrors(handler) {
  return (req, res, next) => handler(req, res).catch(next);
}

module.exports = {
  simulateChat: catchErrors(simulateChat),
  simulateGift: catchErrors(simulateGift),
};
