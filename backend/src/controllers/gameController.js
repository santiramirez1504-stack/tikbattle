const roomManager = require('../rooms/roomManager');
const gameConfigService = require('../services/gameConfigService');
const gameHistoryService = require('../services/gameHistoryService');
const validateGameConfig = require('../utils/validateGameConfig');

const OVERLAY_PATH = '/overlay/country-battle/';

// URL completa del overlay. TikTok LIVE Studio solo acepta direcciones https://, así que si hay
// una dirección pública (PUBLIC_URL: túnel de Cloudflare ahora, dominio propio en producción) se usa esa.
function overlayResponse(req, key) {
  const path = `${OVERLAY_PATH}?key=${key}`;
  const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  return { path, url: `${base}${path}` };
}

// Todas las acciones trabajan sobre la sala del streamer que hace la petición (req.user)
function withRoom(handler) {
  return async (req, res, next) => {
    try {
      const room = await roomManager.getRoom(req.user.id);
      await handler(room, req, res);
    } catch (error) {
      next(error);
    }
  };
}

// GET /api/game/state
const getState = withRoom((room, req, res) => {
  res.json(room.getState());
});

// POST /api/game/start
const startGame = withRoom((room, req, res) => {
  try {
    room.startGame();
    res.json(room.getState());
  } catch (error) {
    // 409 Conflict: la partida no está en un estado que permita iniciarla
    res.status(409).json({ error: 'La partida ya fue iniciada. Usa POST /api/game/reset primero.' });
  }
});

// POST /api/game/reset
const resetGame = withRoom((room, req, res) => {
  room.resetGame();
  res.json(room.getState());
});

// POST /api/game/new -> carga la configuración del streamer, reinicia e inicia (botón "Nueva partida")
const newGame = withRoom(async (room, req, res) => {
  await room.newGame();
  res.json(room.getState());
});

// POST /api/game/stop -> termina la partida antes de tiempo (botón "Detener")
const stopGame = withRoom((room, req, res) => {
  if (room.getState().gameStatus !== 'RUNNING') {
    return res.status(409).json({ error: 'No hay ninguna partida en curso.' });
  }
  room.stopGame();
  res.json(room.getState());
});

// GET /api/game/config -> configuración guardada del streamer (o la de por defecto)
async function getConfig(req, res, next) {
  try {
    res.json(await gameConfigService.getConfig(req.user.id));
  } catch (error) {
    next(error);
  }
}

// PUT /api/game/config   body: { durationSeconds, autoRestartSeconds, countries: [...], gifts: [...] }
const saveConfig = withRoom(async (room, req, res) => {
  const { config, error } = validateGameConfig(req.body);
  if (error) {
    return res.status(400).json({ error });
  }
  const saved = await gameConfigService.saveConfig(req.user.id, config);
  room.applyConfig(saved);
  res.json(saved);
});

// GET /api/game/history?limit=10 -> últimas partidas del streamer
async function getHistory(req, res, next) {
  try {
    res.json(await gameHistoryService.getHistory(req.user.id, req.query.limit));
  } catch (error) {
    next(error);
  }
}

// DELETE /api/game/history/:id -> borra una partida del historial del streamer
async function deleteHistoryItem(req, res, next) {
  try {
    const deleted = await gameHistoryService.deleteSession(req.user.id, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Esa partida no existe en tu historial.' });
    }
    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
}

// GET /api/game/overlay -> ruta del overlay del streamer (con su clave secreta)
async function getOverlay(req, res, next) {
  try {
    const key = await roomManager.getOverlayKey(req.user.id);
    res.json(overlayResponse(req, key));
  } catch (error) {
    next(error);
  }
}

// POST /api/game/overlay/regenerate -> nueva clave; la URL anterior deja de funcionar
async function regenerateOverlay(req, res, next) {
  try {
    const key = await roomManager.regenerateOverlayKey(req.user.id);
    res.json(overlayResponse(req, key));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getState,
  startGame,
  resetGame,
  newGame,
  stopGame,
  getConfig,
  saveConfig,
  getHistory,
  deleteHistoryItem,
  getOverlay,
  regenerateOverlay,
};
