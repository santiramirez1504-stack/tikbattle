// La URL del overlay lleva la clave secreta del streamer: /overlay/country-battle/?key=...
// Con ella el servidor sabe de qué sala (qué streamer) mostrar la partida.
const overlayKey = new URLSearchParams(window.location.search).get('key');

const GAME_EVENTS = ['game:state', 'game:countdown', 'game:start', 'game:update', 'game:score', 'game:end', 'game:reset'];
const STAGE_WIDTH = 540;        // tamaño de diseño del escenario (9:16, como la pantalla vertical de TikTok)
const STAGE_HEIGHT = 960;
const URGENT_SECONDS = 10;      // desde aquí el temporizador se pone rojo y aparece la cuenta atrás grande
const RANK_BADGES = 3;          // insignias 1, 2 y 3 en los primeros puestos
const FEED_MAX_ITEMS = 1;       // la actividad se ve de una en una, dentro de la cápsula de estado
const FEED_ITEM_MS = 3000;      // cuánto se ve cada actividad (si llega otra antes, la reemplaza)
const GIFT_ALERT_MS = 2800;     // cuánto dura cada alerta de regalo
const GIFT_ALERT_QUEUE_MAX = 5; // alertas en espera como máximo (si llegan más, se descartan las más viejas)
const FLOAT_GROUP_MS = 250;     // los "+N" de un país se agrupan en este tiempo (para no saturar la pantalla)
const CONFETTI_MS = 5000;
const DOUBLE_INTRO_MS = 2600;   // cuánto dura el anuncio "X2 ¡Activado!" con rayos

const STATUS_TEXT = {
  WAITING: '⏳ ¡Elige tu país! Escribe su nombre en el chat',
  RUNNING: '💬 Escribe el nombre de tu país en el chat',
  FINISHED: '🏁 ¡Batalla terminada!',
};

const el = (id) => document.getElementById(id);
const stageEl = el('stage');
const timerEl = el('timer');
const timeEl = el('time');
const statusEl = el('status');
const sideLeftEl = el('side-left');
const sideRightEl = el('side-right');
const feedEl = el('feed');
const countdownEl = el('countdown');
const leaderBannerEl = el('leader-banner');
const resultEl = el('result');

// Banderas ya creadas, por id de país. Se crean una vez y luego solo se actualizan.
const teams = new Map();
let layoutKey = null;           // orden y reparto de los países (si cambia la configuración se recolocan)
// Último estado recibido (para buscar países al mostrar el feed)
let lastState = null;
let lastStatus = null;
let lastLeaderId = null;

// ---------- Utilidades ----------

// 125 -> "02:05"
function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

// 1500 -> "1.500"
function formatPoints(points) {
  return points.toLocaleString('es');
}

// Imagen de la bandera (las sirve nuestro servidor). Solo códigos de 2 letras.
function flagUrl(code) {
  return /^[a-z]{2}$/.test(code || '') ? `/flags/4x3/${code}.svg` : null;
}

function createFlag(country, className) {
  const url = flagUrl(country && country.flag);
  if (url) {
    const img = document.createElement('img');
    img.className = className;
    img.src = url;
    img.alt = country.name;
    return img;
  }
  // Sin bandera: rectángulo del color del país con su inicial
  const fallback = document.createElement('span');
  fallback.className = `${className} flag-fallback`;
  fallback.style.setProperty('--color', country ? country.color : '#555');
  fallback.textContent = country ? country.name.charAt(0).toUpperCase() : '?';
  return fallback;
}

// Foto de perfil redonda de un espectador (viene de TikTok). Si no hay foto o no carga: su inicial.
function createAvatar(username, avatarUrl, className) {
  const fallback = document.createElement('span');
  fallback.className = `${className} avatar-fallback`;
  fallback.textContent = (username || '?').charAt(0).toUpperCase();

  if (typeof avatarUrl !== 'string' || !avatarUrl.startsWith('https://')) {
    return fallback;
  }
  const img = document.createElement('img');
  img.className = className;
  img.alt = '';
  img.referrerPolicy = 'no-referrer'; // TikTok no necesita saber desde dónde se ve
  img.src = avatarUrl;
  img.addEventListener('error', () => img.replaceWith(fallback), { once: true });
  return img;
}

