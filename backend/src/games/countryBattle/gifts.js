// Regalos por defecto (los usa quien todavía no guardó su propia configuración).
// giftId: id real de TikTok | name: nombre que se muestra | points: puntos que otorga en el juego
// Los puntos son valores del juego, NO el valor real del regalo en TikTok.
// giftId verificado en un LIVE real (26/09/2026): Rose = 5655 (TikTok envía el nombre en inglés, "Rose").
const DEFAULT_GIFTS = [
  { giftId: 5655, name: 'Rosa', points: 50 },
];

module.exports = { DEFAULT_GIFTS };
