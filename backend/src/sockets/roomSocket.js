const roomManager = require('../rooms/roomManager');
const authService = require('../services/authService');
const User = require('../models/User');

// Nombre del evento del motor -> nombre del evento que recibe el navegador
const SOCKET_EVENTS = {
  start: 'game:start',
  tick: 'game:update',
  score: 'game:score',
  end: 'game:end',
  reset: 'game:reset',
  settings: 'game:update',
  countdown: 'game:countdown', // conteo "1, 2, 3, ¡GO!" antes de empezar
};

// Cada sala tiene su propio "canal": solo los navegadores de ese streamer reciben sus eventos
function channelFor(userId) {
  return `room:${userId}`;
}

// ¿A qué sala pertenece quien se conecta?
//  - Dashboard: envía su token de sesión  -> sala de ese usuario (puede ver el estado de TikTok)
//  - Overlay:   envía la clave de su URL  -> sala del dueño de esa clave (solo ver el juego)
async function findRoomForSocket(socket) {
  const { token, key } = socket.handshake.auth || {};

  if (typeof token === 'string') {
    let userId;
    try {
      userId = authService.verifyToken(token);
    } catch (error) {
      return null;
    }
    if (!(await User.exists({ _id: userId }))) {
      return null;
    }
    socket.data.kind = 'dashboard';
    return roomManager.getRoom(userId);
  }

  socket.data.kind = 'overlay';
  return roomManager.getRoomByOverlayKey(key);
}

function setupRoomSocket(io) {
  // Cuando se crea una sala, sus avisos se envían solo a su canal
  roomManager.onRoomCreated((room) => {
    const channel = channelFor(room.userId);
    room.on('game', (eventName) => io.to(channel).emit(SOCKET_EVENTS[eventName], room.getState()));
    room.on('tiktok', (type, status) => io.to(channel).emit(`tiktok:${type}`, status));
    room.on('historySaved', () => io.to(channel).emit('game:saved'));
    // Feed del overlay: "juan apoyó a Cuba", "maria envió Rosa +50"...
    room.on('activity', (activity) => io.to(channel).emit('game:activity', activity));
  });

  // Si el streamer genera una clave nueva, los overlays con la clave anterior se desconectan
  roomManager.onOverlayKeyChanged(async (userId) => {
    const sockets = await io.in(channelFor(userId)).fetchSockets();
    for (const socket of sockets) {
      if (socket.data.kind === 'overlay') {
        socket.emit('overlay:invalid');
        socket.disconnect(true);
      }
    }
  });

  io.on('connection', async (socket) => {
    try {
      const room = await findRoomForSocket(socket);
      if (!room) {
        socket.emit(socket.data.kind === 'overlay' ? 'overlay:invalid' : 'auth:error');
        socket.disconnect(true);
        return;
      }

      // Si el navegador se fue mientras buscábamos su sala, no se cuenta
      if (!socket.connected) {
        return;
      }

      socket.join(channelFor(room.userId));
      // La sala sabe cuántos navegadores la están mirando (no se libera mientras haya alguno)
      room.addClient();
      socket.on('disconnect', () => room.removeClient());
      console.log(`[SOCKET] ${socket.data.kind} conectado a la sala ${room.userId.slice(-6)}`);
      // Al conectarse recibe el estado actual para dibujarse aunque la partida ya haya empezado
      socket.emit('game:state', room.getState());
    } catch (error) {
      console.error('[SOCKET] Error al conectar:', error.message);
      socket.disconnect(true);
    }
  });
}

module.exports = setupRoomSocket;