function findCountry(countryId) {
  return lastState ? lastState.countries.find((country) => country.id === countryId) : null;
}

// Reinicia una animación CSS aunque ya se estuviera ejecutando
function restartAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

// ---------- Banderas a los lados ----------
// Las banderas se ordenan por puntos: el 1º arriba a la izquierda, bajando por la columna izquierda
// y siguiendo por la derecha, hasta el último abajo a la derecha. Cuando un país adelanta a otro,
// las banderas se deslizan a su nuevo puesto. Además: insignias 1-2-3, corona del líder y puntos en dorado.

function createTeam(country) {
  const teamEl = document.createElement('li');
  teamEl.className = 'team';

  const flagWrap = document.createElement('div');
  flagWrap.className = 'team-flag-wrap';
  const crown = document.createElement('span');
  crown.className = 'team-crown';
  crown.textContent = '👑';
  const rankEl = document.createElement('span');
  rankEl.className = 'team-rank';
  rankEl.hidden = true;
  const flagSlot = document.createElement('span'); // la bandera se pone en renderBoard (puede cambiar)
  flagWrap.append(crown, rankEl, flagSlot);

  // textContent (no innerHTML) para que ningún texto pueda inyectar HTML en la página
  const pointsEl = document.createElement('span');
  pointsEl.className = 'team-points';
  const pointsText = document.createTextNode('0');
  pointsEl.append(pointsText);

  const subEl = document.createElement('div');
  subEl.className = 'team-sub';

  teamEl.append(flagWrap, pointsEl, subEl);
  // Al terminar de deslizarse a su nuevo puesto, vuelve a su capa normal
  teamEl.addEventListener('transitionend', (event) => {
    if (event.target === teamEl && event.propertyName === 'transform') teamEl.classList.remove('is-moving');
  });

  const team = {
    el: teamEl, rankEl, flagSlot, flagKey: null, pointsEl, pointsText, subEl, subKey: null,
    lastPoints: country.points, pendingFloat: 0, floatTimer: null,
  };
  teams.set(country.id, team);
  return team;
}

// "+50" flotando sobre los puntos (se agrupan los que llegan casi a la vez)
function queueFloatPoints(team, amount) {
  team.pendingFloat += amount;
  if (team.floatTimer) return;
  team.floatTimer = setTimeout(() => {
    const float = document.createElement('span');
    float.className = 'float-points';
    float.textContent = `+${formatPoints(team.pendingFloat)}`;
    team.pointsEl.append(float);
    float.addEventListener('animationend', () => float.remove());
    team.pendingFloat = 0;
    team.floatTimer = null;
  }, FLOAT_GROUP_MS);
}

// Debajo de los puntos: la foto y el nombre del MVP, o (en la espera) lo que hay que escribir
function renderTeamSub(team, country, status) {
  const mvp = status !== 'WAITING' ? country.mvp : null;
  const key = mvp ? `mvp|${mvp.username}|${mvp.avatarUrl}` : `cmd|${country.command}`;
  if (team.subKey === key) return; // no ha cambiado: no se redibuja (la foto no parpadea)
  team.subKey = key;

  team.subEl.textContent = '';
  if (mvp) {
    const name = document.createElement('span');
    name.className = 'team-name';
    name.textContent = mvp.username;
    team.subEl.append(createAvatar(mvp.username, mvp.avatarUrl, 'mvp-avatar'), name);
  } else if (country.command) {
    const command = document.createElement('span');
    command.className = 'team-command';
    command.textContent = country.command;
    team.subEl.append(command);
  }
}

