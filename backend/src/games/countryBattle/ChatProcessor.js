const normalizeText = require('../../utils/normalizeText');

// Punto de bienvenida: solo el PRIMER comentario de cada espectador en la partida suma.
// Repetir el país (o cambiar de país) ya no suma nada, así el juego no invita a llenar el chat
// de comentarios repetidos (TikTok lo trata como spam / interacción artificial y banea cuentas).
const POINTS_PER_JOIN = 1;

// Recibe mensajes del chat, detecta si son un comando de país y une al espectador a ese país.
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

  // Devuelve el id del país que eligió el espectador, o null si el mensaje no es un comando válido.
  // Solo la primera vez que elige un país en la partida suma POINTS_PER_JOIN; después solo puede
  // cambiar de país (sus regalos irán al nuevo), sin sumar.
  processMessage({ username, message, avatarUrl }) {
    // Si la partida no está en curso, los mensajes no cuentan
    if (!this.gameEngine.isRunning() || typeof message !== 'string') {
      return null;
    }

    // Sin usuario no se puede saber si ya se unió: no cuenta
    if (typeof username !== 'string' || username === '') {
      return null;
    }

    const countryId = this.commands.get(normalizeText(message));
    if (!countryId) {
      return null;
    }

    this.gameEngine.setUserAvatar(username, avatarUrl); // foto de perfil para el MVP y el podio

    const isFirstJoin = this.gameEngine.getUserCountry(username) === null;
    if (isFirstJoin) {
      this.gameEngine.addPoints(countryId, POINTS_PER_JOIN, username);
    }

    // Recordamos qué país apoya el usuario para asignarle sus regalos (Módulo 4)
    this.gameEngine.setUserCountry(username, countryId);

    return countryId;
  }
}

module.exports = ChatProcessor;
