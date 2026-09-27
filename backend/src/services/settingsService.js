const Settings = require('../models/Settings');

const GLOBAL_KEY = 'global';

function toPlain(doc) {
  return {
    announcement: doc.announcement || '',
    registrationsOpen: doc.registrationsOpen !== false,
  };
}

// Devuelve la configuración global (si todavía no existe, los valores por defecto)
async function getSettings() {
  const doc = await Settings.findOne({ key: GLOBAL_KEY }).lean();
  return doc ? toPlain(doc) : { announcement: '', registrationsOpen: true };
}

async function updateSettings({ announcement, registrationsOpen }) {
  const doc = await Settings.findOneAndUpdate(
    { key: GLOBAL_KEY },
    { $set: { announcement, registrationsOpen } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();
  return toPlain(doc);
}

module.exports = { getSettings, updateSettings };
