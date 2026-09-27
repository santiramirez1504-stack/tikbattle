// Prueba del Módulo 9 SIN conectarse a TikTok: ejecutar con -> npm run test:module9
// Le damos a TikTokService datos con la MISMA forma que envía TikTok (verificada en un LIVE real)
// y comprobamos que los convierte bien al modelo interno y que el juego suma los puntos.
const TikTokService = require('../src/tiktok/TikTokService');
const GameEngine = require('../src/games/countryBattle/GameEngine');
const ChatProcessor = require('../src/games/countryBattle/ChatProcessor');
const GiftProcessor = require('../src/games/countryBattle/GiftProcessor');
const { DEFAULT_COUNTRIES } = require('../src/games/countryBattle/countries');
const { DEFAULT_GIFTS } = require('../src/games/countryBattle/gifts');

const game = new GameEngine(DEFAULT_COUNTRIES);
const chat = new ChatProcessor(game, DEFAULT_COUNTRIES);
const gifts = new GiftProcessor(game, DEFAULT_GIFTS);
const tiktok = new TikTokService();

tiktok.on('event', (event) => {
  const result = event.type === 'CHAT' ? chat.processMessage(event) : gifts.processGift(event);
  const { timestamp, ...shown } = event;
  console.log('   evento interno:', shown);
  console.log('   resultado     :', result, '\n');
});

game.start();

console.log('1) Comentario "Cuba" de juan:');
tiktok.handleChat({ user: { displayId: 'juan' }, content: 'Cuba' });

console.log('2) juan envía un combo de 3 Rosas (TikTok manda 3 eventos "en curso" y 1 final):');
const rose = { user: { displayId: 'juan' }, giftId: '5655', gift: { name: 'Rose', type: 1 } };
tiktok.handleGift({ ...rose, repeatCount: 1, repeatEnd: 0 });
tiktok.handleGift({ ...rose, repeatCount: 2, repeatEnd: 0 });
tiktok.handleGift({ ...rose, repeatCount: 3, repeatEnd: 0 });
console.log('   (los 3 eventos "en curso" se ignoraron; ahora llega el final)');
tiktok.handleGift({ ...rose, repeatCount: 3, repeatEnd: 1 });

console.log('3) Un comentario sin usuario (dato incompleto) se ignora:');
tiktok.handleChat({ content: 'Cuba' });
console.log('   (no se generó ningún evento)\n');

console.log('Marcador final (esperado: Cuba = 1 + 3x50 = 151):');
console.table(game.getState().countries.map(({ name, points }) => ({ name, points })));

game.finish();
