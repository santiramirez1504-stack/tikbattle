// Prueba manual del Módulo 3: ejecutar con -> npm run test:module3
// Regla anti-spam: solo el PRIMER comentario de cada espectador en la partida suma 1 punto.
const GameEngine = require('../src/games/countryBattle/GameEngine');
const ChatProcessor = require('../src/games/countryBattle/ChatProcessor');
const { DEFAULT_COUNTRIES } = require('../src/games/countryBattle/countries');

const game = new GameEngine(DEFAULT_COUNTRIES);
game.start(); // desde el Módulo 5 los puntos solo se suman con la partida en curso
const chat = new ChatProcessor(game, DEFAULT_COUNTRIES);

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? '✅' : '❌'} ${label} -> ${actual}${ok ? '' : ` (esperado: ${expected})`}`);
}
const points = (id) => game.getState().countries.find((c) => c.id === id).points;

// 1) Mayúsculas, tildes y signos se reconocen igual
const variants = ['CUBA', 'cuba', 'CuBa', 'Cúba', '  cuba!! ', 'MÉXICO', 'REPÚBLICA   DOMINICANA'];
variants.forEach((message, i) => chat.processMessage({ username: `fan${i}`, message }));
check('Cuba con 5 espectadores distintos (variantes de escritura)', points('cuba'), 5);
check('México con 1 espectador', points('mexico'), 1);
check('República Dominicana con 1 espectador', points('republica-dominicana'), 1);
check('"hola a todos" se ignora', chat.processMessage({ username: 'x', message: 'hola a todos' }), null);
check('"me encanta cuba" se ignora', chat.processMessage({ username: 'x', message: 'me encanta cuba' }), null);

// 2) Spam: el mismo espectador repite el país 20 veces -> solo 1 punto
for (let i = 0; i < 20; i += 1) chat.processMessage({ username: 'spammer', message: 'Haiti' });
check('Haití tras 20 comentarios del mismo espectador', points('haiti'), 1);

// 3) Cambiar de país: se cambia (sus regalos irán al nuevo) pero no suma otra vez
check('spammer cambia a México (devuelve el país)', chat.processMessage({ username: 'spammer', message: 'Mexico' }), 'mexico');
check('México no sube por el cambio', points('mexico'), 1);
check('spammer ahora apoya a México', game.getUserCountry('spammer'), 'mexico');
check('Volver a Haití tampoco suma', (chat.processMessage({ username: 'spammer', message: 'Haiti' }), points('haiti')), 1);

// 4) Sin nombre de usuario no cuenta (no se puede saber si ya se unió)
check('Comentario sin usuario', chat.processMessage({ username: '', message: 'Cuba' }), null);

console.log('\nMarcador final:');
console.table(game.getState().countries.map(({ id, points: p }) => ({ id, points: p })));

game.finish(); // detiene el temporizador para que el script termine
if (failures) {
  console.log(`\n❌ ${failures} comprobación(es) fallaron`);
  process.exitCode = 1;
} else {
  console.log('\n✅ Regla anti-spam correcta: 1 punto por espectador, sin importar cuántas veces comente');
}
