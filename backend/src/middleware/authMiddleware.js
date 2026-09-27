const authService = require('../services/authService');
const User = require('../models/User');

// Protege una ruta: solo deja pasar peticiones con un token válido en la cabecera
//   Authorization: Bearer <token>
// Si todo va bien, deja el usuario en req.user para el controlador.
async function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Debes iniciar sesión para hacer esto.' });
  }

  let userId;
  try {
    userId = authService.verifyToken(token);
  } catch (error) {
    return res.status(401).json({ error: 'Sesión inválida o expirada. Inicia sesión de nuevo.' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ error: 'El usuario de esta sesión ya no existe.' });
    }
    // Si un administrador bloqueó la cuenta, las sesiones abiertas dejan de funcionar al momento
    if (user.isBlocked) {
      return res.status(401).json({ error: 'Tu cuenta está bloqueada. Contacta con el administrador.' });
    }
    req.user = user;
    next();
  } catch (error) {
    next(error); // error de base de datos -> lo maneja el manejador de errores de server.js
  }
}

// Solo deja pasar a administradores. Se usa DESPUÉS de requireAuth.
function requireAdmin(req, res, next) {
  if (req.user.role !== User.USER_ROLES.ADMIN) {
    return res.status(403).json({ error: 'Solo los administradores pueden hacer esto.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
