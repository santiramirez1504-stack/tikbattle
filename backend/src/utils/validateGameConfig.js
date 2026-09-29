const normalizeText = require('./normalizeText');
const { isValidFlagCode, guessFlagCode } = require('./flags');

const LIMITS = {
  minDuration: 10,
  maxDuration: 60 * 60,
  maxAutoRestart: 5 * 60,
  minCountries: 2,
  maxCountries: 14,
  maxTextLength: 30,
  maxGifts: 30,
  maxGiftNameLength: 40,
  maxPoints: 100000,
};

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function isIntegerBetween(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

// Revisa la configuración que envía el dashboard.
// Devuelve { config } con los datos limpios, o { error } con un mensaje para el streamer.
function validateGameConfig(input) {
  const body = input || {};

  if (!isIntegerBetween(body.durationSeconds, LIMITS.minDuration, LIMITS.maxDuration)) {
    return { error: `La duración debe estar entre ${LIMITS.minDuration} y ${LIMITS.maxDuration} segundos.` };
  }
  if (!isIntegerBetween(body.autoRestartSeconds, 0, LIMITS.maxAutoRestart)) {
    return { error: `El reinicio automático debe estar entre 0 y ${LIMITS.maxAutoRestart} segundos.` };
  }

  // ----- Países -----
  if (!Array.isArray(body.countries)
    || body.countries.length < LIMITS.minCountries || body.countries.length > LIMITS.maxCountries) {
    return { error: `Debe haber entre ${LIMITS.minCountries} y ${LIMITS.maxCountries} países.` };
  }

  const countries = [];
  const usedIds = new Set();
  const usedCommands = new Set();

  for (const [index, raw] of body.countries.entries()) {
    const position = `País ${index + 1}`;
    const name = cleanText(raw && raw.name, LIMITS.maxTextLength);
    const command = cleanText(raw && raw.command, LIMITS.maxTextLength);

    if (!name) return { error: `${position}: el nombre es obligatorio (máx. ${LIMITS.maxTextLength} caracteres).` };
    if (!command) return { error: `${position}: el comando es obligatorio (máx. ${LIMITS.maxTextLength} caracteres).` };
    if (!COLOR_PATTERN.test(raw.color)) return { error: `${position}: el color no es válido.` };

    // El id se genera del nombre: "República Dominicana" -> "republica-dominicana"
    const id = normalizeText(name).replace(/ /g, '-');
    const normalizedCommand = normalizeText(command);
    if (!id) return { error: `${position}: el nombre debe tener letras o números.` };
    if (!normalizedCommand) return { error: `${position}: el comando debe tener letras o números.` };
    if (usedIds.has(id)) return { error: `Hay dos países con el nombre "${name}".` };
    if (usedCommands.has(normalizedCommand)) return { error: `Hay dos países con el comando "${command}".` };

    usedIds.add(id);
    usedCommands.add(normalizedCommand);
    // Bandera: la elegida (si es válida) o, si no se eligió, la que corresponda al nombre (puede ser null)
    if (raw.flag !== undefined && raw.flag !== null && raw.flag !== '' && !isValidFlagCode(raw.flag)) {
      return { error: `${position}: la bandera no es válida.` };
    }
    const flag = isValidFlagCode(raw.flag) ? raw.flag : guessFlagCode(name);

    countries.push({ id, name, command, color: raw.color.toLowerCase(), flag });
  }

  // ----- Regalos -----
  if (!Array.isArray(body.gifts) || body.gifts.length > LIMITS.maxGifts) {
    return { error: `Puedes configurar como máximo ${LIMITS.maxGifts} regalos.` };
  }

  const gifts = [];
  const usedGiftIds = new Set();

  for (const raw of body.gifts) {
    const giftId = raw && raw.giftId;
    const name = cleanText(raw && raw.name, LIMITS.maxGiftNameLength);

    if (!Number.isInteger(giftId) || giftId <= 0) return { error: 'Hay un regalo con un id inválido.' };
    if (!name) return { error: `Regalo ${giftId}: falta el nombre.` };
    if (!isIntegerBetween(raw.points, 1, LIMITS.maxPoints)) {
      return { error: `${name}: los puntos deben estar entre 1 y ${LIMITS.maxPoints}.` };
    }
    if (usedGiftIds.has(giftId)) return { error: `El regalo ${name} está repetido.` };

    usedGiftIds.add(giftId);
    gifts.push({ giftId, name, points: raw.points });
  }

  return {
    config: {
      durationSeconds: body.durationSeconds,
      autoRestartSeconds: body.autoRestartSeconds,
      countries,
      gifts,
    },
  };
}

module.exports = validateGameConfig;
