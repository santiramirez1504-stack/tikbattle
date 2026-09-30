// Opciones de qué se muestra en el overlay (el streamer las cambia desde el dashboard).
// Cada opción tiene su tipo: interruptor (sí/no) o número con un mínimo y un máximo.
const OVERLAY_OPTIONS = {
  showStatus: { type: 'boolean', default: true },     // barra de mensaje de arriba y la actividad que aparece en ella
  showGiftAlerts: { type: 'boolean', default: true }, // recuadro que avisa de cada regalo ("juan envió Rosa +5 a CUBA")
  flagOpacity: { type: 'integer', default: 100, min: 20, max: 100 }, // opacidad de las banderas, en %
  doubleFinal: { type: 'boolean', default: true },    // ¿puede salir el X2 sorpresa en los últimos 30 s?
};
const OVERLAY_OPTION_KEYS = Object.keys(OVERLAY_OPTIONS);

function isValidOption(key, value) {
  const option = OVERLAY_OPTIONS[key];
  if (option.type === 'boolean') return typeof value === 'boolean';
  return Number.isInteger(value) && value >= option.min && value <= option.max;
}

function defaultOverlayOptions() {
  return Object.fromEntries(OVERLAY_OPTION_KEYS.map((key) => [key, OVERLAY_OPTIONS[key].default]));
}

// Rellena lo que falte (o no sea válido) con el valor por defecto
// (configuraciones guardadas antes de existir alguna opción)
function normalizeOverlayOptions(options) {
  const source = options || {};
  return Object.fromEntries(OVERLAY_OPTION_KEYS.map((key) => [
    key, isValidOption(key, source[key]) ? source[key] : OVERLAY_OPTIONS[key].default,
  ]));
}

// Revisa lo que envía el dashboard. Devuelve { options } o { error }.
function validateOverlayOptions(input) {
  const body = input || {};
  const options = {};
  for (const key of OVERLAY_OPTION_KEYS) {
    if (!isValidOption(key, body[key])) {
      const option = OVERLAY_OPTIONS[key];
      return {
        error: option.type === 'boolean'
          ? `La opción "${key}" debe ser true o false.`
          : `La opción "${key}" debe ser un número entero entre ${option.min} y ${option.max}.`,
      };
    }
    options[key] = body[key];
  }
  return { options };
}

module.exports = { OVERLAY_OPTION_KEYS, defaultOverlayOptions, normalizeOverlayOptions, validateOverlayOptions };
