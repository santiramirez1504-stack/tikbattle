const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { generateOverlayKey } = require('../utils/generateOverlayKey');
const settingsService = require('./settingsService');

const BCRYPT_ROUNDS = 10;
const DUPLICATE_KEY_ERROR = 11000; // código de MongoDB cuando un valor "unique" ya existe

function createError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function generateToken(user) {
  // sub = id del usuario. El token NO lleva datos privados: cualquiera puede leer su contenido.
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// Devuelve el id del usuario si el token es válido; si no, lanza un error.
function verifyToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  return payload.sub;
}

async function register({ name, email, password }) {
  // Un administrador puede cerrar el registro de cuentas nuevas
  const { registrationsOpen } = await settingsService.getSettings();
  if (!registrationsOpen) {
    throw createError('REGISTRATIONS_CLOSED');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    // El rol NO se recibe del cliente: todo registro nuevo es USER
    const user = await User.create({ name, email, password: passwordHash, overlayKey: generateOverlayKey() });
    return { user, token: generateToken(user) };
  } catch (error) {
    if (error.code === DUPLICATE_KEY_ERROR) {
      throw createError('EMAIL_TAKEN');
    }
    throw error;
  }
}

async function login({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

  // Mismo error si el email no existe o si la contraseña es incorrecta:
  // así nadie puede averiguar qué emails están registrados.
  const isValid = user ? await bcrypt.compare(password, user.password) : false;
  if (!isValid) {
    throw createError('INVALID_CREDENTIALS');
  }
  if (user.isBlocked) {
    throw createError('ACCOUNT_BLOCKED');
  }

  return { user, token: generateToken(user) };
}

module.exports = { register, login, verifyToken };
