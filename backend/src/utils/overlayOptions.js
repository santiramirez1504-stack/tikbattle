// Opciones de qué se muestra en el overlay (el streamer las activa o desactiva desde el dashboard).
const OVERLAY_OPTION_KEYS = [
  'showStatus', // barra de mensaje de arriba ("¡Elige tu país!...") y la actividad que aparece en ella
];

function defaultOverlayOptions() {
  return { showStatus: true };
}

// Rellena lo que falte con el valor por defecto (configuraciones guardadas antes de existir esta opción)
function normalizeOverlayOptions(options) {
  const source = options || {};
  const defaults = defaultOverlayOptions();
  return Object.fromEntries(OVERLAY_OPTION_KEYS.map((key) => [
    key, typeof source[key] === 'boolean' ? source[key] : defaults[key],
  ]));
}

// Revisa lo que envía el dashboard. Devuelve { options } o { error }.
function validateOverlayOptions(input) {
  const body = input || {};
  const options = {};
  for (const key of OVERLAY_OPTION_KEYS) {
    if (typeof body[key] !== 'boolean') {
      return { error: `La opción "${key}" debe ser true o false.` };
    }
    options[key] = body[key];
  }
  return { options };
}

module.exports = { OVERLAY_OPTION_KEYS, defaultOverlayOptions, normalizeOverlayOptions, validateOverlayOptions };
