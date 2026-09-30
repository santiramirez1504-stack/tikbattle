// Prueba de likes, seguir y compartir: ejecutar con -> npm run test:interactions
const GameEngine = require('../src/games/countryBattle/GameEngine');
const ChatProcessor = require('../src/games/countryBattle/ChatProcessor');
const InteractionProcessor = require('../src/games/countryBattle/InteractionProcessor');
const { DEFAULT_COUNTRIES } = require('../src/games/countryBattle/countries');

// Sin X2 para que los puntos sean exactos
const game = new GameEngine(DEFAULT_COUNTRIES, { random: () => 1 });
const chat = new ChatProcessor(game, DEFAULT_COUNTRIES);
const interactions = new InteractionProcessor(game);

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? '✅' : '❌'} ${label} -> ${actual}${ok ? '' : ` (esperado: ${expected})`}`);
}
const points = (id) => game.getState().countries.find((c) => c.id === id).points;
const send = (type, username, count) => interactions.processInteraction({ type, username, count });

check('Like con la partida sin empezar', send('LIKE', 'juan', 50).reason, 'GAME_NOT_RUNNING');
game.start();

check('Like de alguien SIN país', send('LIKE', 'pepe', 50).reason, 'USER_HAS_NO_COUNTRY');
chat.processMessage({ username: 'juan', message: 'Cuba' }); // +1 por unirse
check('Cuba tras unirse juan', points('cuba'), 1);

// Likes: 1 punto cada 10, lo que sobra se guarda
check('7 likes (aún no llega a 10)', send('LIKE', 'juan', 7).reason, 'NOT_ENOUGH_LIKES');
check('5 likes más (12 en total) -> puntos', send('LIKE', 'juan', 5).points, 1);
check('8 likes más (sobraban 2 -> 10) -> puntos', send('LIKE', 'juan', 8).points, 1);
check('35 likes de golpe -> puntos', send('LIKE', 'juan', 35).points, 3);
check('Cuba (1 + 1 + 1 + 3)', points('cuba'), 6);

// Seguir y compartir: una vez por partida
check('juan sigue al streamer', send('FOLLOW', 'juan').points, 5);
check('juan "sigue" otra vez (dejó de seguir y volvió)', send('FOLLOW', 'juan').reason, 'ALREADY_REWARDED');
check('juan comparte el LIVE', send('SHARE', 'juan').points, 5);
check('juan comparte 10 veces más', [...Array(10)].map(() => send('SHARE', 'juan')).every((r) => !r.assigned), true);
check('Cuba (6 + 5 + 5)', points('cuba'), 16);

// Si cambia de país, sus likes van al nuevo
chat.processMessage({ username: 'juan', message: 'Mexico' });
check('10 likes tras cambiar a México', send('LIKE', 'juan', 10).countryId, 'mexico');
check('México', points('mexico'), 1);

// Nueva partida: los contadores empiezan de cero
game.finish();
game.reset();
game.start();
chat.processMessage({ username: 'juan', message: 'Haiti' });
check('Nueva partida: puede volver a ganar por compartir', send('SHARE', 'juan').points, 5);
check('Tipo desconocido', send('BAILE', 'juan').reason, 'UNKNOWN_TYPE');
check('Sin usuario', send('LIKE', '', 10).reason, 'NO_USERNAME');

game.finish();
if (failures) {
  console.log(`\n❌ ${failures} comprobación(es) fallaron`);
  process.exitCode = 1;
} else {
  console.log('\n✅ Likes (1 punto cada 10), seguir (+5) y compartir (+5, una vez por partida) correctos');
}
