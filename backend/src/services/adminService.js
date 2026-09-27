const mongoose = require('mongoose');
const User = require('../models/User');
const GameSession = require('../models/GameSession');
const roomManager = require('../rooms/roomManager');

const USERS_PAGE_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

// Evita que un texto de búsqueda se interprete como expresión regular (ej. "a.*")
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------- Estadísticas ----------

async function getStats() {
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [totalUsers, newUsers7d, blockedUsers, admins, totalGames, gamesToday, participants7d] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: new Date(now - 7 * DAY_MS) } }),
    User.countDocuments({ isBlocked: true }),
    User.countDocuments({ role: User.USER_ROLES.ADMIN }),
    GameSession.countDocuments(),
    GameSession.countDocuments({ endedAt: { $gte: startOfToday } }),
    GameSession.aggregate([
      { $match: { endedAt: { $gte: new Date(now - 7 * DAY_MS) } } },
      { $group: { _id: null, total: { $sum: '$participants' } } },
    ]),
  ]);

  // Lo que está pasando AHORA (salas en memoria)
  const rooms = roomManager.getRoomsSummary();

  return {
    totalUsers,
    newUsers7d,
    blockedUsers,
    admins,
    totalGames,
    gamesToday,
    participants7d: participants7d.length > 0 ? participants7d[0].total : 0,
    activeRooms: rooms.length,
    runningGames: rooms.filter((room) => room.gameStatus === 'RUNNING').length,
    tiktokConnected: rooms.filter((room) => room.tiktokStatus === 'CONNECTED').length,
    connectedClients: rooms.reduce((sum, room) => sum + room.clients, 0),
  };
}

// ---------- Salas en vivo ----------

async function getLiveRooms() {
  const rooms = roomManager.getRoomsSummary();
  const users = await User.find({ _id: { $in: rooms.map((room) => room.userId) } }).select('name email').lean();
  const byId = new Map(users.map((user) => [String(user._id), user]));

  return rooms
    .map((room) => {
      const user = byId.get(room.userId) || {};
      return { ...room, name: user.name || '(desconocido)', email: user.email || '' };
    })
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

// ---------- Usuarios ----------

async function listUsers({ search = '', page = 1 }) {
  const text = typeof search === 'string' ? search.trim().slice(0, 100) : '';
  const filter = text
    ? { $or: [{ name: new RegExp(escapeRegex(text), 'i') }, { email: new RegExp(escapeRegex(text), 'i') }] }
    : {};
  const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * USERS_PAGE_SIZE)
      .limit(USERS_PAGE_SIZE)
      .lean(),
  ]);

  // Cuántas partidas jugó cada uno y cuándo fue la última
  const gameStats = await GameSession.aggregate([
    { $match: { user: { $in: users.map((user) => user._id) } } },
    { $group: { _id: '$user', games: { $sum: 1 }, lastGameAt: { $max: '$endedAt' } } },
  ]);
  const statsById = new Map(gameStats.map((stat) => [String(stat._id), stat]));

  return {
    page: pageNumber,
    totalPages: Math.max(1, Math.ceil(total / USERS_PAGE_SIZE)),
    total,
    users: users.map((user) => {
      const stats = statsById.get(String(user._id)) || {};
      return {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isBlocked: Boolean(user.isBlocked),
        createdAt: user.createdAt,
        games: stats.games || 0,
        lastGameAt: stats.lastGameAt || null,
      };
    }),
  };
}

// Cambia el rol o el bloqueo de un usuario. Un administrador no puede cambiarse a sí mismo
// (así nunca se queda la plataforma sin administradores por error).
async function updateUser(adminId, userId, changes) {
  if (!mongoose.isValidObjectId(userId)) {
    return { error: 'USER_NOT_FOUND' };
  }
  if (String(adminId) === String(userId)) {
    return { error: 'CANNOT_CHANGE_SELF' };
  }

  const update = {};
  if (changes.role !== undefined) update.role = changes.role;
  if (changes.isBlocked !== undefined) update.isBlocked = changes.isBlocked;

  const user = await User.findByIdAndUpdate(userId, { $set: update }, { new: true, runValidators: true }).lean();
  if (!user) {
    return { error: 'USER_NOT_FOUND' };
  }

  // Al bloquear: se detiene su partida y se desconecta su TikTok
  if (changes.isBlocked === true) {
    await roomManager.shutdownUserRoom(userId);
  }

  return {
    user: { id: user._id, name: user.name, email: user.email, role: user.role, isBlocked: Boolean(user.isBlocked) },
  };
}

// ---------- Partidas de todos los streamers ----------

async function listRecentGames(limit) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const sessions = await GameSession.find()
    .sort({ endedAt: -1 })
    .limit(safeLimit)
    .populate('user', 'name email')
    .lean();

  return sessions.map((session) => ({
    id: session._id,
    streamer: session.user ? session.user.name : '(cuenta eliminada)',
    email: session.user ? session.user.email : '',
    endedAt: session.endedAt,
    playedSeconds: session.playedSeconds,
    endedBy: session.endedBy,
    winners: session.winners,
    isTie: session.isTie,
    participants: session.participants,
    totalPoints: session.results.reduce((sum, result) => sum + result.points, 0),
  }));
}

module.exports = { getStats, getLiveRooms, listUsers, updateUser, listRecentGames };