// Coloca los países por puesto: la primera mitad (los mejores) a la izquierda y el resto a la derecha.
// ranked: países ya ordenados de más a menos puntos (en empate, en el orden de la configuración).
function placeTeams(ranked) {
  const key = ranked.map((country) => country.id).join(',');
  if (key === layoutKey) return; // nadie cambió de puesto
  const isFirstLayout = layoutKey === null;
  layoutKey = key;

  // Animación "FLIP": se mide dónde está cada bandera, se mueve a su nuevo sitio y se anima
  // desde la posición vieja hasta la nueva (solo se mueve con transform: muy poco trabajo).
  const before = new Map();
  if (!isFirstLayout) {
    for (const [id, team] of teams) before.set(id, team.el.getBoundingClientRect());
  }

  const half = Math.ceil(ranked.length / 2);
  if (sideLeftEl.children.length + sideRightEl.children.length !== ranked.length) needsFit = true;
  ranked.forEach((country, index) => {
    const team = teams.get(country.id);
    (index < half ? sideLeftEl : sideRightEl).append(team.el);
  });
  // Con pocos países por lado, se reparten en el alto disponible
  sideLeftEl.classList.toggle('is-spread', half <= 3);
  sideRightEl.classList.toggle('is-spread', half <= 3);

  if (isFirstLayout) return;
  // Las medidas de la pantalla vienen escaladas (--scale y el ajuste --fit): se pasan a medidas de la bandera
  const fit = parseFloat(stageEl.style.getPropertyValue('--fit')) || 1;
  const scale = (stageEl.getBoundingClientRect().width / STAGE_WIDTH || 1) * fit;
  for (const [id, oldRect] of before) {
    const team = teams.get(id);
    if (!team) continue;
    const newRect = team.el.getBoundingClientRect();
    const dx = (oldRect.left - newRect.left) / scale;
    const dy = (oldRect.top - newRect.top) / scale;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    team.el.classList.remove('is-moving');
    team.el.style.transform = `translate(${dx}px, ${dy}px)`;
    void team.el.offsetWidth; // aplica la posición vieja antes de animar
    team.el.classList.add('is-moving');
    team.el.style.transform = '';
  }
}

function renderBoard(state) {
  const countries = state.countries;
  const sorted = [...countries].sort((a, b) => b.points - a.points);

  // Si el streamer quitó países en la configuración, se borran sus banderas
  const currentIds = new Set(countries.map((country) => country.id));
  for (const [id, team] of teams) {
    if (!currentIds.has(id)) {
      team.el.remove();
      teams.delete(id);
    }
  }
  for (const country of countries) {
    if (!teams.has(country.id)) createTeam(country);
  }
  // sort es estable: en empate se mantiene el orden de la configuración (las banderas no "bailan")
  placeTeams(sorted);

  // Puesto de cada país (solo cuenta si tiene puntos)
  const rankById = new Map();
  sorted.forEach((country, index) => {
    if (country.points > 0 && index < RANK_BADGES) rankById.set(country.id, index + 1);
  });
  const leader = sorted[0];
  const hasUniqueLeader = leader && leader.points > 0 && (!sorted[1] || sorted[1].points < leader.points);

  for (const country of countries) {
    const team = teams.get(country.id);

    // La bandera puede cambiar desde la configuración del dashboard
    const flagKey = `${country.flag}|${country.color}|${country.name}`;
    if (team.flagKey !== flagKey) {
      const flag = createFlag(country, 'team-flag');
      team.flagSlot.replaceWith(flag);
      team.flagSlot = flag;
      team.flagKey = flagKey;
    }

    const rank = rankById.get(country.id);
    team.rankEl.hidden = !rank;
    if (rank) {
      team.rankEl.textContent = String(rank);
      team.rankEl.className = `team-rank rank-${rank}`;
    }
    team.el.classList.toggle('leader', Boolean(hasUniqueLeader && leader.id === country.id));

    team.pointsText.nodeValue = formatPoints(country.points);
    renderTeamSub(team, country, state.gameStatus);

    const gained = country.points - team.lastPoints;
    if (gained > 0) {
      restartAnimation(team.pointsEl, 'bump');
      queueFloatPoints(team, gained);
    }
    team.lastPoints = country.points;
  }

  detectLeaderChange(state, sorted);
}

