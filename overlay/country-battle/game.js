// La URL del overlay lleva la clave secreta del streamer: /overlay/country-battle/?key=...
// Con ella el servidor sabe de qué sala (qué streamer) mostrar la partida.
const overlayKey = new URLSearchParams(window.location.search).get('key');

const GAME_EVENTS = ['game:state', 'game:start', 'game:update', 'game:score', 'game:end', 'game:reset'];
const ROW_HEIGHT = 86;          // alto de cada tarjeta: debe coincidir con --row-height en style.css
const TILE_GAP = 10;            // espacio entre tarjetas: debe coincidir con --tile-gap en style.css
const COLUMNS = 2;              // los países van en 2 columnas (8 países = 4 filas)
const URGENT_SECONDS = 10;      // desde aquí el temporizador se pone rojo y aparece la cuenta atrás grande
const MIN_BAR_PERCENT = 3;      // para que una barra con pocos puntos se vea igualmente
const FEED_MAX_ITEMS = 1;       // la actividad se ve de una en una, dentro de la cápsula de estado
const FEED_ITEM_MS = 3000;      // cuánto se ve cada actividad (si llega otra antes, la reemplaza)
const GIFT_ALERT_MS = 2800;     // cuánto dura cada alerta de regalo
const GIFT_ALERT_QUEUE_MAX = 5; // alertas en espera como máximo (si llegan más, se descartan las más viejas)
const FLOAT_GROUP_MS = 250;     // los "+N" de un país se agrupan en este tiempo (para no saturar la pantalla)
const CONFETTI_MS = 4500;

const STATUS_TEXT = {
  WAITING: '⏳ ¡Elige tu país! Escribe su nombre en el chat',
  RUNNING: '💬 Escribe el nombre de tu país en el chat',
  FINISHED: '🏁 ¡Batalla terminada!',
};

const el = (id) => document.getElementById(id);
const panelEl = el('panel');
const timerEl = el('timer');
const timeEl = el('time');
const statusEl = el('status');
const boardEl = el('board');
const feedEl = el('feed');
const giftStripEl = el('gift-strip');
const countdownEl = el('countdown');
const leaderBannerEl = el('leader-banner');
const resultEl = el('result');

// Filas ya creadas, por id de país. Se crean una vez y luego solo se actualizan.
const rows = new Map();
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
  // Sin bandera: círculo del color del país con su inicial
  const fallback = document.createElement('span');
  fallback.className = `${className} row-flag-fallback`;
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

// ---------- Marcador ----------

function createRow(country) {
  const rowEl = document.createElement('li');
  rowEl.className = 'row';

  const top = document.createElement('div');
  top.className = 'row-top';

  const flagSlot = document.createElement('span'); // la bandera se pone en renderBoard (puede cambiar)

  const text = document.createElement('div');
  text.className = 'row-text';
  // textContent (no innerHTML) para que ningún texto pueda inyectar HTML en la página
  const nameEl = document.createElement('span');
  nameEl.className = 'row-name';
  const subEl = document.createElement('span');
  subEl.className = 'row-sub';
  text.append(nameEl, subEl);

  const pointsEl = document.createElement('span');
  pointsEl.className = 'row-points';

  const bar = document.createElement('div');
  bar.className = 'bar';
  const fillEl = document.createElement('div');
  fillEl.className = 'bar-fill';
  bar.append(fillEl);

  // Arriba: bandera + nombre (y debajo qué escribir o el MVP). Abajo: barra + puntos
  const bottom = document.createElement('div');
  bottom.className = 'row-bottom';
  bottom.append(bar, pointsEl);

  top.append(flagSlot, text);
  rowEl.append(top, bottom);
  boardEl.append(rowEl);

  const row = { el: rowEl, flagSlot, flagKey: null, nameEl, subEl, pointsEl, fillEl, lastPoints: country.points, pendingFloat: 0, floatTimer: null };
  rows.set(country.id, row);
  return row;
}

// "+50" flotando junto a los puntos (se agrupan los que llegan casi a la vez)
function queueFloatPoints(row, amount) {
  row.pendingFloat += amount;
  if (row.floatTimer) return;
  row.floatTimer = setTimeout(() => {
    const float = document.createElement('span');
    float.className = 'float-points';
    float.textContent = `+${formatPoints(row.pendingFloat)}`;
    row.pointsEl.append(float);
    float.addEventListener('animationend', () => float.remove());
    row.pendingFloat = 0;
    row.floatTimer = null;
  }, FLOAT_GROUP_MS);
}

