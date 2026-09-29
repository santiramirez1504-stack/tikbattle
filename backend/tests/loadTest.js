// Prueba de carga: ¿cuántos streamers aguanta un servidor?
//
// Arranca un servidor de TikBattle SOLO para la prueba (puerto 3999, modo simulación, base de datos
// aparte "tikbattle_loadtest" que se borra al final), crea N streamers de prueba, conecta a cada uno
// su overlay y su dashboard, y les envía comentarios y regalos a la vez. Mide:
//   - CPU y memoria del servidor
//   - retraso: desde que llega un comentario hasta que el overlay recibe los puntos
//
// Uso (desde tiktok-battle/backend):
//   npm run test:load -- --rooms 20 --rate 5 --seconds 60
//     --rooms    streamers en LIVE a la vez                 (por defecto 10)
//     --rate     comentarios por segundo en cada LIVE       (por defecto 3; 0 = sin comentarios)
//     --seconds  duración de la medición                    (por defecto 60)
//
// Nunca toca tus datos: usa su propia base de datos y la borra al terminar.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const GIFT_EVERY_MS = 5000;   // cada LIVE recibe un regalo cada 5 s
const VIEWERS_PER_ROOM = 50;  // espectadores distintos que comentan en cada LIVE

function readArgs() {
  const args = process.argv.slice(2);
  const get = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? Number(args[index + 1]) : fallback;
  };
  return { rooms: get('rooms', 10), rate: get('rate', 3), seconds: get('seconds', 60) };
}