// ---------- "¡X toma el liderato!" ----------

function detectLeaderChange(state, sorted) {
  const top = sorted[0];
  const isUniqueLeader = top && top.points > 0 && (!sorted[1] || sorted[1].points < top.points);
  const leaderId = isUniqueLeader ? top.id : null;

  if (state.gameStatus === 'RUNNING' && leaderId && lastLeaderId && leaderId !== lastLeaderId) {
    showLeaderBanner(top);
  }
  if (leaderId) lastLeaderId = leaderId;
  if (state.gameStatus !== 'RUNNING') lastLeaderId = leaderId;
}

function showLeaderBanner(country) {
  leaderBannerEl.textContent = '';
  const text = document.createElement('span');
  text.textContent = `🔥 ¡${country.name} toma el liderato!`;
  leaderBannerEl.append(createFlag(country, 'banner-flag'), text);
  leaderBannerEl.hidden = false;
  restartAnimation(leaderBannerEl, 'leader-banner');
  clearTimeout(showLeaderBanner.timer);
  showLeaderBanner.timer = setTimeout(() => { leaderBannerEl.hidden = true; }, 2600);
}

// ---------- Temporizador y cuenta atrás ----------

let lastCountdownNumber = null;

function renderTimer(state) {
  timeEl.textContent = formatTime(state.remainingTime);
  const isUrgent = state.gameStatus === 'RUNNING' && state.remainingTime <= URGENT_SECONDS;
  timerEl.classList.toggle('urgent', isUrgent);

  // Números grandes en el centro durante los últimos segundos
  const showCountdown = isUrgent && state.remainingTime > 0;
  countdownEl.hidden = !showCountdown;
  if (showCountdown && state.remainingTime !== lastCountdownNumber) {
    countdownEl.textContent = String(state.remainingTime);
    restartAnimation(countdownEl, 'tick');
  }
  lastCountdownNumber = showCountdown ? state.remainingTime : null;
}

// ---------- X2 final ----------
// El servidor sortea al empezar cada partida si habrá X2 (35 %). El overlay solo se entera cuando
// se activa (state.doublePoints): entonces muestra el anuncio con rayos y la insignia junto al tiempo.

let lastDoublePoints = false;
let doubleIntroTimer = null;

function renderDouble(state) {
  const active = state.gameStatus === 'RUNNING' && Boolean(state.doublePoints);
  el('timer-double').hidden = !active;
  if (active && !lastDoublePoints) {
    showDoubleIntro();
  }
  if (!active) {
    hideDoubleIntro();
  }
  lastDoublePoints = active;
}

function showDoubleIntro() {
  const doubleEl = el('double');
  // Al pasar de oculto a visible, todas sus animaciones empiezan de cero
  doubleEl.hidden = true;
  void doubleEl.offsetWidth;
  doubleEl.hidden = false;
  stageEl.classList.add('is-double-intro');
  clearTimeout(doubleIntroTimer);
  doubleIntroTimer = setTimeout(hideDoubleIntro, DOUBLE_INTRO_MS);
}

function hideDoubleIntro() {
  clearTimeout(doubleIntroTimer);
  el('double').hidden = true;
  stageEl.classList.remove('is-double-intro');
}

// ---------- Feed de actividad ----------

