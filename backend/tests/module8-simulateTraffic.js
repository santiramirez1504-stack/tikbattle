// Prueba visual: simula un chat lleno de gente en TU sala para ver el overlay en movimiento.
// Requiere el servidor encendido (npm start) y una partida INICIADA desde el dashboard.
// Ejecutar con -> npm run test:module8 -- tu_email tu_contraseña
// Opcional: segundos de simulación al final -> npm run test:module8 -- tu_email tu_contraseña 60
// (Solo para desarrollo: la contraseña queda en el historial de la terminal.)
require('dotenv').config();

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;
const [email, password, secondsArg] = process.argv.slice(2);
const SIMULATION_SECONDS = Number(secondsArg) || 30;
const DELAY_MS = 150;       // tiempo entre eventos
const GIFT_CHANCE = 0.06;   // 6% de los eventos son un regalo
const NOISE_MESSAGES = ['hola a todos', 'que buen live', 'saludos!!'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pick = (list) => list[Math.floor(Math.random() * list.length)];

let token = null;

async function request(method, path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Error ${response.status}`);
  }
  return data;
}

async function main() {
  if (!email || !password) {
    console.log('Uso: npm run test:module8 -- tu_email tu_contraseña [segundos]');
    return;
  }

  // Los eventos van a la sala del streamer que inicia sesión
  ({ token } = await request('POST', '/api/auth/login', { email, password }));

  const state = await request('GET', '/api/game/state');
  if (state.gameStatus !== 'RUNNING') {
    console.log('Tu partida no está en curso. Pulsa "▶ Nueva partida" en el dashboard y vuelve a ejecutar.');
    return;
  }

  // Mensajes y regalos según TU configuración (tus comandos y tus regalos)
  const config = await request('GET', '/api/game/config');
  const messages = [...config.countries.map((country) => country.command), ...NOISE_MESSAGES];
  const giftNames = config.gifts.map((gift) => gift.name);

  console.log(`Enviando eventos durante ${SIMULATION_SECONDS} segundos... Mira tu overlay.\n`);

  const endAt = Date.now() + SIMULATION_SECONDS * 1000;
  let response;

  while (Date.now() < endAt) {
    const username = `usuario${Math.ceil(Math.random() * 40)}`;

    if (giftNames.length > 0 && Math.random() < GIFT_CHANCE) {
      const gift = pick(giftNames);
      response = await request('POST', '/api/simulation/gift', { username, gift });
      if (response.result.assigned) {
        console.log(`🎁 ${username} envió ${gift} -> +${response.result.points} a ${response.result.countryId}`);
      }
    } else {
      response = await request('POST', '/api/simulation/chat', { username, message: pick(messages) });
    }

    if (response.state.gameStatus === 'FINISHED') {
      console.log('\nLa partida terminó antes que la simulación.');
      break;
    }
    await sleep(DELAY_MS);
  }

  console.log('\nMarcador al terminar la simulación:');
  console.table(response.state.countries.map(({ name, points }) => ({ name, points })));
}

main().catch((error) => {
  console.error('Error:', error.message);
  console.error('¿Está el servidor encendido con "npm start"? ¿El email y la contraseña son correctos?');
  process.exit(1);
});