// Textos largos (ej. "República Dominicana"): la letra se reduce solo lo necesario para que quepan
// enteros. Se recalcula únicamente si cambia el texto o la corona del líder.
const NAME_MAX_FONT = 21;
const NAME_MIN_FONT = 11;
const SUB_MAX_FONT = 14;
const SUB_MIN_FONT = 10;

function fitText(element, maxFont, minFont) {
  let size = maxFont;
  element.style.fontSize = `${size}px`;
  while (element.scrollWidth > element.clientWidth && size > minFont) {
    size -= 1;
    element.style.fontSize = `${size}px`;
  }
}

function fitName(row) {
  const key = `${row.nameEl.textContent}|${row.el.classList.contains('leader')}|${row.subEl.textContent}`;
  if (row.fitKey === key) return;
  row.fitKey = key;

  fitText(row.nameEl, NAME_MAX_FONT, NAME_MIN_FONT);
  // "Escribe: ..." también se ajusta (el MVP ya recorta su nombre con "...")
  if (row.subEl.querySelector('.mvp')) {
    row.subEl.style.fontSize = '';
  } else {
    fitText(row.subEl, SUB_MAX_FONT, SUB_MIN_FONT);
  }
}

// Cuando termina de cargar la fuente Rubik los textos cambian de ancho: se vuelven a ajustar
document.fonts.ready.then(() => {
  for (const row of rows.values()) {
    row.fitKey = null;
    if (row.pointsText) fitName(row);
  }
});

function renderRowSub(row, country, status) {
  row.subEl.textContent = '';
  if (status !== 'WAITING' && country.mvp) {
    const mvp = document.createElement('span');
    mvp.className = 'mvp';
    const text = document.createElement('span');
    text.className = 'mvp-text';
    text.textContent = `⭐ MVP: ${country.mvp.username} · ${formatPoints(country.mvp.points)}`;
    mvp.append(createAvatar(country.mvp.username, country.mvp.avatarUrl, 'mvp-avatar'), text);
    row.subEl.append(mvp);
  } else if (country.command) {
    row.subEl.textContent = `Escribe: ${country.command.toUpperCase()}`;
  }
}