function addFeedItem(activity) {
  const country = findCountry(activity.countryId);
  const item = document.createElement('li');
  item.className = activity.type === 'GIFT' ? 'feed-item is-gift' : 'feed-item';
  item.style.setProperty('--color', country ? country.color : '#888');

  item.append(createFlag(country, 'feed-flag'));
  if (activity.type === 'GIFT' && activity.giftImage && activity.giftImage.startsWith('https://')) {
    const giftImg = document.createElement('img');
    giftImg.className = 'feed-gift';
    giftImg.src = activity.giftImage;
    giftImg.alt = activity.giftName;
    giftImg.referrerPolicy = 'no-referrer';
    item.append(giftImg);
  }

  const text = document.createElement('span');
  const who = document.createElement('strong');
  who.textContent = activity.username;
  const countryName = country ? country.name : '';
  // Texto corto: cabe en la cápsula de estado (el detalle del regalo sale en la alerta)
  const rest = activity.type === 'GIFT'
    ? ` +${formatPoints(activity.points)} a ${countryName}`
    : ` se unió a ${countryName}`;
  text.append(who, document.createTextNode(rest));
  item.append(text);

  feedEl.prepend(item);

  // Máximo FEED_MAX_ITEMS a la vez: los más viejos salen
  while (feedEl.children.length > FEED_MAX_ITEMS) {
    feedEl.lastElementChild.remove();
  }
  setTimeout(() => {
    item.classList.add('is-leaving');
    item.addEventListener('animationend', () => item.remove());
  }, FEED_ITEM_MS);
}

// ---------- Alerta de regalo ----------

const giftAlertQueue = [];
let currentAlert = null;   // alerta que se ve ahora: { activity, hideTimer }

// Mismo espectador, mismo regalo y mismo país: se junta en una sola alerta (combos)
function isSameGift(a, b) {
  return a.username === b.username && a.giftName === b.giftName && a.countryId === b.countryId;
}

// Los combos (ej. Rosa x10) llegan como varios regalos seguidos: en vez de 10 alertas,
// una sola cuyo contador sube en vivo ("5× Rosa +25").
function queueGiftAlert(activity) {
  const incoming = { ...activity };

  if (currentAlert && isSameGift(currentAlert.activity, incoming)) {
    currentAlert.activity.count += incoming.count;
    currentAlert.activity.points += incoming.points;
    fillGiftAlert(currentAlert.activity);
    restartAnimation(el('gift-alert-points'), 'bump');
    scheduleGiftAlertHide(); // sigue visible mientras el combo continúa
    return;
  }

  const last = giftAlertQueue[giftAlertQueue.length - 1];
  if (last && isSameGift(last, incoming)) {
    last.count += incoming.count;
    last.points += incoming.points;
    return;
  }

  giftAlertQueue.push(incoming);
  while (giftAlertQueue.length > GIFT_ALERT_QUEUE_MAX) {
    giftAlertQueue.shift();
  }
  if (!currentAlert) showNextGiftAlert();
}

function fillGiftAlert(activity) {
  const country = findCountry(activity.countryId);
  const image = el('gift-alert-image');
  if (activity.giftImage && activity.giftImage.startsWith('https://')) {
    if (image.src !== activity.giftImage) image.src = activity.giftImage;
    image.hidden = false;
  } else {
    image.hidden = true;
  }
  el('gift-alert-user').textContent = activity.username;
  el('gift-alert-gift').textContent = `envió ${activity.count > 1 ? `${activity.count}× ` : ''}${activity.giftName}`;
  el('gift-alert-points').textContent = `+${formatPoints(activity.points)} a ${country ? country.name.toUpperCase() : ''}`;
}

function scheduleGiftAlertHide() {
  clearTimeout(currentAlert.hideTimer);
  currentAlert.hideTimer = setTimeout(() => {
    el('gift-alert').classList.add('is-leaving');
    setTimeout(showNextGiftAlert, 350);
  }, GIFT_ALERT_MS);
}

function showNextGiftAlert() {
  const activity = giftAlertQueue.shift();
  const alertEl = el('gift-alert');
  if (!activity) {
    currentAlert = null;
    alertEl.hidden = true;
    return;
  }

  currentAlert = { activity, hideTimer: null };
  fillGiftAlert(activity);
  alertEl.classList.remove('is-leaving');
  alertEl.hidden = false;
  restartAnimation(alertEl, 'gift-alert');
  scheduleGiftAlertHide();
}

function handleActivity(activity) {
  addFeedItem(activity);
  if (activity.type === 'GIFT') {
    queueGiftAlert(activity);
  }
}

// ---------- Pantalla final: podio de países y confeti ----------

let resultKey = null;