// Base de datos solo para la prueba: la de LOADTEST_MONGODB_URI, o la del .env con otro nombre
function loadTestDatabaseUri() {
  if (process.env.LOADTEST_MONGODB_URI) return process.env.LOADTEST_MONGODB_URI;
  const uri = process.env.MONGODB_URI || '';
  const replaced = uri.replace(/\/([^/?]*)(\?|$)/, '/tikbattle_loadtest$2');
  if (!/\/tikbattle_loadtest(\?|$)/.test(replaced)) {
    throw new Error('No se pudo preparar la base de datos de prueba a partir de MONGODB_URI');
  }
  return replaced;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- CPU y memoria de otro proceso (Windows o Linux) ----------
function readProcessStats(pid) {
  if (process.platform === 'win32') {
    const out = execSync(
      `powershell -NoProfile -Command "$p = Get-Process -Id ${pid}; '' + $p.TotalProcessorTime.TotalMilliseconds + ' ' + $p.WorkingSet64"`,
      { encoding: 'utf8' }
    ).trim().replace(',', '.');
    const [cpuMs, rss] = out.split(/\s+/).map(Number);
    return { cpuMs, rssMb: rss / 1024 / 1024 };
  }
  const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
  const ticks = Number(stat[11]) + Number(stat[12]); // utime + stime
  const rssPages = Number(stat[21]);
  return { cpuMs: (ticks / 100) * 1000, rssMb: (rssPages * 4096) / 1024 / 1024 };
}

// ---------- Cliente Socket.IO mínimo (con el WebSocket que trae Node 22) ----------
function connectSocket(auth, onEvent) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/socket.io/?EIO=4&transport=websocket`);
    const timer = setTimeout(() => reject(new Error('El socket no conectó a tiempo')), 10000);
    ws.onmessage = ({ data }) => {
      if (data === '2') return ws.send('3');                                   // ping -> pong
      if (data.startsWith('0')) return ws.send(`40${JSON.stringify(auth)}`);   // abrir -> entrar con auth
      if (data.startsWith('40')) { clearTimeout(timer); resolve(ws); return; } // conectado
      if (data.startsWith('42')) onEvent(JSON.parse(data.slice(2))[0]);
    };
    ws.onerror = () => reject(new Error('Error en el socket'));
  });
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function main() {
  const { rooms, rate, seconds } = readArgs();
  const databaseUri = loadTestDatabaseUri();
  const jwtSecret = 'prueba-de-carga-' + 'x'.repeat(40);
  console.log(`\nPRUEBA DE CARGA: ${rooms} streamers · ${rate} comentarios/s cada uno · regalo cada ${GIFT_EVERY_MS / 1000} s · ${seconds} s\n`);

  // 1) Servidor solo para la prueba
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), MONGODB_URI: databaseUri, JWT_SECRET: jwtSecret, SIMULATION_MODE: 'true', NODE_ENV: 'development', TRUST_PROXY: '', INTRO_COUNTDOWN_MS: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', (chunk) => { serverLog += chunk; });
  server.stderr.on('data', (chunk) => { serverLog += chunk; });
  const stopServer = () => { try { server.kill(); } catch { /* ya estaba apagado */ } };

  try {
    for (let i = 0; i < 60 && !serverLog.includes('Servidor escuchando'); i++) await sleep(500);
    if (!serverLog.includes('Servidor escuchando')) throw new Error(`El servidor no arrancó:\n${serverLog}`);

    // 2) Streamers de prueba (directamente en la base de datos de prueba: sin límite de registros)
    await mongoose.connect(databaseUri);
    const users = mongoose.connection.db.collection('users');
    const runId = Date.now();
    const docs = Array.from({ length: rooms }, (_, i) => ({
      name: `Carga ${i + 1}`, email: `carga-${runId}-${i}@loadtest.local`, password: 'no-se-usa', role: 'USER', isBlocked: false,
      createdAt: new Date(), updatedAt: new Date(),
    }));
    const { insertedIds } = await users.insertMany(docs);
    const tokens = Object.values(insertedIds).map((id) => jwt.sign({ sub: String(id), role: 'USER' }, jwtSecret, { expiresIn: '1h' }));

    const api = async (method, url, token, body) => {
      const response = await fetch(BASE + url, {
        method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined,
      });
      return response.json();
    };

    // 3) Cada streamer: configuración (1 minuto más que la prueba), overlay + dashboard conectados y partida iniciada
    const latencies = [];
    let received = 0;
    let errors = 0;
    const roomsState = [];
    for (const token of tokens) {
      await api('PUT', '/api/game/config', token, {
        durationSeconds: 600, autoRestartSeconds: 0,
        countries: [
          { name: 'Cuba', command: 'Cuba', color: '#2f7df6' }, { name: 'México', command: 'Mexico', color: '#16a34a' },
          { name: 'Haití', command: 'Haiti', color: '#e11d48' }, { name: 'Colombia', command: 'Colombia', color: '#facc15' },
        ],
        gifts: [{ giftId: 5655, name: 'Rosa', points: 5 }],
      });
      const { path: overlayPath } = await api('GET', '/api/game/overlay', token);
      const key = new URL(overlayPath, BASE).searchParams.get('key');
      const state = { token, pending: [] };
      // Retraso: cada comentario enviado espera su evento "game:score" en el overlay
      const onEvent = (name) => {
        if (name !== 'game:score') return;
        received += 1;
        const sentAt = state.pending.shift();
        if (sentAt) latencies.push(performance.now() - sentAt);
      };
      state.overlay = await connectSocket({ key }, onEvent);
      state.dashboard = await connectSocket({ token }, () => {});
      await api('POST', '/api/game/new', token);
      roomsState.push(state);
    }
    console.log(`  ${rooms} salas listas (overlay + dashboard conectados, partida en curso)`);

    // 4) Carga: comentarios y regalos repartidos en el tiempo
    const countries = ['Cuba', 'Mexico', 'Haiti', 'Colombia'];
    let sent = 0;
    const send = (state, index, body, isChat) => {
      if (isChat) state.pending.push(performance.now());
      sent += 1;
      fetch(`${BASE}/api/simulation/${isChat ? 'chat' : 'gift'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` }, body: JSON.stringify(body),
      }).then((r) => { if (!r.ok) errors += 1; }).catch(() => { errors += 1; });
    };

    const before = readProcessStats(server.pid);
    const startedAt = Date.now();
    let peakRss = before.rssMb;
    // --rate 0: sin comentarios ni regalos (mide lo que cuesta solo tener las salas abiertas)
    const timers = rate <= 0 ? [] : roomsState.map((state, index) => {
      let n = 0;
      const chat = setInterval(() => {
        n += 1;
        const viewer = `espectador_${n % VIEWERS_PER_ROOM}`;
        send(state, index, { username: viewer, message: countries[n % countries.length] }, true);
      }, 1000 / rate);
      const gift = setInterval(() => send(state, index, { username: `espectador_${n % VIEWERS_PER_ROOM}`, gift: 'Rosa' }, false), GIFT_EVERY_MS);
      return [chat, gift];
    });
    const sampler = setInterval(() => { peakRss = Math.max(peakRss, readProcessStats(server.pid).rssMb); }, 5000);

    await sleep(seconds * 1000);
    timers.flat().forEach(clearInterval);
    clearInterval(sampler);
    const after = readProcessStats(server.pid);
    const elapsedMs = Date.now() - startedAt;
    await sleep(1500); // deja llegar los últimos eventos

    // 5) Resultados
    const cpuPercent = ((after.cpuMs - before.cpuMs) / elapsedMs) * 100;
    const chatsPerSecond = rooms * rate;
    console.log('\nRESULTADOS');
    console.log(`  Eventos enviados:      ${sent} (${chatsPerSecond} comentarios/s + regalos)`);
    console.log(`  Puntos recibidos:      ${received} en los overlays · errores: ${errors}`);
    console.log(`  Retraso (overlay):     mediana ${percentile(latencies, 50).toFixed(1)} ms · p95 ${percentile(latencies, 95).toFixed(1)} ms · máx ${Math.max(0, ...latencies).toFixed(1)} ms`);
    console.log(`  CPU del servidor:      ${cpuPercent.toFixed(1)} % de un núcleo`);
    console.log(`  Memoria del servidor:  ${after.rssMb.toFixed(0)} MB (máx ${peakRss.toFixed(0)} MB)`);
    console.log(`  Por streamer:          ${(cpuPercent / rooms).toFixed(2)} % de CPU · por comentario: ${((after.cpuMs - before.cpuMs) / Math.max(1, sent)).toFixed(3)} ms de CPU`);
    console.log(`RESULT_JSON ${JSON.stringify({ rooms, rate, seconds, sent, received, errors, cpuPercent, rssMb: after.rssMb, peakRss, p50: percentile(latencies, 50), p95: percentile(latencies, 95) })}`);

    roomsState.forEach((state) => { state.overlay.close(); state.dashboard.close(); });
  } finally {
    stopServer();
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.dropDatabase(); // borra todo lo de la prueba
      await mongoose.disconnect();
    }
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error('[PRUEBA DE CARGA] Error:', error.message);
  process.exit(1);
});