function renderBoard(state) {
  const countries = state.countries;
  // El que más puntos tiene va arriba; la barra más larga es la del líder
  const sorted = [...countries].sort((a, b) => b.points - a.points);
  const maxPoints = sorted.length > 0 ? sorted[0].points : 0;

  const rowCount = Math.ceil(sorted.length / COLUMNS);
  boardEl.style.height = `${Math.max(0, rowCount * (ROW_HEIGHT + TILE_GAP) - TILE_GAP)}px`;

  // Si el streamer quitó países en la configuración, se borran sus filas
  const currentIds = new Set(countries.map((country) => country.id));
  for (const [id, row] of rows) {
    if (!currentIds.has(id)) {
      row.el.remove();
      rows.delete(id);
    }
  }

  sorted.forEach((country, index) => {
    const row = rows.get(country.id) || createRow(country);

    // Nombre, color y bandera pueden cambiar desde la configuración del dashboard
    row.el.style.setProperty('--color', country.color);
    row.nameEl.textContent = country.name;
    const flagKey = `${country.flag}|${country.color}|${country.name}`;
    if (row.flagKey !== flagKey) {
      const flag = createFlag(country, 'row-flag');
      row.flagSlot.replaceWith(flag);
      row.flagSlot = flag;
      row.flagKey = flagKey;
    }
    renderRowSub(row, country, state.gameStatus);

    // Puesto 1 arriba a la izquierda, 2 arriba a la derecha, 3 debajo del 1...
    const column = index % COLUMNS;
    const line = Math.floor(index / COLUMNS);
    const x = column === 0 ? '0px' : `calc(100% + ${TILE_GAP}px)`;
    row.el.style.transform = `translate(${x}, ${line * (ROW_HEIGHT + TILE_GAP)}px)`;
    row.el.classList.toggle('leader', index === 0 && country.points > 0);
    // El número es el primer "nodo de texto" de pointsEl (detrás pueden ir los "+N" flotantes)
    if (!row.pointsText) {
      row.pointsText = document.createTextNode('');
      row.pointsEl.prepend(row.pointsText);
    }
    row.pointsText.nodeValue = formatPoints(country.points);
    fitName(row);

    const percent = maxPoints > 0 ? (country.points / maxPoints) * 100 : 0;
    row.fillEl.style.width = country.points > 0 ? `${Math.max(percent, MIN_BAR_PERCENT)}%` : '0';

    const gained = country.points - row.lastPoints;
    if (gained > 0) {
      restartAnimation(row.pointsEl, 'bump');
      queueFloatPoints(row, gained);
    }
    row.lastPoints = country.points;
  });

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

// ---------- Regalos que suman puntos ----------

let lastGiftsKey = null;

function renderGiftStrip(state) {
  const gifts = (state.gifts || []).slice(0, 5);
  const key = JSON.stringify(gifts);
  if (key === lastGiftsKey) return; // no ha cambiado: no se redibuja (evita parpadeos)
  lastGiftsKey = key;

  giftStripEl.textContent = '';
  giftStripEl.hidden = gifts.length === 0;
  if (gifts.length === 0) return;

  const label = document.createElement('span');
  label.className = 'gift-strip-label';
  label.textContent = '🎁';
  giftStripEl.append(label);

  for (const gift of gifts) {
    const chip = document.createElement('span');
    chip.className = 'gift-chip';
    chip.title = gift.name;
    if (gift.imageUrl && gift.imageUrl.startsWith('https://')) {
      const img = document.createElement('img');
      img.src = gift.imageUrl;
      img.alt = gift.name;
      img.referrerPolicy = 'no-referrer';
      chip.append(img);
    } else {
      chip.append(document.createTextNode(`${gift.name} `));
    }
    chip.append(document.createTextNode(`+${formatPoints(gift.points)}`));
    giftStripEl.append(chip);
  }
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
  // Texto corto: cabe en la cápsula de estado (el detalle del regalo sale en la alerta grande)
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

// ---------- Alerta grande de regalo ----------

const giftAlertQueue = [];
let isShowingGiftAlert = false;

function queueGiftAlert(activity) {
  giftAlertQueue.push(activity);
  while (giftAlertQueue.length > GIFT_ALERT_QUEUE_MAX) {
    giftAlertQueue.shift();
  }
  if (!isShowingGiftAlert) showNextGiftAlert();
}

function showNextGiftAlert() {
  const activity = giftAlertQueue.shift();
  const alertEl = el('gift-alert');
  if (!activity) {
    isShowingGiftAlert = false;
    alertEl.hidden = true;
    return;
  }
  isShowingGiftAlert = true;

  const country = findCountry(activity.countryId);
  const image = el('gift-alert-image');
  if (activity.giftImage && activity.giftImage.startsWith('https://')) {
    image.src = activity.giftImage;
    image.hidden = false;
  } else {
    image.hidden = true;
  }
  el('gift-alert-user').textContent = activity.username;
  el('gift-alert-gift').textContent = `envió ${activity.count > 1 ? `${activity.count}× ` : ''}${activity.giftName}`;
  el('gift-alert-points').textContent = `+${formatPoints(activity.points)} a ${country ? country.name.toUpperCase() : ''}`;
  alertEl.style.setProperty('--color', country ? country.color : '#fbbf24');

  alertEl.classList.remove('is-leaving');
  alertEl.hidden = false;
  restartAnimation(alertEl, 'gift-alert');

  setTimeout(() => {
    alertEl.classList.add('is-leaving');
    setTimeout(showNextGiftAlert, 350);
  }, GIFT_ALERT_MS);
}

function handleActivity(activity) {
  addFeedItem(activity);
  if (activity.type === 'GIFT') {
    queueGiftAlert(activity);
  }
}

// ---------- Resultado, podio y confeti ----------

const MEDALS = ['🥇', '🥈', '🥉'];

function renderResult(state) {
  const result = state.result;
  if (state.gameStatus !== 'FINISHED' || !result) {
    resultEl.classList.add('hidden');
    return;
  }

  const winners = result.winners;
  const flagsEl = el('result-flags');
  flagsEl.textContent = '';
  flagsEl.classList.toggle('is-tie', winners.length > 1);
  const card = el('result-card');

  if (winners.length === 0) {
    const trophy = document.createElement('span');
    trophy.className = 'trophy';
    trophy.textContent = '🏆';
    flagsEl.append(trophy);
    el('result-label').textContent = 'Sin ganador';
    el('result-names').textContent = 'Nadie sumó puntos';
    el('result-points').textContent = '';
    card.style.removeProperty('--color');
  } else {
    for (const winner of winners) {
      flagsEl.append(createFlag(winner, 'result-flag'));
    }
    el('result-label').textContent = result.isTie ? '¡Empate!' : '🏆 Ganador';
    el('result-names').textContent = winners.map((country) => country.name).join(' · ');
    el('result-points').textContent = result.isTie
      ? `${formatPoints(winners[0].points)} puntos cada uno`
      : `${formatPoints(winners[0].points)} puntos`;
    if (result.isTie) {
      card.style.removeProperty('--color');
    } else {
      card.style.setProperty('--color', winners[0].color);
    }
  }

  // Podio: los espectadores que más puntos aportaron
  const podium = el('podium');
  podium.textContent = '';
  (result.topSupporters || []).forEach((supporter, index) => {
    const li = document.createElement('li');
    const medal = document.createElement('span');
    medal.className = 'medal';
    medal.textContent = MEDALS[index] || '•';
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = supporter.username;
    const pts = document.createElement('span');
    pts.className = 'pts';
    pts.textContent = formatPoints(supporter.points);
    li.append(medal, createAvatar(supporter.username, supporter.avatarUrl, 'podium-avatar'), createFlag({ name: supporter.countryName, flag: supporter.flag, color: supporter.color }, 'podium-flag'), who, pts);
    podium.append(li);
  });

  resultEl.classList.remove('hidden');
}

// Confeti con los colores del ganador (canvas, sin librerías)
function launchConfetti(colors) {
  const canvas = el('confetti');
  const ctx = canvas.getContext('2d');
  const ratio = 2; // dibuja a doble resolución para que se vea nítido al escalar
  canvas.width = panelEl.offsetWidth * ratio;
  canvas.height = panelEl.offsetHeight * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const width = panelEl.offsetWidth;
  const height = panelEl.offsetHeight;
  const palette = [...colors, '#fbbf24', '#ffffff'];
  const pieces = Array.from({ length: 160 }, () => ({
    x: Math.random() * width,
    y: -20 - Math.random() * height * 0.5,
    size: 6 + Math.random() * 8,
    speedY: 2 + Math.random() * 3,
    speedX: -1.5 + Math.random() * 3,
    angle: Math.random() * Math.PI,
    spin: -0.2 + Math.random() * 0.4,
    color: palette[Math.floor(Math.random() * palette.length)],
  }));

  const start = performance.now();
  function frame(now) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, width, height);
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
      ctx.clearRect(0, 0, width, height);
    }
  }
  requestAnimationFrame(frame);
}

