// Prueba de la reconexión automática a TikTok, SIN TikTok real: ejecutar con -> npm run test:reconnect
// Usamos una conexión FALSA que podemos "cortar" cuando queramos, y esperas muy cortas.
const EventEmitter = require('events');
const TikTokService = require('../src/tiktok/TikTokService');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Cada vez que el servicio abre una conexión, toma el siguiente resultado de la lista: 'ok' o 'falla'
function createFakeTikTok(results) {
  const opened = [];
  const createConnection = () => {
    const connection = new EventEmitter();
    const result = results.shift() || 'falla';
    connection.connect = async () => {
      if (result === 'ok') return { roomId: `sala-${opened.length}` };
      throw new Error('LIVE no disponible');
    };
    connection.disconnect = async () => {};
    connection.cut = () => connection.emit('disconnected', { code: 1006, reason: 'corte simulado' });
    opened.push(connection);
    return connection;
  };
  return { createConnection, opened };
}

function createService(results) {
  const fake = createFakeTikTok(results);
  const service = new TikTokService({ createConnection: fake.createConnection, reconnectDelaysSeconds: [0.2, 0.2, 0.2] });
  const log = [];
  service.on('connected', (s) => log.push(`connected(${s.roomId})`));
  service.on('reconnecting', (s) => log.push(`reconnecting(${s.reconnectAttempt}/${s.maxReconnectAttempts})`));
  service.on('disconnected', (s) => log.push(`disconnected${s.reason ? `(${s.reason})` : ''}`));
  service.on('event', (e) => log.push(`event:${e.message}`));
  return { service, fake, log };
}

async function scenario(title, run) {
  console.log(`\n${title}`);
  await run();
}

(async () => {
  await scenario('1) Se corta, el 1er reintento falla y el 2º funciona:', async () => {
    const { service, fake, log } = createService(['ok', 'falla', 'ok']);
    await service.connect('streamer');
    fake.opened[0].cut();
    await sleep(700);
    // El chat sigue llegando por la conexión nueva
    fake.opened[2].emit('chat', { user: { displayId: 'juan' }, content: 'Cuba' });
    console.log('   eventos:', log.join(' → '));
    console.log('   estado final:', service.getStatus().status, service.getStatus().username);
    await service.disconnect();
  });

  await scenario('2) Se corta y ningún reintento funciona (el LIVE terminó):', async () => {
    const { service, fake, log } = createService(['ok']);
    await service.connect('streamer');
    fake.opened[0].cut();
    await sleep(1000);
    console.log('   eventos:', log.join(' → '));
    console.log('   estado final:', service.getStatus().status, '| intentos de conexión:', fake.opened.length);
  });

  await scenario('3) Se corta y el streamer pulsa "Desconectar" mientras espera:', async () => {
    const { service, fake, log } = createService(['ok', 'ok']);
    await service.connect('streamer');
    fake.opened[0].cut();
    await sleep(50);
    await service.disconnect();
    await sleep(600);
    console.log('   eventos:', log.join(' → '));
    console.log('   estado final:', service.getStatus().status, '| intentos de conexión:', fake.opened.length, '(no reintentó)');
  });

  await scenario('4) La conexión INICIAL falla (no está en LIVE): error, sin reintentos:', async () => {
    const { service, fake, log } = createService(['falla']);
    try {
      await service.connect('streamer');
    } catch (error) {
      console.log('   error para el streamer:', error.code);
    }
    await sleep(600);
    console.log('   eventos:', log.join(' → ') || '(ninguno)');
    console.log('   estado final:', service.getStatus().status, '| intentos de conexión:', fake.opened.length);
  });
})();
