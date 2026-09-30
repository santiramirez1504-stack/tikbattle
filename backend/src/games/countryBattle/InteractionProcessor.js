// Interacciones nativas de TikTok que suman puntos al país del espectador (además de los regalos):
// likes, seguir al streamer y compartir el LIVE. Son acciones propias de TikTok, así que no invitan
// a llenar el chat de comentarios repetidos (lo que TikTok trata como spam).
// Solo cuentan si el espectador ya eligió país con un comentario (igual que los regalos).

const LIKES_PER_POINT = 10; // cada 10 likes = 1 punto
const FOLLOW_POINTS = 5;    // seguir al streamer: una vez por partida
const SHARE_POINTS = 5;     // compartir el LIVE: una vez por partida

const ONCE_PER_GAME = { FOLLOW: FOLLOW_POINTS, SHARE: SHARE_POINTS };

class InteractionProcessor {
  constructor(gameEngine) {
    this.gameEngine = gameEngine;
    this.gameKey = null;           // partida a la que pertenecen los contadores de abajo
    this.pendingLikes = new Map(); // usuario -> likes que aún no llegan a 1 punto
    this.rewarded = new Set();     // "FOLLOW|usuario" / "SHARE|usuario" ya premiados en esta partida
  }

  // Los contadores son de cada partida: si empezó otra, se vacían
  syncGame() {
    const key = this.gameEngine.getState().gameStartTime;
    if (key !== this.gameKey) {
      this.gameKey = key;
      this.pendingLikes.clear();
      this.rewarded.clear();
    }
  }

  // Devuelve qué pasó: { assigned: true, countryId, points } o { assigned: false, reason }
  // type: 'LIKE' (count = likes de este grupo) | 'FOLLOW' | 'SHARE'
  processInteraction({ type, username, count = 1, avatarUrl }) {
    if (!this.gameEngine.isRunning()) {
      return { assigned: false, reason: 'GAME_NOT_RUNNING' };
    }
    if (typeof username !== 'string' || username === '') {
      return { assigned: false, reason: 'NO_USERNAME' };
    }

    const countryId = this.gameEngine.getUserCountry(username);
    if (!countryId) {
      return { assigned: false, reason: 'USER_HAS_NO_COUNTRY' };
    }
    this.syncGame();

    let points;
    if (type === 'LIKE') {
      const likes = Number.isInteger(count) && count > 0 ? Math.min(count, 1000) : 0;
      const total = (this.pendingLikes.get(username) || 0) + likes;
      points = Math.floor(total / LIKES_PER_POINT);
      this.pendingLikes.set(username, total % LIKES_PER_POINT);
    } else if (ONCE_PER_GAME[type]) {
      const key = `${type}|${username}`;
      if (this.rewarded.has(key)) {
        return { assigned: false, reason: 'ALREADY_REWARDED' };
      }
      this.rewarded.add(key);
      points = ONCE_PER_GAME[type];
    } else {
      return { assigned: false, reason: 'UNKNOWN_TYPE' };
    }

    if (points <= 0) {
      return { assigned: false, reason: 'NOT_ENOUGH_LIKES' }; // se guardan para el próximo punto
    }

    this.gameEngine.setUserAvatar(username, avatarUrl);
    const applied = this.gameEngine.addPoints(countryId, points, username);
    return { assigned: true, countryId, points: applied };
  }
}

module.exports = InteractionProcessor;
module.exports.LIKES_PER_POINT = LIKES_PER_POINT;
module.exports.FOLLOW_POINTS = FOLLOW_POINTS;
module.exports.SHARE_POINTS = SHARE_POINTS;