function renderResult(state) {
  const result = state.result;
  const isFinished = state.gameStatus === 'FINISHED' && Boolean(result);
  stageEl.classList.toggle('is-finished', isFinished);
  if (!isFinished) {
    resultEl.classList.add('hidden');
    resultKey = null;
    return;
  }

  // Solo se dibuja una vez por partida (así las animaciones de entrada no se repiten)
  const key = JSON.stringify(result.ranking.map((country) => [country.id, country.points]));
  if (key === resultKey) return;
  resultKey = key;

  const titleEl = el('result-title');
  const podium = el('podium');
  podium.textContent = '';

  if (result.winners.length === 0) {
    titleEl.textContent = '🏁 Sin ganador · nadie sumó puntos';
  } else {
    titleEl.textContent = result.isTie
      ? `🤝 ¡Empate! ${result.winners.map((country) => country.name).join(' · ')}`
      : `🏆 ¡Gana ${result.winners[0].name}!`;

    // Los 3 primeros que sumaron puntos: 2º a la izquierda, 1º en el centro, 3º a la derecha
    result.ranking.filter((country) => country.points > 0).slice(0, 3).forEach((country, index) => {
      const item = document.createElement('li');
      item.className = `podium-item place-${index + 1}`;

      const rank = document.createElement('span');
      rank.className = 'podium-rank';
      rank.textContent = String(index + 1);

      const points = document.createElement('span');
      points.className = 'podium-points';
      points.textContent = formatPoints(country.points);

      item.append(rank, createFlag(country, 'podium-flag'), points);

      if (country.mvp) {
        const mvp = document.createElement('div');
        mvp.className = 'podium-mvp';
        const name = document.createElement('span');
        name.textContent = country.mvp.username;
        mvp.append(createAvatar(country.mvp.username, country.mvp.avatarUrl, 'mvp-avatar'), name);
        item.append(mvp);
      }
      podium.append(item);
    });
  }

  resultEl.classList.remove('hidden');
}

// Confeti con los colores del ganador (canvas, sin librerías)
function launchConfetti(colors) {
  const canvas = el('confetti');
  const ctx = canvas.getContext('2d');
  const ratio = 2; // dibuja a doble resolución para que se vea nítido al escalar
  canvas.width = STAGE_WIDTH * ratio;
  canvas.height = STAGE_HEIGHT * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const palette = [...colors, '#fbbf24', '#ffffff'];
  const pieces = Array.from({ length: 170 }, () => ({
    x: Math.random() * STAGE_WIDTH,
    y: -20 - Math.random() * STAGE_HEIGHT * 0.5,
    size: 6 + Math.random() * 8,
    speedY: 2.5 + Math.random() * 3.5,
    speedX: -1.5 + Math.random() * 3,
    angle: Math.random() * Math.PI,
    spin: -0.2 + Math.random() * 0.4,
    color: palette[Math.floor(Math.random() * palette.length)],
  }));

  const start = performance.now();
  function frame(now) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    for (const piece of pieces) {
      piece.x += piece.speedX;
      piece.y += piece.speedY;
      piece.angle += piece.spin;
      ctx.save();
      ctx.globalAlpha = elapsed > CONFETTI_MS - 800 ? Math.max(0, (CONFETTI_MS - elapsed) / 800) : 1;
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.angle);
      ctx.fillStyle = piece.color;
      ctx.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
      ctx.restore();
    }
    if (elapsed < CONFETTI_MS) {
      requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    }
  }
  requestAnimationFrame(frame);
}

// ---------- Conteo "1, 2, 3, ¡GO!" antes de la partida ----------
// El servidor espera INTRO_TOTAL_MS antes de empezar la partida y avisa cuánto falta (introCountdownMs).
// Aquí se muestran los números (con un pitido) y el "¡GO!" (con voz); al terminar entra el overlay.

const INTRO_TOTAL_MS = 4000;                  // debe coincidir con INTRO_COUNTDOWN_MS del servidor
const INTRO_STEPS = ['1', '2', '3', '¡GO!'];  // uno por segundo
const INTRO_BEEPS = [523, 659, 784];          // notas de los pitidos del 1, 2 y 3 (do, mi, sol)
const ENTER_MS = 900;                         // duración de la entrada del overlay

