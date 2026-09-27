// Prueba manual del Módulo 2: ejecutar con -> npm run test:module2
const GameEngine = require('../src/games/countryBattle/GameEngine');
const { DEFAULT_COUNTRIES } = require('../src/games/countryBattle/countries');

const game = new GameEngine(DEFAULT_COUNTRIES);
game.start(); // desde el Módulo 5 los puntos solo se suman con la partida en curso

console.log('1) Estado inicial:');
console.table(game.getState().countries);

game.addPoints('cuba', 1);
game.addPoints('mexico', 1);

console.log('2) Después de Cuba +1 y México +1:');
console.table(game.getState().countries);

console.log('3) Intentando sumar a un país que no existe:');
try {
  game.addPoints('brasil', 1);
} catch (error) {
  console.log('   Error capturado correctamente ->', error.message);
}

game.finish(); // detiene el temporizador para que el script termine
