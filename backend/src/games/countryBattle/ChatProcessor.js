const normalizeText = require('../../utils/normalizeText');

const POINTS_PER_MESSAGE = 1;

// Recibe mensajes del chat, detecta si son un comando de país y suma puntos en el GameEngine.
class ChatProcessor {
  constructor(gameEngine, countries) {
    this.gameEngine = gameEngine;
    this.setCountries(countries);
  }

  // Diccionario comando normalizado -> id del país. Ej: "republica dominicana" -> "republica-dominicana"
  setCountries(countries) {
    this.commands = new Map();
    for (const country of countries) {
      this.commands.set(normalizeText(country.command), country.id);
    }
  }

  // Devuelve el id del país que recibió el punto, o null si el mensaje no es un comando válido.
  processMessage({ username, message, avatarUrl }) {
    // Si la partida no está en curso, los mensajes no suman puntos
    if (!this.gameEngine.isRunning() || typeof message !== 'string') {
      return null;
    }

    const countryId = this.commands.get(normalizeText(message));
    if (!countryId) {
      return null;
    }

    this.gameEngine.setUserAvatar(username, avatarUrl); // foto de perfil para el MVP y el podio
    this.gameEngine.addPoints(countryId, POINTS_PER_MESSAGE, username);

    // Recordamos qué país apoya el usuario para asignarle sus regalos (Módulo 4)
    if (typeof username === 'string' && username !== '') {
      this.gameEngine.setUserCountry(username, countryId);
    }

    return countryId;
  }
}

module.exports = ChatProcessor;
