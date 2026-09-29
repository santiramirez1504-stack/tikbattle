const GameConfig = require('../models/GameConfig');
const { DEFAULT_COUNTRIES } = require('../games/countryBattle/countries');
const { DEFAULT_GIFTS } = require('../games/countryBattle/gifts');
const { guessFlagCode } = require('../utils/flags');
const { defaultOverlaySizes, normalizeOverlaySizes } = require('../utils/overlaySizes');
const { defaultOverlayOptions, normalizeOverlayOptions } = require('../utils/overlayOptions');

// Países con su bandera. Las configuraciones guardadas antes de existir las banderas no la tienen:
// en ese caso se adivina a partir del nombre (ej. "México" -> "mx").
function withFlags(countries) {
  return countries.map(({ id, name, command, color, flag }) => ({
    id, name, command, color, flag: flag || guessFlagCode(name),
  }));
}

// Configuración para quien todavía no guardó la suya
function getDefaultConfig() {
  return {
    durationSeconds: Number(process.env.GAME_DURATION_SECONDS) || 5 * 60,
    autoRestartSeconds: 0,
    countries: withFlags(DEFAULT_COUNTRIES),
    gifts: DEFAULT_GIFTS.map(({ giftId, name, points }) => ({ giftId, name, points })),
    overlaySizes: defaultOverlaySizes(),
    overlayOptions: defaultOverlayOptions(),
  };
}

// Deja solo los datos del juego (sin _id, user, fechas...)
function toPlainConfig(doc) {
  return {
    durationSeconds: doc.durationSeconds,
    autoRestartSeconds: doc.autoRestartSeconds,
    countries: withFlags(doc.countries),
    gifts: doc.gifts.map(({ giftId, name, points }) => ({ giftId, name, points })),
    overlaySizes: normalizeOverlaySizes(doc.overlaySizes),
    overlayOptions: normalizeOverlayOptions(doc.overlayOptions),
  };
}

async function getConfig(userId) {
  const doc = await GameConfig.findOne({ user: userId }).lean();
  return doc ? toPlainConfig(doc) : getDefaultConfig();
}

// Crea o reemplaza la configuración del usuario (config ya validada)
async function saveConfig(userId, config) {
  const doc = await GameConfig.findOneAndUpdate(
    { user: userId },
    { ...config, user: userId },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();
  return toPlainConfig(doc);
}

// Guarda solo los tamaños del overlay (sin tocar países, regalos ni duración)
async function saveOverlaySizes(userId, sizes) {
  const exists = await GameConfig.exists({ user: userId });
  if (!exists) {
    // Primera vez: se guarda la configuración por defecto junto con los tamaños
    return saveConfig(userId, { ...getDefaultConfig(), overlaySizes: sizes });
  }
  const doc = await GameConfig.findOneAndUpdate(
    { user: userId },
    { $set: { overlaySizes: sizes } },
    { new: true, runValidators: true }
  ).lean();
  return toPlainConfig(doc);
}

// Guarda solo las opciones de qué se muestra en el overlay
async function saveOverlayOptions(userId, options) {
  const exists = await GameConfig.exists({ user: userId });
  if (!exists) {
    return saveConfig(userId, { ...getDefaultConfig(), overlayOptions: options });
  }
  const doc = await GameConfig.findOneAndUpdate(
    { user: userId },
    { $set: { overlayOptions: options } },
    { new: true, runValidators: true }
  ).lean();
  return toPlainConfig(doc);
}

module.exports = { getDefaultConfig, getConfig, saveConfig, saveOverlaySizes, saveOverlayOptions };
