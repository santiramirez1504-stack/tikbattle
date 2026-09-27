const fs = require('fs');
const path = require('path');
const normalizeText = require('./normalizeText');

// Banderas en SVG del paquete "flag-icons" (licencia MIT). Se sirven desde nuestro propio servidor
// en /flags/4x3/<código>.svg, así no dependen de internet ni de servicios externos.
const FLAGS_DIR = path.join(path.dirname(require.resolve('flag-icons/package.json')), 'flags');

// Códigos de país de 2 letras disponibles (ISO 3166-1, ej. "cu", "mx")
const FLAG_CODES = fs.readdirSync(path.join(FLAGS_DIR, '4x3'))
  .map((file) => file.replace('.svg', ''))
  .filter((code) => /^[a-z]{2}$/.test(code));
const FLAG_CODE_SET = new Set(FLAG_CODES);

// Nombre del país en español e inglés -> código (para adivinar la bandera a partir del nombre)
const namesEs = new Intl.DisplayNames(['es'], { type: 'region' });
const namesEn = new Intl.DisplayNames(['en'], { type: 'region' });
const CODE_BY_NAME = new Map();
for (const code of FLAG_CODES) {
  for (const names of [namesEs, namesEn]) {
    try {
      const name = names.of(code.toUpperCase());
      if (name && name.toUpperCase() !== code.toUpperCase()) {
        CODE_BY_NAME.set(normalizeText(name), code);
      }
    } catch (error) {
      // código sin nombre conocido: se ignora
    }
  }
}

function isValidFlagCode(code) {
  return typeof code === 'string' && FLAG_CODE_SET.has(code);
}

// "República Dominicana" -> "do", "México" -> "mx". Devuelve null si no lo reconoce.
function guessFlagCode(countryName) {
  if (typeof countryName !== 'string') return null;
  return CODE_BY_NAME.get(normalizeText(countryName)) || null;
}

// Lista para el selector del dashboard: [{ code, name }] ordenada por nombre en español
function getFlagList() {
  return FLAG_CODES
    .map((code) => {
      let name = code.toUpperCase();
      try {
        name = namesEs.of(code.toUpperCase()) || name;
      } catch (error) {
        // se deja el código como nombre
      }
      return { code, name };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

module.exports = { FLAGS_DIR, isValidFlagCode, guessFlagCode, getFlagList };
