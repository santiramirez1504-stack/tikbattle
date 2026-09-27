// Prueba manual del Módulo 3: ejecutar con -> npm run test:module3
const GameEngine = require('../src/games/countryBattle/GameEngine');
const ChatProcessor = require('../src/games/countryBattle/ChatProcessor');
const { DEFAULT_COUNTRIES } = require('../src/games/countryBattle/countries');

const game = new GameEngine(DEFAULT_COUNTRIES);
game.start(); // desde el Módulo 5 los puntos solo se suman con la partida en curso
const chat = new ChatProcessor(game, DEFAULT_COUNTRIES);

const messages = [
  'CUBA',
  'cuba',
  'Cuba',
  'CuBa',
  'Cúba',
  '  cuba!! ',
  'Mexico',
  'MÉXICO',
  'republica dominicana',
  'REPÚBLICA   DOMINICANA',
  'hola a todos',
  'me encanta cuba',
];

console.log('Procesando mensajes del chat:');
for (const message of messages) {
  const result = chat.processMessage({ username: 'usuario1', message });
  console.log(`   "${message}" ->`, result ? `+1 a ${result}` : 'ignorado');
}

console.log('\nMarcador final:');
console.table(game.getState().countries);

game.finish(); // detiene el temporizador para que el script termine