const introEl = el('intro');
const introTextEl = el('intro-text');
const goVoice = new Audio('sounds/go.wav');   // voz "Go!" (generada con la voz de Windows)
goVoice.preload = 'auto';
let introPlaying = false;
let introTimers = [];
let audioContext = null;

// Pitido corto con Web Audio (sin archivos). Si el navegador no deja reproducir sonido, no pasa nada.
function playBeep(frequency, durationMs = 180) {
  try {
    audioContext = audioContext || new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    const now = audioContext.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + durationMs / 1000 + 0.05);
  } catch (error) {
    // sin sonido
  }
}

function playGoVoice() {
  goVoice.currentTime = 0;
  goVoice.play().catch(() => {}); // si el navegador bloquea el sonido automático, se sigue sin voz
  playBeep(1047, 350); // y un pitido agudo de "salida"
}

function showIntroStep(index) {
  const isGo = index === INTRO_STEPS.length - 1;
  introTextEl.textContent = INTRO_STEPS[index];
  introTextEl.classList.toggle('is-go', isGo);
  restartAnimation(introTextEl, 'pop');
  if (isGo) {
    restartAnimation(el('intro-flash'), 'flash');
    playGoVoice();
  } else {
    playBeep(INTRO_BEEPS[index]);
  }
}

function playIntro(remainingMs) {
  introPlaying = true;
  introTimers.forEach(clearTimeout);
  introTimers = [];
  stageEl.classList.remove('is-entering');
  stageEl.classList.add('is-intro');
  introTextEl.textContent = '';
  introEl.hidden = false;

  // Si el overlay se abrió con el conteo ya empezado, se salta lo que ya pasó
  const elapsed = Math.max(0, INTRO_TOTAL_MS - remainingMs);
  INTRO_STEPS.forEach((_, index) => {
    const at = index * 1000 - elapsed;
    if (at > -800) introTimers.push(setTimeout(() => showIntroStep(index), Math.max(0, at)));
  });
  introTimers.push(setTimeout(finishIntro, remainingMs));
}

// Termina el conteo y el overlay entra con su animación
function finishIntro() {
  if (!introPlaying) return;
  introPlaying = false;
  introTimers.forEach(clearTimeout);
  introTimers = [];
  introEl.hidden = true;
  stageEl.classList.remove('is-intro');
  stageEl.classList.add('is-entering');
  introTimers.push(setTimeout(() => stageEl.classList.remove('is-entering'), ENTER_MS));
}

function renderIntro(state) {
  const remaining = state.introCountdownMs || 0;
  if (remaining > 0 && !introPlaying) {
    playIntro(remaining);
  } else if (introPlaying && (state.gameStatus === 'RUNNING' || remaining === 0)) {
    finishIntro(); // empezó la partida (o el streamer canceló el conteo)
  }
}

// ---------- Tamaños (los elige el streamer en el dashboard) ----------

const SIZE_KEYS = ['flags', 'points', 'mvp', 'timer', 'status', 'alerts', 'countdown', 'x2', 'podium'];
let lastSizesKey = null;

function applySizes(sizes) {
  const key = JSON.stringify(sizes || {});
  if (key === lastSizesKey) return; // no ha cambiado
  lastSizesKey = key;
  for (const name of SIZE_KEYS) {
    const percent = sizes && Number.isFinite(sizes[name]) ? sizes[name] : 100;
    stageEl.style.setProperty(`--s-${name}`, String(percent / 100));
  }
  needsFit = true; // al cambiar tamaños, hay que volver a comprobar si caben los países
}

// Las banderas y las alertas empiezan justo debajo del bloque de arriba (tiempo + mensaje),
// midan lo que midan (cambia con su tamaño y si el mensaje ocupa 1 o 2 líneas)
const topEl = el('top');
function placeContentBelowTop() {
  stageEl.style.setProperty('--content-top', `${Math.round(topEl.offsetTop + topEl.offsetHeight + 8)}px`);
  fitColumns();
}
new ResizeObserver(placeContentBelowTop).observe(topEl);

