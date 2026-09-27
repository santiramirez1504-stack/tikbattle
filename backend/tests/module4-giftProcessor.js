// Prueba manual del Módulo 4: ejecutar con -> npm run test:module4
const GameEngine = require('../src/games/countryBattle/GameEngine');
const ChatProcessor = require('../src/games/countryBattle/ChatProcessor');
const GiftProcessor = require('../src/games/countryBattle/GiftProcessor');
const { DEFAULT_COUNTRIES } = require('../src/games/countryBattle/countries');
const { DEFAULT_GIFTS } = require('../src/games/countryBattle/gifts');

const game = new GameEngine(DEFAULT_COUNTRIES);
game.start(); // desde el Módulo 5 los puntos solo se suman con la partida en curso
const chat = new ChatProcessor(game, DEFAULT_COUNTRIES);
const gifts = new GiftProcessor(game, DEFAULT_GIFTS);

function sendChat(username, message) {
  const result = chat.processMessage({ username, message });
  console.log(`   CHAT  ${username}: "${message}" ->`, result ? `+1 a ${result}` : 'ignorado');
}

function sendGift(username, giftName) {
  const result = gifts.processGift({ username, giftName });
  console.log(`   GIFT  ${username}: ${giftName} ->`, result);
}

console.log('1) Juan envía una Rosa SIN haber elegido país:');
sendGift('juan', 'Rosa');

console.log('\n2) Juan escribe "Cuba" y luego envía una Rosa:');
sendChat('juan', 'Cuba');
sendGift('juan', 'Rosa');

console.log('\n3) Juan envía un regalo que no está configurado:');
sendGift('juan', 'Galaxia');

console.log('\n4) María apoya a México y envía una rosa (en minúsculas):');
sendChat('maria', 'Mexico');
sendGift('maria', 'rosa');

console.log('\nMarcador final:');
console.table(game.getState().countries);

game.finish(); // detiene el temporizador para que el script termine
