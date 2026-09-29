// Tamaño de cada parte del overlay, en porcentaje (100 = tamaño normal).
// El streamer los ajusta desde el dashboard con una barra para cada parte.
const OVERLAY_SIZE_KEYS = [
  'flags',     // banderas (con su corona e insignia de puesto)
  'points',    // puntos de cada país
  'mvp',       // foto y nombre del MVP (o, en la espera, lo que hay que escribir)
  'timer',     // tiempo
  'status',    // mensaje de estado y actividad
  'alerts',    // alerta de regalo y aviso "¡X toma el liderato!"
  'countdown', // cuenta atrás de los últimos 10 segundos
  'x2',        // anuncio "X2 ¡Activado!"
  'podium',    // pantalla final (podio)
];

const MIN_SIZE = 60;
const MAX_SIZE = 150;
const DEFAULT_SIZE = 100;

function defaultOverlaySizes() {
  return Object.fromEntries(OVERLAY_SIZE_KEYS.map((key) => [key, DEFAULT_SIZE]));
}

// Rellena lo que falte con el tamaño normal (configuraciones guardadas antes de existir esta opción)
function normalizeOverlaySizes(sizes) {
  const source = sizes || {};
  return Object.fromEntries(OVERLAY_SIZE_KEYS.map((key) => {
    const value = source[key];
    return [key, Number.isInteger(value) && value >= MIN_SIZE && value <= MAX_SIZE ? value : DEFAULT_SIZE];
  }));
}

// Revisa lo que envía el dashboard. Devuelve { sizes } o { error }.
function validateOverlaySizes(input) {
  const body = input || {};
  const sizes = {};
  for (const key of OVERLAY_SIZE_KEYS) {
    const value = body[key];
    if (!Number.isInteger(value) || value < MIN_SIZE || value > MAX_SIZE) {
      return { error: `El tamaño "${key}" debe ser un número entero entre ${MIN_SIZE} y ${MAX_SIZE}.` };
    }
    sizes[key] = value;
  }
  return { sizes };
}

module.exports = {
  OVERLAY_SIZE_KEYS, MIN_SIZE, MAX_SIZE, DEFAULT_SIZE,
  defaultOverlaySizes, normalizeOverlaySizes, validateOverlaySizes,
};
