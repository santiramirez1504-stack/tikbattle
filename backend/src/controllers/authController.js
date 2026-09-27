const authService = require('../services/authService');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72; // límite de bcrypt

function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_PATTERN.test(email.trim());
}

function isValidPassword(password) {
  return typeof password === 'string'
    && password.length >= MIN_PASSWORD_LENGTH
    && password.length <= MAX_PASSWORD_LENGTH;
}

// POST /api/auth/register   body: { "name": "...", "email": "...", "password": "..." }
async function register(req, res, next) {
  const { name, email, password } = req.body || {};

  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 50) {
    return res.status(400).json({ error: 'El nombre debe tener entre 2 y 50 caracteres.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'El email no es válido.' });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({
      error: `La contraseña debe tener entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_LENGTH} caracteres.`,
    });
  }

  try {
    const { user, token } = await authService.register({ name: name.trim(), email: email.trim(), password });
    res.status(201).json({ user, token });
  } catch (error) {
    if (error.code === 'EMAIL_TAKEN') {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese email.' });
    }
    if (error.code === 'REGISTRATIONS_CLOSED') {
      return res.status(403).json({ error: 'El registro de cuentas nuevas está cerrado por ahora.' });
    }
    next(error);
  }
}

// POST /api/auth/login   body: { "email": "...", "password": "..." }
async function login(req, res, next) {
  const { email, password } = req.body || {};

  if (!isValidEmail(email) || typeof password !== 'string' || password === '') {
    return res.status(400).json({ error: 'Envía "email" y "password".' });
  }

  try {
    const { user, token } = await authService.login({ email, password });
    res.json({ user, token });
  } catch (error) {
    if (error.code === 'INVALID_CREDENTIALS') {
      return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
    }
    if (error.code === 'ACCOUNT_BLOCKED') {
      return res.status(403).json({ error: 'Tu cuenta está bloqueada. Contacta con el administrador.' });
    }
    next(error);
  }
}

// GET /api/auth/me   (requiere token)
function getProfile(req, res) {
  res.json({ user: req.user });
}

module.exports = { register, login, getProfile };
