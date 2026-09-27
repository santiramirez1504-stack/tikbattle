const adminService = require('../services/adminService');
const settingsService = require('../services/settingsService');
const { USER_ROLES } = require('../models/User');

const MAX_ANNOUNCEMENT_LENGTH = 300;

// Pasa cualquier error al manejador de errores de server.js
function catchErrors(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

// GET /api/admin/stats
const getStats = catchErrors(async (req, res) => {
  res.json(await adminService.getStats());
});

// GET /api/admin/rooms
const getRooms = catchErrors(async (req, res) => {
  res.json(await adminService.getLiveRooms());
});

// GET /api/admin/users?search=texto&page=1
const listUsers = catchErrors(async (req, res) => {
  res.json(await adminService.listUsers({ search: req.query.search, page: req.query.page }));
});

// PATCH /api/admin/users/:id   body: { "role": "ADMIN" | "USER" } y/o { "isBlocked": true | false }
const updateUser = catchErrors(async (req, res) => {
  const { role, isBlocked } = req.body || {};

  if (role === undefined && isBlocked === undefined) {
    return res.status(400).json({ error: 'Envía "role" y/o "isBlocked".' });
  }
  if (role !== undefined && !Object.values(USER_ROLES).includes(role)) {
    return res.status(400).json({ error: 'Rol no válido.' });
  }
  if (isBlocked !== undefined && typeof isBlocked !== 'boolean') {
    return res.status(400).json({ error: '"isBlocked" debe ser true o false.' });
  }

  const result = await adminService.updateUser(req.user.id, req.params.id, { role, isBlocked });
  if (result.error === 'CANNOT_CHANGE_SELF') {
    return res.status(400).json({ error: 'No puedes cambiar tu propio rol ni bloquear tu propia cuenta.' });
  }
  if (result.error === 'USER_NOT_FOUND') {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }
  res.json(result.user);
});

// GET /api/admin/games?limit=20
const listGames = catchErrors(async (req, res) => {
  res.json(await adminService.listRecentGames(req.query.limit));
});

// GET /api/admin/settings
const getSettings = catchErrors(async (req, res) => {
  res.json(await settingsService.getSettings());
});

// PUT /api/admin/settings   body: { "announcement": "texto", "registrationsOpen": true }
const updateSettings = catchErrors(async (req, res) => {
  const { announcement, registrationsOpen } = req.body || {};

  if (typeof announcement !== 'string' || announcement.length > MAX_ANNOUNCEMENT_LENGTH) {
    return res.status(400).json({ error: `El aviso debe ser un texto de máximo ${MAX_ANNOUNCEMENT_LENGTH} caracteres.` });
  }
  if (typeof registrationsOpen !== 'boolean') {
    return res.status(400).json({ error: '"registrationsOpen" debe ser true o false.' });
  }

  res.json(await settingsService.updateSettings({ announcement: announcement.trim(), registrationsOpen }));
});

module.exports = { getStats, getRooms, listUsers, updateUser, listGames, getSettings, updateSettings };
