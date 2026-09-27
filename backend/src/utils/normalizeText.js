// Convierte un texto a una forma comparable:
// "  CÚBA!! " -> "cuba"   |   "República   Dominicana" -> "republica dominicana"
function normalizeText(text) {
  return text
    .normalize('NFD')                // separa las letras de sus acentos: "ú" -> "u" + "´"
    .replace(/[̀-ͯ]/g, '') // elimina los acentos
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')     // cambia símbolos y emojis por espacios
    .replace(/\s+/g, ' ')            // une espacios repetidos en uno solo
    .trim();
}

module.exports = normalizeText;
