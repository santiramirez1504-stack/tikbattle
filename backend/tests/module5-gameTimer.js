// Prueba manual del Módulo 5: ejecutar con -> npm run test:module5  (dura unos 35 segundos)
const GameEngine = require('../src/games/countryBattle/GameEngine');
const ChatProcessor = require('../src/games/countryBattle/ChatProcessor');
const GiftProcessor = require('../src/games/countryBattle/GiftProcessor');
const { DEFAULT_COUNTRIES } = require('../src/games/countryBattle/countries');
const { DEFAULT_GIFTS } = require('../src/games/countryBattle/gifts');

// 125 -> "02:05"
function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function printResult(result) {
  if (result.winners.length === 0) {
    console.log('   SIN GANADOR: nadie sumó puntos');
  } else if (result.isTie) {
    console.log('   EMPATE entre:', result.winners.map((c) => c.name).join(', '));
  } else {
    console.log('   GANADOR:', result.winners[0].name);
  }
  console.table(result.ranking);
}

const game = new GameEngine(DEFAULT_COUNTRIES, { durationSeconds: 30 });
const chat = new ChatProcessor(game, DEFAULT_COUNTRIES);
const gifts = new GiftProcessor(game, DEFAULT_GIFTS);

// ---------- PARTIDA 1: 30 segundos, con ganador ----------
console.log('1) Estado antes de iniciar:', game.getState().gameStatus);
console.log('   Mensaje "Cuba" antes de iniciar ->', chat.processMessage({ username: 'juan', message: 'Cuba' }) || 'ignorado');

game.on('tick', (remainingTime) => console.log(`   TIEMPO ${formatTime(remainingTime)}`));

game.once('end', (result) => {
  console.log('\n3) ¡Tiempo terminado! Estado:', game.getState().gameStatus);
  printResult(result);

  console.log('4) Mensaje "Cuba" con la partida terminada ->', chat.processMessage({ username: 'juan', message: 'Cuba' }) || 'ignorado');
  console.log('   Rosa con la partida terminada ->', gifts.processGift({ username: 'juan', giftName: 'Rosa' }));

  runTieGame();
});

game.start();
console.log('\n2) Partida iniciada. Estado:', game.getState().gameStatus);

// Eventos simulados durante la partida
setTimeout(() => {
  chat.processMessage({ username: 'juan', message: 'Cuba' });
  gifts.processGift({ username: 'juan', giftName: 'Rosa' });
  chat.processMessage({ username: 'maria', message: 'Mexico' });
  console.log('   >> juan: "Cuba" + Rosa | maria: "Mexico"');
}, 3000);

// ---------- PARTIDA 2: reinicio y empate (3 segundos) ----------
function runTieGame() {
  game.removeAllListeners('tick');
  game.reset();
  game.durationSeconds = 3; // solo para que la prueba sea corta; en el Módulo 11 la duración vendrá del dashboard
  console.log('\n5) Partida reiniciada. Estado:', game.getState().gameStatus, '| Puntos:', game.getState().countries.map((c) => c.points).join(', '));

  game.once('end', (result) => {
    console.log('\n6) Fin de la partida de empate:');
    printResult(result);
  });

  game.start();
  chat.processMessage({ username: 'ana', message: 'Haiti' });
  chat.processMessage({ username: 'luis', message: 'Republica Dominicana' });
  console.log('   >> ana: "Haiti" | luis: "Republica Dominicana"  (esperando 3 segundos...)');
}
