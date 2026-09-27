// Carga las variables del archivo .env en process.env (debe ir antes que todo lo demás)
require('dotenv').config();

const http = require('http');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const { connectDatabase } = require('./src/config/database');
const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const settingsRoutes = require('./src/routes/settingsRoutes');
const gameRoutes = require('./src/routes/gameRoutes');
const simulationRoutes = require('./src/routes/simulationRoutes');
const tiktokRoutes = require('./src/routes/tiktokRoutes');
const setupRoomSocket = require('./src/sockets/roomSocket');
const roomManager = require('./src/rooms/roomManager');
const { FLAGS_DIR, getFlagList } = require('./src/utils/flags');
const { getGiftCatalog } = require('./src/tiktok/giftCatalog');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Detrás de Caddy y Cloudflare, la IP real del visitante llega en la cabecera X-Forwarded-For.
// TRUST_PROXY = cuántos "intermediarios" hay delante (ej. 2 = Cloudflare + Caddy). Sin esto,
// el límite de peticiones vería a todos los usuarios con la misma IP (la del intermediario).
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
}

// Socket.IO necesita el servidor HTTP "puro", por eso lo creamos nosotros en vez de usar app.listen()
const server = http.createServer(app);
// Solo acepta conexiones desde nuestro propio dominio (es lo predeterminado) y mensajes pequeños
const io = new Server(server, { maxHttpBufferSize: 100 * 1024 });
setupRoomSocket(io);

// Cabeceras de seguridad (helmet). La política de contenido (CSP) dice qué puede cargar cada página:
// solo nuestros scripts, las fuentes de Google e imágenes https (banderas, regalos y fotos de TikTok).
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: IS_PRODUCTION ? [] : null,
    },
  },
  // Las imágenes de TikTok vienen de otro dominio: no exigir cabeceras especiales para mostrarlas
  crossOriginEmbedderPolicy: false,
  // Se usa referrerpolicy="no-referrer" en las imágenes de TikTok; para el resto, lo mínimo
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // HSTS (forzar https) solo en producción: en local usamos http://localhost
  strictTransportSecurity: IS_PRODUCTION ? { maxAge: 15552000 } : false,
}));

// Permite recibir JSON en el cuerpo de las peticiones (máx. 10 KB para evitar abusos)
app.use(express.json({ limit: '10kb' }));

// Estado del servidor (lo usa el monitoreo, ej. UptimeRobot): 200 si todo va bien, 503 si falla la base de datos
app.get('/api/health', (req, res) => {
  const database = mongoose.connection.readyState === 1 ? 'conectada' : 'desconectada';
  res.status(database === 'conectada' ? 200 : 503).json({
    status: database === 'conectada' ? 'ok' : 'error',
    database,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

// La página principal lleva al dashboard del streamer
app.get('/', (req, res) => {
  res.redirect('/dashboard/');
});

// Archivos del overlay: http://localhost:3000/overlay/country-battle/?key=<clave del streamer>
app.use('/overlay', express.static(path.join(__dirname, '..', 'overlay')));

// Banderas en SVG (paquete flag-icons): http://localhost:3000/flags/4x3/cu.svg
app.use('/flags', express.static(FLAGS_DIR, { maxAge: '7d' }));

// Lista de banderas para el selector del dashboard: [{ code, name }]
app.get('/api/flags', (req, res) => {
  res.json(getFlagList());
});

// Páginas del streamer: http://localhost:3000/login/ y http://localhost:3000/dashboard/
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/tiktok', tiktokRoutes);

// Los endpoints de simulación solo existen si SIMULATION_MODE=true en el .env
if (process.env.SIMULATION_MODE === 'true') {
  app.use('/api/simulation', simulationRoutes);
  console.log('Modo simulación ACTIVADO');
}

// Manejo de errores: responde siempre en JSON y no muestra detalles internos
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({
    error: status < 500 ? 'Petición inválida (revisa que el JSON esté bien escrito)' : 'Error interno del servidor',
  });
});

// Variables obligatorias: sin ellas el servidor no puede funcionar de forma segura
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET'];

// Comprobaciones extra en producción: si algo es inseguro, el servidor no arranca
function checkProductionConfig() {
  const problems = [];
  if (process.env.SIMULATION_MODE === 'true') {
    problems.push('SIMULATION_MODE debe ser false (cualquiera podría inventar comentarios y regalos)');
  }
  if ((process.env.JWT_SECRET || '').length < 32) {
    problems.push('JWT_SECRET debe tener al menos 32 caracteres');
  }
  if (!(process.env.PUBLIC_URL || '').startsWith('https://')) {
    problems.push('PUBLIC_URL debe ser la dirección https de tu dominio');
  }
  return problems;
}

async function start() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.error(`[ERROR] Faltan variables en el archivo .env: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (IS_PRODUCTION) {
    const problems = checkProductionConfig();
    if (problems.length > 0) {
      problems.forEach((problem) => console.error(`[ERROR] Producción: ${problem}`));
      process.exit(1);
    }
    console.log('[SERVIDOR] Modo producción');
  }

  try {
    await connectDatabase();
  } catch (error) {
    console.error('[ERROR] No se pudo conectar a MongoDB:', error.message);
    console.error('Revisa MONGODB_URI en el .env y, en Atlas, que tu IP esté permitida (Network Access).');
    process.exit(1);
  }

  // Recupera las partidas en curso y las conexiones con TikTok de antes del reinicio
  const restored = await roomManager.restoreRooms();
  if (restored > 0) {
    console.log(`[SALAS] Recuperadas ${restored} sala(s) de antes del reinicio`);
  }

  // Descarga el catálogo de regalos ya al arrancar: así las alertas del overlay tienen imagen desde el principio
  getGiftCatalog().catch((error) => console.error('[TIKTOK] No se pudo descargar el catálogo de regalos:', error.message));

  // Libera de la memoria las salas que no se usan (por defecto tras 10 minutos)
  roomManager.startCleanup(Number(process.env.ROOM_IDLE_MINUTES) || undefined);

  server.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}/`);
  });
}

// Apagado ordenado (Ctrl + C o apagado del servidor): guarda todas las salas antes de salir
let isShuttingDown = false;
async function shutdown(signal, exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[SERVIDOR] Apagando (${signal}): guardando el estado de las salas...`);
  try {
    await roomManager.saveAllRooms();
  } catch (error) {
    console.error('[SERVIDOR] Error al guardar las salas:', error.message);
  }
  process.exit(exitCode);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Errores que nadie capturó: se registran para poder investigarlos.
// Una promesa rechazada no deja el servidor en mal estado: solo se anota.
process.on('unhandledRejection', (reason) => {
  console.error('[ERROR] Promesa rechazada sin capturar:', reason);
});
// Una excepción sin capturar sí puede dejarlo en mal estado: se guardan las salas y se sale.
// En producción, Docker vuelve a arrancar el servidor solo y las partidas se recuperan.
process.on('uncaughtException', (error) => {
  console.error('[ERROR] Excepción sin capturar:', error);
  shutdown('uncaughtException', 1);
});

start();
