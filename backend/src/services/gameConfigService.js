const GameConfig = require('../models/GameConfig');
const { DEFAULT_COUNTRIES } = require('../games/countryBattle/countries');
const { DEFAULT_GIFTS } = require('../games/countryBattle/gifts');
const { guessFlagCode } = require('../utils/flags');

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
  };
}

// Deja solo los datos del juego (sin _id, user, fechas...)
function toPlainConfig(doc) {
  return {
    durationSeconds: doc.durationSeconds,
    autoRestartSeconds: doc.autoRestartSeconds,
    countries: withFlags(doc.countries),
    gifts: doc.gifts.map(({ giftId, name, points }) => ({ giftId, name, points })),
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

module.exports = { getDefaultConfig, getConfig, saveConfig };