// ---------- Dibujo general ----------

function render(state) {
  const previousStatus = lastStatus;
  lastState = state;
  lastStatus = state.gameStatus;

  statusEl.textContent = STATUS_TEXT[state.gameStatus] || '';
  renderTimer(state);
  renderBoard(state);
  renderGiftStrip(state);
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
// El panel se escala para caber entero en la ventana, sea del tamaño que sea.
// Así el streamer solo tiene que arrastrar las esquinas de la fuente para agrandarlo o achicarlo.
const FIT_MARGIN = 12; // espacio libre alrededor del panel (para que no se corte la sombra)

function fitToScreen() {
  // offsetWidth/Height miden el panel SIN la escala aplicada
  const width = panelEl.offsetWidth;
  const height = panelEl.offsetHeight;
  if (width === 0 || height === 0) return;

  const scale = Math.min(
    (window.innerWidth - FIT_MARGIN * 2) / width,
    (window.innerHeight - FIT_MARGIN * 2) / height,
  );
  panelEl.style.setProperty('--fit-margin', `${FIT_MARGIN}px`);
  panelEl.style.setProperty('--scale', String(Math.max(scale, 0.1)));
}

window.addEventListener('resize', fitToScreen);
// El panel cambia de alto cuando cambia el número de países o aparece el resultado
new ResizeObserver(fitToScreen).observe(panelEl);
fitToScreen();

function showInvalidKey() {
  statusEl.textContent = '⚠️ URL del overlay no válida. Copia la URL desde tu dashboard.';
  timeEl.textContent = '--:--';
  // No se sigue mostrando la partida de nadie
  boardEl.innerHTML = '';
  boardEl.style.height = '0';
  rows.clear();
  feedEl.textContent = '';
  giftStripEl.hidden = true;
  resultEl.classList.add('hidden');
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
