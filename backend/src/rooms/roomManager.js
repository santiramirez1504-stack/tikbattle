const EventEmitter = require('events');
const User = require('../models/User');
const GameRoom = require('./GameRoom');
const gameConfigService = require('../services/gameConfigService');
const activeRoomService = require('../services/activeRoomService');
const { generateOverlayKey, OVERLAY_KEY_PATTERN } = require('../utils/generateOverlayKey');

// Guarda las salas activas: una por streamer (id de usuario -> GameRoom).
// Las salas se crean la primera vez que se necesitan (al entrar al dashboard o abrir el overlay).
const rooms = new Map();
const creating = new Map(); // salas que se están creando ahora mismo (evita crear dos a la vez)
const events = new EventEmitter();

async function getRoom(userId) {
  const id = String(userId);
  if (rooms.has(id)) {
    const room = rooms.get(id);
    room.touch(); // alguien la está usando: no se libera por ahora
    return room;
  }

  if (!creating.has(id)) {
    const promise = gameConfigService.getConfig(id)
      .then((config) => {
        const room = new GameRoom(id, config);
        rooms.set(id, room);
        events.emit('roomCreated', room);
        return room;
      })
      .finally(() => creating.delete(id));
    creating.set(id, promise);
  }
  return creating.get(id);
}

// Sala a partir de la clave de la URL del overlay. Devuelve null si la clave no es válida.
async function getRoomByOverlayKey(key) {
  if (typeof key !== 'string' || !OVERLAY_KEY_PATTERN.test(key)) {
    return null;
  }
  const user = await User.findOne({ overlayKey: key }).select('_id').lean();
  return user ? getRoom(user._id) : null;
}

// Clave del overlay del streamer. Los usuarios creados antes de esta función no tienen: se les crea una.
async function getOverlayKey(userId) {
  const user = await User.findById(userId).select('+overlayKey').lean();
  if (user && user.overlayKey) {
    return user.overlayKey;
  }
  await User.updateOne({ _id: userId, overlayKey: { $exists: false } }, { $set: { overlayKey: generateOverlayKey() } });
  const updated = await User.findById(userId).select('+overlayKey').lean();
  return updated.overlayKey;
}

// Crea una clave nueva: la URL anterior deja de funcionar (por si se filtró)
async function regenerateOverlayKey(userId) {
  const overlayKey = generateOverlayKey();
  await User.updateOne({ _id: userId }, { $set: { overlayKey } });
  events.emit('overlayKeyChanged', String(userId));
  return overlayKey;
}

// Al arrancar el servidor: recrea las salas que tenían una partida en curso o TikTok conectado
async function restoreRooms() {
  const snapshots = await activeRoomService.findAllSnapshots();
  for (const snapshot of snapshots) {
    try {
      const room = await getRoom(snapshot.userId);
      room.restore(snapshot);
    } catch (error) {
      console.error(`[SALAS] No se pudo recuperar la sala ${snapshot.userId}:`, error.message);
    }
  }
  return snapshots.length;
}

// Al apagar el servidor: guarda la foto de todas las salas para no perder los últimos puntos
function saveAllRooms() {
  return Promise.all([...rooms.values()].map((room) => room.persistNow()));
}

// Limpieza: cada cierto tiempo borra de la memoria las salas inactivas.
// Su configuración e historial siguen en MongoDB: si el streamer vuelve, la sala se crea de nuevo.
const DEFAULT_IDLE_MINUTES = 10;
let cleanupTimer = null;

function releaseIdleRooms(idleMs) {
  for (const [id, room] of rooms) {
    if (room.isIdle(idleMs)) {
      room.dispose();
      rooms.delete(id);
      console.log(`[SALAS] Sala ${id.slice(-6)} liberada de la memoria (sin uso). Salas en memoria: ${rooms.size}`);
    }
  }
}

function startCleanup(idleMinutes = DEFAULT_IDLE_MINUTES) {
  const idleMs = idleMinutes * 60 * 1000;
  const intervalMs = Math.min(60 * 1000, idleMs); // revisa cada minuto (o antes, si el tiempo es más corto)
  clearInterval(cleanupTimer);
  cleanupTimer = setInterval(() => releaseIdleRooms(idleMs), intervalMs);
  cleanupTimer.unref(); // la limpieza no impide que el proceso termine
}

// Resumen de las salas que hay en memoria ahora mismo (panel de administrador)
function getRoomsSummary() {
  return [...rooms.values()].map((room) => room.getSummary());
}

// Detiene la partida y TikTok de un streamer, si tiene sala abierta (ej. al bloquear su cuenta)
async function shutdownUserRoom(userId) {
  const room = rooms.get(String(userId));
  if (room) {
    await room.shutdown();
  }
}

function onRoomCreated(listener) {
  events.on('roomCreated', listener);
}

function onOverlayKeyChanged(listener) {
  events.on('overlayKeyChanged', listener);
}

module.exports = {
  getRoom,
  getRoomByOverlayKey,
  getOverlayKey,
  regenerateOverlayKey,
  restoreRooms,
  saveAllRooms,
  startCleanup,
  getRoomsSummary,
  shutdownUserRoom,
  onRoomCreated,
  onOverlayKeyChanged,
};
