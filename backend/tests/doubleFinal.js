// Prueba del "X2 final": ejecutar con -> npm run test:double
// El sorteo se fuerza (random) para comprobar los dos casos sin depender de la suerte.
const assert = require('assert');
const GameEngine = require('../src/games/countryBattle/GameEngine');
const GiftProcessor = require('../src/games/countryBattle/GiftProcessor');

const countries = [{ id: 'cuba', name: 'Cuba', color: '#2f7df6' }, { id: 'mexico', name: 'México', color: '#16a34a' }];
const gifts = [{ giftId: 5655, name: 'Rosa', points: 5 }];

function check(title, fn) {
  fn();
  console.log(`✅ ${title}`);
}

check('Partida CON X2 y dentro de los últimos 30 s: cada punto vale el doble', () => {
  const game = new GameEngine(countries, { durationSeconds: 8, random: () => 0 }); // 0 < 0,35 -> sí hay X2
  game.start();
  assert.strictEqual(game.getState().doublePoints, true);
  assert.strictEqual(game.addPoints('cuba', 1, 'juan'), 2);
  const gift = new GiftProcessor(game, gifts);
  game.setUserCountry('ana', 'mexico');
  const result = gift.processGift({ username: 'ana', giftId: 5655, count: 3 });
  assert.strictEqual(result.points, 30); // 3 Rosas x 5 x 2
  assert.strictEqual(game.getState().countries.find((c) => c.id === 'mexico').points, 30);
  assert.strictEqual(game.getState().countries.find((c) => c.id === 'mexico').mvp.points, 30);
  game.finish();
});

check('Partida CON X2 pero aún lejos del final: puntos normales y el X2 no se revela', () => {
  const game = new GameEngine(countries, { durationSeconds: 60, random: () => 0 });
  game.start();
  assert.strictEqual(game.getState().doublePoints, false);
  assert.strictEqual(game.addPoints('cuba', 1, 'juan'), 1);
  game.finish();
});

check('Partida SIN X2: en los últimos segundos los puntos son normales', () => {
  const game = new GameEngine(countries, { durationSeconds: 8, random: () => 0.99 }); // 0,99 >= 0,35 -> no
  game.start();
  assert.strictEqual(game.getState().doublePoints, false);
  assert.strictEqual(game.addPoints('cuba', 1, 'juan'), 1);
  game.finish();
});

check('Al terminar o reiniciar, el X2 se apaga', () => {
  const game = new GameEngine(countries, { durationSeconds: 8, random: () => 0 });
  game.start();
  game.finish();
  assert.strictEqual(game.getState().doublePoints, false);
  game.reset();
  assert.strictEqual(game.doubleFinal, false);
});

// Con el azar real, en 2.000 partidas debería salir cerca del 35 %
let withDouble = 0;
for (let i = 0; i < 2000; i++) {
  const game = new GameEngine(countries, { durationSeconds: 60 });
  game.start();
  if (game.doubleFinal) withDouble += 1;
  game.finish();
}
const percent = (withDouble / 2000) * 100;
assert.ok(percent > 30 && percent < 40, `Porcentaje fuera de lo esperado: ${percent}%`);
console.log(`✅ Con el azar real, ${percent.toFixed(1)} % de 2.000 partidas tuvieron X2 final (objetivo: 35 %)`);
