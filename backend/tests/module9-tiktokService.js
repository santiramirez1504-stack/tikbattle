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

console.log('2) juan envía un combo de 3 Rosas: cada toque suma AL INSTANTE (1 Rosa cada vez):');
const rose = { user: { displayId: 'juan' }, giftId: '5655', groupId: '111', gift: { name: 'Rose', type: 1 } };
tiktok.handleGift({ ...rose, repeatCount: 1, repeatEnd: 0 });
tiktok.handleGift({ ...rose, repeatCount: 2, repeatEnd: 0 });
tiktok.handleGift({ ...rose, repeatCount: 3, repeatEnd: 0 });
console.log('   Llega el evento final del combo (total 3, ya contadas): no genera evento.');
tiktok.handleGift({ ...rose, repeatCount: 3, repeatEnd: 1 });
console.log('   TikTok repite el evento final por error: tampoco se cuenta dos veces.\n');
tiktok.handleGift({ ...rose, repeatCount: 3, repeatEnd: 1 });

console.log('2b) juan empieza OTRO combo de 2 Rosas (el contador vuelve a 1): se cuenta como nuevo:');
tiktok.handleGift({ ...rose, groupId: '222', repeatCount: 1, repeatEnd: 0 });
tiktok.handleGift({ ...rose, groupId: '222', repeatCount: 2, repeatEnd: 1 });

console.log('3) Un comentario sin usuario (dato incompleto) se ignora:');
tiktok.handleChat({ content: 'Cuba' });
console.log('   (no se generó ningún evento)\n');

console.log('Marcador final (esperado: Cuba = 1 + 5x50 = 251):');
console.table(game.getState().countries.map(({ name, points }) => ({ name, points })));

game.finish();