// Con muchos países (hasta 7 por lado) no caben a su tamaño normal: se mide cuánto ocupan
// y se reducen (--fit) solo lo necesario para que quepan todos. Usa zoom: se ven nítidos.
const MIN_FIT = 0.5;
let needsFit = true;

function fitColumns() {
  needsFit = false;
  stageEl.style.setProperty('--fit', '1');
  let fit = 1;
  for (const side of [sideLeftEl, sideRightEl]) {
    const count = side.children.length;
    if (count === 0) continue;
    const gaps = (count - 1) * (parseFloat(getComputedStyle(side).rowGap) || 0);
    const content = side.scrollHeight - gaps;
    const available = side.clientHeight - gaps;
    if (content > available) fit = Math.min(fit, available / content);
  }
  stageEl.style.setProperty('--fit', String(Math.max(MIN_FIT, Math.floor(fit * 100) / 100)));
}

// ---------- Dibujo general ----------

function render(state) {
  const previousStatus = lastStatus;
  lastState = state;
  lastStatus = state.gameStatus;

  applySizes(state.overlaySizes);
  // El streamer puede ocultar la barra de mensaje desde el dashboard (las banderas suben solas)
  stageEl.classList.toggle('hide-status', Boolean(state.overlayOptions && state.overlayOptions.showStatus === false));
  statusEl.textContent = STATUS_TEXT[state.gameStatus] || '';
  renderIntro(state);
  renderTimer(state);
  renderDouble(state);
  renderBoard(state);
  // Cambió el número de países, el tamaño de algo o el estado (en la espera hay textos de 2 líneas)
  if (needsFit || state.gameStatus !== previousStatus) fitColumns();
  renderResult(state);

  // Confeti solo en el momento en que termina la partida (no al abrir el overlay con una partida ya terminada)
  if (state.gameStatus === 'FINISHED' && previousStatus === 'RUNNING' && state.result && state.result.winners.length > 0) {
    launchConfetti(state.result.winners.map((country) => country.color));
  }
  // Partida nueva: se limpia el feed
  if (state.gameStatus !== 'FINISHED' && previousStatus === 'FINISHED') {
    feedEl.textContent = '';
  }
}

// ---------- Ajuste al tamaño de la fuente (TikTok LIVE Studio / OBS) ----------
// El escenario (9:16) se escala para ocupar la fuente entera. Con la fuente a 1080 x 1920
// (la pantalla completa de TikTok) cada elemento cae justo en su sitio.

function fitToScreen() {
  const scale = Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
  stageEl.style.setProperty('--scale', String(Math.max(scale, 0.1)));
}

window.addEventListener('resize', fitToScreen);
fitToScreen();

function showInvalidKey() {
  statusEl.textContent = '⚠️ URL del overlay no válida. Copia la URL desde tu dashboard.';
  timeEl.textContent = '--:--';
  // No se sigue mostrando la partida de nadie
  sideLeftEl.textContent = '';
  sideRightEl.textContent = '';
  teams.clear();
  layoutKey = null;
  feedEl.textContent = '';
  resultEl.classList.add('hidden');
  stageEl.classList.remove('is-finished');
}

if (!overlayKey) {
  showInvalidKey();
} else {
  // Se conecta al mismo servidor que sirvió esta página, enviando la clave
  const socket = io({ auth: { key: overlayKey } });

  for (const eventName of GAME_EVENTS) {
    socket.on(eventName, render);
  }
  socket.on('game:activity', handleActivity);

  // Clave incorrecta o cambiada desde el dashboard: el servidor cierra la conexión
  socket.on('overlay:invalid', showInvalidKey);

  socket.on('disconnect', (reason) => {
    // Si fue el servidor quien cerró (clave no válida), no se reintenta
    if (reason !== 'io server disconnect') {
      statusEl.textContent = 'Reconectando...';
    }
  });
}
