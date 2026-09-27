const normalizeText = require('../../utils/normalizeText');

// Recibe regalos, busca cuántos puntos valen y los suma al país que apoya el usuario.
class GiftProcessor {
  constructor(gameEngine, gifts) {
    this.gameEngine = gameEngine;
    this.setGifts(gifts);
  }

  // gifts: [{ giftId, name, points }]
  setGifts(gifts) {
    this.gifts = gifts;
  }

  // Busca el regalo primero por giftId (más fiable) y si no, por nombre normalizado.
  findGift(giftId, giftName) {
    if (giftId !== undefined && giftId !== null) {
      const byId = this.gifts.find((gift) => gift.giftId !== null && String(gift.giftId) === String(giftId));
      if (byId) return byId;
    }

    if (typeof giftName === 'string') {
      const name = normalizeText(giftName);
      return this.gifts.find((gift) => normalizeText(gift.name) === name) || null;
    }

    return null;
  }

  // Devuelve un resultado que explica qué pasó con el regalo.
  // count: cantidad de regalos (combos de TikTok, ej. Rosa x10). Si no llega, se toma 1.
  processGift({ username, giftName, giftId, count = 1, avatarUrl }) {
    if (!this.gameEngine.isRunning()) {
      return { assigned: false, reason: 'GAME_NOT_RUNNING' };
    }

    const gift = this.findGift(giftId, giftName);
    if (!gift) {
      return { assigned: false, reason: 'GIFT_NOT_CONFIGURED' };
    }

    const countryId = this.gameEngine.getUserCountry(username);
    if (!countryId) {
      return { assigned: false, reason: 'USER_WITHOUT_COUNTRY' };
    }

    const quantity = Number.isInteger(count) && count > 0 ? count : 1;
    const points = gift.points * quantity;

    this.gameEngine.setUserAvatar(username, avatarUrl); // foto de perfil para el MVP y el podio
    this.gameEngine.addPoints(countryId, points, username);
    // Datos del regalo para la alerta del overlay (imagen, nombre y cantidad)
    return { assigned: true, countryId, points, giftId: gift.giftId, giftName: gift.name, count: quantity };
  }
}

module.exports = GiftProcessor;
