// Sin sesión no se puede usar el dashboard
const hasSession = Boolean(getToken());
if (!hasSession) {
  window.location.replace('/login/');
}

const GAME_STATUS_LABEL = {
  WAITING: { text: 'Esperando', className: '' },
  RUNNING: { text: 'En curso', className: 'live' },
  FINISHED: { text: 'Terminada', className: 'warn' },
};

const TIKTOK_STATUS_LABEL = {
  DISCONNECTED: { text: 'Desconectado', className: '' },
  CONNECTING: { text: 'Conectando...', className: 'warn' },
  CONNECTED: { text: 'Conectado', className: 'ok' },
  RECONNECTING: { text: 'Reconectando...', className: 'warn' },
};

const el = (id) => document.getElementById(id);
let currentGameStatus = null;
let toastTimer = null;

// ---------- Utilidades ----------

// 125 -> "02:05"
function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function setBadge(badgeEl, { text, className }) {
  badgeEl.textContent = text;
  badgeEl.className = `badge ${className}`.trim();
}

function showToast(message, isError = false) {
  const toast = el('toast');
  toast.textContent = message;
  toast.classList.toggle('is-error', isError);
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
}

function logout() {
  clearToken();
  window.location.href = '/login/';
}

// Llama a la API; si la sesión caducó vuelve al login, y si hay otro error lo muestra
async function call(method, path, body) {
  try {
    return await apiRequest(method, path, body);
  } catch (error) {
    if (error.status === 401) {
      logout();
    } else {
      showToast(error.message, true);
    }
    throw error;
  }
}

// ---------- Partida ----------

function formatResult(result) {
  if (!result) return '';
  if (result.winners.length === 0) return 'Sin ganador: nadie sumó puntos';
  const names = result.winners.map((country) => country.name).join(', ');
  return result.isTie ? `🤝 Empate: ${names}` : `🏆 Ganador: ${names}`;
}

function renderGame(state) {
  currentGameStatus = state.gameStatus;
  // Durante el conteo "1, 2, 3, ¡GO!" del overlay la partida aún no ha empezado
  const isIntro = state.introCountdownMs > 0;
  setBadge(el('game-status'), isIntro ? { text: '¡Empezando! 1, 2, 3…', className: 'live' } : GAME_STATUS_LABEL[state.gameStatus]);
  el('game-time').textContent = formatTime(state.remainingTime);
  el('stop-game').disabled = state.gameStatus !== 'RUNNING';
  el('new-game').disabled = isIntro;

  const resultText = formatResult(state.result);
  el('game-result').textContent = resultText;
  el('game-result').hidden = resultText === '';

  const sorted = [...state.countries].sort((a, b) => b.points - a.points);
  const maxPoints = sorted[0] ? sorted[0].points : 0;
  const list = el('scores');
  list.innerHTML = '';

  for (const country of sorted) {
    const item = document.createElement('li');
    item.className = 'score';
    item.style.setProperty('--color', country.color);

    // textContent (no innerHTML) para que ningún texto pueda inyectar HTML
    const name = document.createElement('span');
    name.className = 'score-name';
    if (country.flag) {
      const flag = document.createElement('img');
      flag.className = 'score-flag';
      flag.src = `/flags/4x3/${country.flag}.svg`;
      flag.alt = '';
      name.append(flag);
    }
    name.append(country.name);

    const points = document.createElement('span');
    points.className = 'score-points';
    points.textContent = country.points.toLocaleString('es');

    const bar = document.createElement('div');
    bar.className = 'score-bar';
    const fill = document.createElement('div');
    fill.style.width = maxPoints > 0 ? `${(country.points / maxPoints) * 100}%` : '0';
    bar.append(fill);

    item.append(name, points, bar);
    list.append(item);
  }
}

el('new-game').addEventListener('click', async () => {
  if (currentGameStatus === 'RUNNING' && !confirm('Hay una partida en curso. ¿Empezar una nueva? Se perderán los puntos actuales.')) {
    return;
  }
  await call('POST', '/api/game/new').catch(() => {});
});

el('stop-game').addEventListener('click', async () => {
  if (!confirm('¿Detener la partida ahora y mostrar el ganador?')) return;
  await call('POST', '/api/game/stop').catch(() => {});
});

// ---------- TikTok ----------

function renderTikTok(status) {
  const label = { ...TIKTOK_STATUS_LABEL[status.status] };
  // (El @usuario ya se ve junto a la foto de perfil)
  if (status.status === 'RECONNECTING') {
    label.text = `Reconectando... ${status.reconnectAttempt}/${status.maxReconnectAttempts}`;
  }
  setBadge(el('tiktok-status'), label);

  // Mientras reconecta también se muestra "Desconectar", para poder cancelarlo
  const isActive = status.status === 'CONNECTED' || status.status === 'RECONNECTING';
  el('tiktok-form').hidden = isActive;
  el('tiktok-disconnect').hidden = !isActive;
  el('tiktok-hint').hidden = isActive;
  el('tiktok-connect').disabled = status.status === 'CONNECTING';

  renderTikTokProfile(status, isActive);
}

// Foto de perfil, nombre y @usuario del LIVE conectado
function renderTikTokProfile(status, isActive) {
  const profileEl = el('tiktok-profile');
  profileEl.hidden = !isActive;
  if (!isActive) return;

  profileEl.classList.toggle('is-reconnecting', status.status === 'RECONNECTING');

  const profile = status.profile || {};
  const nickname = profile.nickname || status.username || '';
  el('tiktok-nickname').textContent = nickname;
  el('tiktok-handle').textContent = `@${status.username}`;
  el('tiktok-avatar-initial').textContent = nickname.charAt(0).toUpperCase();

  // La foto viene de los servidores de TikTok. Si no hay o no carga, se ve la inicial del nombre.
  const img = el('tiktok-avatar-img');
  const avatarUrl = profile.avatarUrl && profile.avatarUrl.startsWith('https://') ? profile.avatarUrl : null;
  if (!avatarUrl) {
    img.hidden = true;
    img.removeAttribute('src');
  } else if (img.getAttribute('src') !== avatarUrl) {
    img.hidden = true; // se muestra cuando termine de cargar
    img.src = avatarUrl;
  }
  el('tiktok-avatar-initial').hidden = !img.hidden;
}

el('tiktok-avatar-img').addEventListener('load', () => {
  el('tiktok-avatar-img').hidden = false;
  el('tiktok-avatar-initial').hidden = true;
});

el('tiktok-avatar-img').addEventListener('error', () => {
  el('tiktok-avatar-img').hidden = true;
  el('tiktok-avatar-initial').hidden = false;
});

el('tiktok-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = el('tiktok-username').value.trim();
  renderTikTok({ status: 'CONNECTING' });
  try {
    const status = await call('POST', '/api/tiktok/connect', { username });
    renderTikTok(status);
    showToast(`Conectado al LIVE de @${status.username}`);
  } catch (error) {
    renderTikTok({ status: 'DISCONNECTED' });
  }
});

let isManualDisconnect = false;

el('tiktok-disconnect').addEventListener('click', async () => {
  isManualDisconnect = true;
  const status = await call('POST', '/api/tiktok/disconnect').catch(() => null);
  if (status) renderTikTok(status);
  // El aviso por WebSocket puede llegar un poco después de la respuesta: esperamos antes de desactivar
  setTimeout(() => { isManualDisconnect = false; }, 3000);
});

// ---------- Overlay ----------

// La URL lleva la clave secreta del streamer (la da el servidor)
let overlayUrl = '';

// El servidor da la URL completa (https si hay dirección pública, que es lo que exige TikTok LIVE Studio)
function renderOverlayUrl({ url, path }) {
  overlayUrl = url || `${window.location.origin}${path}`;
  el('overlay-url').value = overlayUrl;
  el('open-overlay').href = overlayUrl;
}

async function loadOverlayUrl() {
  try {
    renderOverlayUrl(await call('GET', '/api/game/overlay'));
  } catch (error) {
    // call() ya mostró el error
  }
}

el('regenerate-overlay').addEventListener('click', async () => {
  if (!confirm('¿Generar una URL nueva? La URL actual dejará de funcionar y tendrás que pegar la nueva en TikTok LIVE Studio.')) {
    return;
  }
  try {
    renderOverlayUrl(await call('POST', '/api/game/overlay/regenerate'));
    showToast('URL nueva generada. Cópiala y pégala en TikTok LIVE Studio.');
  } catch (error) {
    // call() ya mostró el error
  }
});

el('copy-overlay').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(overlayUrl);
    showToast('URL copiada ✅');
  } catch (error) {
    el('overlay-url').select(); // si el navegador no deja copiar, al menos la dejamos seleccionada
    showToast('Selecciona la URL y cópiala con Ctrl + C', true);
  }
});

// ---------- Tamaños del overlay ----------
// Una barra para cada parte. Al moverla se guarda sola (tras una pausa corta) y el overlay cambia al instante.

const SIZE_MIN = 60;
const SIZE_MAX = 150;
const SIZE_STEP = 5;
const SIZE_SAVE_DELAY_MS = 300;
const SIZE_PARTS = [
  { key: 'flags', label: '🏳️ Banderas' },
  { key: 'points', label: '🔢 Puntos' },
  { key: 'mvp', label: '⭐ MVP (foto y nombre)' },
  { key: 'timer', label: '⏱ Tiempo' },
  { key: 'status', label: '💬 Mensaje y actividad' },
  { key: 'alerts', label: '🎁 Alertas de regalo y liderato' },
  { key: 'countdown', label: '🔟 Cuenta atrás final' },
  { key: 'x2', label: '⚡ Anuncio X2' },
  { key: 'podium', label: '🏆 Podio final' },
];

let overlaySizes = {};
let sizesSaveTimer = null;

function renderSizes(sizes) {
  overlaySizes = { ...sizes };
  const list = el('size-list');
  list.textContent = '';

  for (const { key, label } of SIZE_PARTS) {
    const row = document.createElement('div');
    row.className = 'size-row';

    const id = `size-${key}`;
    const name = document.createElement('label');
    name.htmlFor = id;
    name.textContent = label;

    const value = document.createElement('span');
    value.className = 'size-value';
    value.textContent = `${overlaySizes[key]} %`;

    const range = document.createElement('input');
    range.type = 'range';
    range.id = id;
    range.min = String(SIZE_MIN);
    range.max = String(SIZE_MAX);
    range.step = String(SIZE_STEP);
    range.value = String(overlaySizes[key]);
    range.addEventListener('input', () => {
      overlaySizes[key] = Number(range.value);
      value.textContent = `${range.value} %`;
      scheduleSizesSave();
    });

    row.append(name, value, range);
    list.append(row);
  }
}

function scheduleSizesSave() {
  setBadge(el('sizes-status'), { text: 'Guardando...', className: 'warn' });
  clearTimeout(sizesSaveTimer);
  sizesSaveTimer = setTimeout(saveSizes, SIZE_SAVE_DELAY_MS);
}

async function saveSizes() {
  try {
    overlaySizes = await call('PUT', '/api/game/overlay-sizes', overlaySizes);
    setBadge(el('sizes-status'), { text: 'Guardado ✓', className: 'ok' });
  } catch (error) {
    setBadge(el('sizes-status'), { text: 'Sin guardar', className: 'warn' });
  }
}

// Qué partes se muestran en el overlay: cada interruptor se guarda y se aplica al instante
const OVERLAY_OPTIONS = [
  { key: 'showStatus', inputId: 'show-status', on: 'Barra de mensaje visible en el overlay', off: 'Barra de mensaje oculta en el overlay' },
  { key: 'showGiftAlerts', inputId: 'show-gift-alerts', on: 'Alertas de regalo visibles en el overlay', off: 'Alertas de regalo ocultas en el overlay' },
];

function renderOverlayOptions(options) {
  for (const { key, inputId } of OVERLAY_OPTIONS) {
    el(inputId).checked = !options || options[key] !== false;
  }
}

for (const { inputId, on, off } of OVERLAY_OPTIONS) {
  el(inputId).addEventListener('change', async (event) => {
    const body = Object.fromEntries(OVERLAY_OPTIONS.map(({ key, inputId: id }) => [key, el(id).checked]));
    setBadge(el('sizes-status'), { text: 'Guardando...', className: 'warn' });
    try {
      renderOverlayOptions(await call('PUT', '/api/game/overlay-options', body));
      setBadge(el('sizes-status'), { text: 'Guardado ✓', className: 'ok' });
      showToast(event.target.checked ? on : off);
    } catch (error) {
      event.target.checked = !event.target.checked; // no se guardó: vuelve como estaba
      setBadge(el('sizes-status'), { text: 'Sin guardar', className: 'warn' });
    }
  });
}

el('reset-sizes').addEventListener('click', () => {
  renderSizes(Object.fromEntries(SIZE_PARTS.map(({ key }) => [key, 100])));
  scheduleSizesSave();
});

// ---------- Configuración (editor) ----------

const MIN_COUNTRIES = 2;
const MAX_COUNTRIES = 14;
const MAX_GIFTS = 30;
const NEW_COUNTRY_COLORS = ['#2f7df6', '#16a34a', '#e11d48', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#a855f7', '#eab308', '#0ea5e9', '#f43f5e'];

// Copia de trabajo: se edita aquí y solo se envía al servidor al pulsar "Guardar configuración"
let editorCountries = [];
let editorGifts = [];

function markUnsaved() {
  el('config-unsaved').hidden = false;
}

// Asegura que el valor actual aparezca en el desplegable aunque no sea una de las opciones
function selectValue(selectEl, value, label) {
  if (![...selectEl.options].some((option) => option.value === String(value))) {
    selectEl.add(new Option(label, value));
  }
  selectEl.value = String(value);
}

function createTextInput(value, placeholder, ariaLabel, onInput) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.placeholder = placeholder;
  input.maxLength = 30;
  input.setAttribute('aria-label', ariaLabel);
  input.addEventListener('input', () => {
    onInput(input.value);
    markUnsaved();
  });
  return input;
}

function createRemoveButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-ghost btn-icon';
  button.textContent = '✕';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', () => {
    onClick();
    markUnsaved();
  });
  return button;
}

// ---------- Banderas ----------

// Lista de banderas [{ code, name }] que da el servidor, y nombre normalizado -> código (para adivinar)
let flagList = [];
const flagCodeByName = new Map();

// "República Dominicana" -> "republica dominicana" (igual que normalizeText en el servidor)
function normalizeName(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function guessFlag(countryName) {
  return flagCodeByName.get(normalizeName(countryName || '')) || null;
}

async function loadFlags() {
  try {
    flagList = await apiRequest('GET', '/api/flags');
    for (const { code, name } of flagList) {
      flagCodeByName.set(normalizeName(name), code);
    }
    // Ahora que se pueden adivinar banderas, se sabe cuáles se eligieron a mano
    for (const country of editorCountries) {
      country.flagManual = Boolean(country.flag) && country.flag !== guessFlag(country.name);
    }
    renderCountriesEditor(); // ahora ya se pueden mostrar los desplegables de banderas
  } catch (error) {
    // sin lista de banderas el editor sigue funcionando (sin desplegable)
  }
}

function renderCountriesEditor() {
  const list = el('countries-editor');
  list.innerHTML = '';

  editorCountries.forEach((country, index) => {
    const row = document.createElement('li');
    row.className = 'editor-row country-row';

    const color = document.createElement('input');
    color.type = 'color';
    color.value = country.color;
    color.title = 'Color del país';
    color.setAttribute('aria-label', `Color del país ${index + 1}`);
    color.addEventListener('input', () => {
      country.color = color.value;
      markUnsaved();
    });

    const command = createTextInput(country.command, 'Comando (ej: Colombia)', `Comando del país ${index + 1}`,
      (value) => { country.command = value; });
    command.classList.add('country-command');

    // Mientras el comando sea igual al nombre, se escribe solo al escribir el nombre
    const name = createTextInput(country.name, 'Nombre (ej: Colombia)', `Nombre del país ${index + 1}`, (value) => {
      if (country.command === '' || country.command === country.name) {
        country.command = value;
        command.value = value;
      }
      country.name = value;
    });

    const remove = createRemoveButton(`Quitar ${country.name || 'país'}`, () => {
      editorCountries.splice(index, 1);
      renderCountriesEditor();
    });
    remove.disabled = editorCountries.length <= MIN_COUNTRIES;

    // ----- Bandera: vista previa + desplegable con todos los países -----
    const flagPreview = document.createElement('img');
    flagPreview.className = 'flag-preview';
    flagPreview.alt = '';

    const flagSelect = document.createElement('select');
    flagSelect.className = 'flag-select';
    flagSelect.setAttribute('aria-label', `Bandera del país ${index + 1}`);
    flagSelect.add(new Option('Sin bandera', ''));
    for (const { code, name: flagName } of flagList) {
      flagSelect.add(new Option(flagName, code));
    }

    const showFlag = () => {
      flagSelect.value = country.flag || '';
      flagPreview.hidden = !country.flag;
      if (country.flag) flagPreview.src = `/flags/4x3/${country.flag}.svg`;
    };
    showFlag();

    flagSelect.addEventListener('change', () => {
      country.flag = flagSelect.value || null;
      country.flagManual = true; // la eligió el streamer: ya no se cambia sola al escribir el nombre
      showFlag();
      markUnsaved();
    });

    // Al escribir el nombre, si la bandera no se eligió a mano, se adivina (ej. "México" -> México)
    name.addEventListener('input', () => {
      if (!country.flagManual) {
        country.flag = guessFlag(country.name);
        showFlag();
      }
    });

    row.append(color, name, command, remove, flagPreview, flagSelect);
    list.append(row);
  });

  el('add-country').disabled = editorCountries.length >= MAX_COUNTRIES;
}

el('add-country').addEventListener('click', () => {
  const usedColors = new Set(editorCountries.map((country) => country.color));
  const color = NEW_COUNTRY_COLORS.find((option) => !usedColors.has(option)) || NEW_COUNTRY_COLORS[0];
  editorCountries.push({ name: '', command: '', color });
  renderCountriesEditor();
  markUnsaved();
  el('countries-editor').lastElementChild.querySelector('input[type="text"]').focus();
});

function renderGiftsEditor() {
  const list = el('gifts-editor');
  list.innerHTML = '';

  editorGifts.forEach((gift, index) => {
    const catalogGift = catalogById.get(gift.giftId);
    const row = document.createElement('li');
    row.className = 'editor-row gift-row';

    const image = createGiftImage(catalogGift && catalogGift.imageUrl, gift.name, 'gift-image');

    const name = document.createElement('span');
    name.className = 'gift-name';
    name.textContent = gift.name;
    name.title = `${gift.name} — id ${gift.giftId}`;

    const points = document.createElement('input');
    points.type = 'number';
    points.min = '1';
    points.max = '100000';
    points.step = '1';
    points.value = String(gift.points);
    points.title = 'Puntos que da este regalo';
    points.setAttribute('aria-label', `Puntos de ${gift.name}`);
    points.addEventListener('input', () => {
      gift.points = Number(points.value);
      markUnsaved();
    });

    const remove = createRemoveButton(`Quitar ${gift.name}`, () => {
      editorGifts.splice(index, 1);
      renderGiftsEditor();
    });

    row.append(image, name, points, remove);
    list.append(row);
  });

  el('gifts-empty').hidden = editorGifts.length > 0;
  refreshCatalogMarks();
}

function renderConfig(config) {
  selectValue(el('duration'), config.durationSeconds, `${config.durationSeconds} segundos`);
  selectValue(el('auto-restart'), config.autoRestartSeconds, `Después de ${config.autoRestartSeconds} segundos`);
  editorCountries = config.countries.map(({ name, command, color, flag }) => ({
    name,
    command,
    color,
    flag: flag || null,
    // Si la bandera no es la que corresponde al nombre, es que la eligió el streamer a mano
    flagManual: Boolean(flag) && flag !== guessFlag(name),
  }));
  editorGifts = config.gifts.map(({ giftId, name, points }) => ({ giftId, name, points }));
  renderCountriesEditor();
  renderGiftsEditor();
  el('config-unsaved').hidden = true;
}

el('duration').addEventListener('change', markUnsaved);
el('auto-restart').addEventListener('change', markUnsaved);

el('config-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const config = await call('PUT', '/api/game/config', {
      durationSeconds: Number(el('duration').value),
      autoRestartSeconds: Number(el('auto-restart').value),
      countries: editorCountries.map(({ name, command, color, flag }) => ({ name, command, color, flag })),
      gifts: editorGifts,
    });
    renderConfig(config);
    showToast('Configuración guardada ✅');
  } catch (error) {
    // call() ya mostró el mensaje del servidor (ej. "Hay dos países con el comando...")
  }
});

// ---------- Catálogo de regalos de TikTok ----------

let catalogGifts = [];
const catalogById = new Map();
const catalogTiles = new Map(); // giftId -> { tile, button } de las tarjetas dibujadas

// Imagen de un regalo. Se carga desde los servidores de TikTok solo cuando se ve en pantalla (lazy).
function createGiftImage(imageUrl, name, className) {
  const img = document.createElement('img');
  img.className = className || '';
  img.alt = name;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  if (imageUrl && imageUrl.startsWith('https://')) {
    img.src = imageUrl;
  }
  return img;
}

function isGiftInEditor(giftId) {
  return editorGifts.some((gift) => gift.giftId === giftId);
}

// Marca con ✓ los regalos del catálogo que ya suman puntos
function refreshCatalogMarks() {
  for (const [giftId, { tile, button }] of catalogTiles) {
    const isAdded = isGiftInEditor(giftId);
    tile.classList.toggle('is-added', isAdded);
    button.textContent = isAdded ? '✓' : '+';
    button.title = isAdded ? 'Quitar de mi juego' : 'Agregar a mi juego';
  }
}

function toggleGiftFromCatalog(gift) {
  if (isGiftInEditor(gift.giftId)) {
    editorGifts = editorGifts.filter((item) => item.giftId !== gift.giftId);
  } else {
    if (editorGifts.length >= MAX_GIFTS) {
      showToast(`Puedes configurar como máximo ${MAX_GIFTS} regalos.`, true);
      return;
    }
    // Puntos sugeridos: 10 por cada moneda que cuesta (mínimo 10). El streamer puede cambiarlos.
    editorGifts.push({ giftId: gift.giftId, name: gift.name, points: Math.max(10, gift.diamondCount * 10) });
    showToast(`${gift.name} agregado. Revisa sus puntos y pulsa "Guardar configuración".`);
  }
  renderGiftsEditor();
  markUnsaved();
}

function renderCatalog() {
  const search = el('catalog-search').value.trim().toLowerCase();
  const visible = catalogGifts.filter((gift) => search === ''
    || gift.name.toLowerCase().includes(search)
    || String(gift.giftId).includes(search));

  const grid = el('catalog-grid');
  grid.innerHTML = '';
  catalogTiles.clear();

  for (const gift of visible) {
    const tile = document.createElement('li');
    tile.className = 'gift-tile';
    tile.title = `${gift.name} — id ${gift.giftId}`;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn gift-add';
    button.setAttribute('aria-label', `Agregar o quitar ${gift.name}`);
    button.addEventListener('click', () => toggleGiftFromCatalog(gift));

    const name = document.createElement('span');
    name.className = 'gift-tile-name';
    name.textContent = gift.name;

    const price = document.createElement('span');
    price.className = 'gift-tile-meta';
    price.textContent = `🪙 ${gift.diamondCount.toLocaleString('es')}`;

    const id = document.createElement('span');
    id.className = 'gift-tile-meta';
    id.textContent = `id ${gift.giftId}`;

    tile.append(button, createGiftImage(gift.imageUrl, gift.name), name, price, id);
    grid.append(tile);
    catalogTiles.set(gift.giftId, { tile, button });
  }

  el('catalog-empty').hidden = visible.length > 0;
  refreshCatalogMarks();
}

async function loadGiftCatalog() {
  try {
    // apiRequest (y no call) para que un fallo de TikTok no muestre un aviso rojo: solo se indica en la tarjeta
    const { gifts } = await apiRequest('GET', '/api/tiktok/gifts');
    catalogGifts = gifts;
    for (const gift of gifts) {
      catalogById.set(gift.giftId, gift);
    }
    el('catalog-count').textContent = `${gifts.length} regalos`;
    renderGiftsEditor(); // ahora ya hay imágenes para los regalos configurados
    if (el('catalog').open) renderCatalog();
  } catch (error) {
    el('catalog-count').textContent = 'No disponible';
  }
}

// La cuadrícula (casi 700 regalos) solo se dibuja cuando el streamer la abre
el('catalog').addEventListener('toggle', () => {
  const isOpen = el('catalog').open;
  el('catalog').querySelector('summary').textContent = isOpen ? 'Ocultar regalos' : 'Ver todos los regalos';
  if (isOpen) renderCatalog();
});
el('catalog-search').addEventListener('input', renderCatalog);

// ---------- Historial ----------

// 95 -> "1 min 35 s"
function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} min ${seconds} s` : `${seconds} s`;
}

function renderHistory(sessions) {
  const list = el('history-list');
  list.innerHTML = '';
  el('history-empty').hidden = sessions.length > 0;

  for (const session of sessions) {
    const item = document.createElement('li');
    item.className = 'history-item';

    const top = document.createElement('div');
    top.className = 'history-top';
    const title = document.createElement('span');
    if (session.winners.length === 0) {
      title.textContent = 'Sin ganador';
    } else if (session.isTie) {
      title.textContent = `🤝 Empate: ${session.winners.join(', ')}`;
    } else {
      title.textContent = `🏆 ${session.winners[0]}`;
    }
    const date = document.createElement('span');
    date.className = 'history-meta';
    date.textContent = new Date(session.endedAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });

    // Botón para borrar esta partida del historial
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-ghost btn-icon history-delete';
    remove.textContent = '✕';
    remove.title = 'Eliminar esta partida del historial';
    remove.setAttribute('aria-label', 'Eliminar esta partida del historial');
    remove.addEventListener('click', () => deleteHistoryItem(session.id, remove));

    const right = document.createElement('span');
    right.className = 'history-actions';
    right.append(date, remove);
    top.append(title, right);

    const scores = document.createElement('div');
    scores.className = 'history-scores';
    session.results.forEach((result, index) => {
      if (index > 0) scores.append(' · ');
      const dot = document.createElement('span');
      dot.className = 'color-dot';
      dot.style.setProperty('--color', result.color);
      scores.append(dot, `${result.name} ${result.points.toLocaleString('es')}`);
    });

    const meta = document.createElement('div');
    meta.className = 'history-meta';
    const endedBy = session.endedBy === 'MANUAL' ? 'detenida' : 'tiempo completo';
    meta.textContent = `${formatDuration(session.playedSeconds)} (${endedBy}) · ${session.participants} espectadores`;

    item.append(top, scores, meta);
    list.append(item);
  }
}

// Aviso global que publica el administrador (ej. "Mantenimiento el domingo")
async function loadAnnouncement() {
  try {
    const { announcement } = await apiRequest('GET', '/api/settings/public');
    el('announcement').textContent = announcement;
    el('announcement').hidden = !announcement;
  } catch (error) {
    // Si falla, simplemente no se muestra ningún aviso
  }
}

async function loadHistory() {
  try {
    renderHistory(await call('GET', '/api/game/history?limit=5'));
  } catch (error) {
    // call() ya mostró el error
  }
}

async function deleteHistoryItem(sessionId, button) {
  if (!confirm('¿Eliminar esta partida del historial? No se puede deshacer.')) {
    return;
  }
  button.disabled = true;
  try {
    await call('DELETE', `/api/game/history/${encodeURIComponent(sessionId)}`);
    showToast('Partida eliminada del historial');
    loadHistory(); // recarga la lista (si hay más partidas guardadas, aparece la siguiente)
  } catch (error) {
    button.disabled = false; // call() ya mostró el error
  }
}

el('logout').addEventListener('click', logout);

// ---------- Inicio ----------

async function init() {
  try {
    const [{ user }, config, tiktokStatus] = await Promise.all([
      call('GET', '/api/auth/me'),
      call('GET', '/api/game/config'),
      call('GET', '/api/tiktok/status'),
    ]);
    el('user-name').textContent = user.name;
    el('admin-link').hidden = user.role !== 'ADMIN';
    renderConfig(config);
    renderSizes(config.overlaySizes);
    renderOverlayOptions(config.overlayOptions);
    renderTikTok(tiktokStatus);
  } catch (error) {
    return; // call() ya redirigió al login o mostró el error
  }

  // Sin await: el resto del dashboard no espera a TikTok ni al historial
  loadOverlayUrl();
  loadAnnouncement();
  loadFlags();
  loadGiftCatalog();
  loadHistory();

  // Tiempo real: el marcador, el historial y el estado de TikTok se actualizan solos.
  // El token dice al servidor de qué sala (de qué streamer) enviarnos los eventos.
  const socket = io({ auth: { token: getToken() } });
  socket.on('auth:error', logout);
  for (const eventName of ['game:state', 'game:countdown', 'game:start', 'game:update', 'game:score', 'game:end', 'game:reset']) {
    socket.on(eventName, renderGame);
  }
  socket.on('game:saved', loadHistory);
  let wasReconnecting = false;
  socket.on('tiktok:connected', (status) => {
    renderTikTok(status);
    if (wasReconnecting) {
      showToast('Conexión con TikTok recuperada ✅');
    }
    wasReconnecting = false;
  });
  socket.on('tiktok:reconnecting', (status) => {
    renderTikTok(status);
    if (!wasReconnecting) {
      showToast('Se cortó la conexión con el LIVE. Reconectando automáticamente...', true);
    }
    wasReconnecting = true;
  });
  socket.on('tiktok:disconnected', (status) => {
    renderTikTok(status);
    wasReconnecting = false;
    // Aviso solo si se cortó solo (fin del LIVE, caída...), no si lo desconectó el streamer
    if (status.reason === 'RECONNECT_FAILED') {
      showToast('No se pudo reconectar con TikTok. ¿Terminó el LIVE? Vuelve a pulsar Conectar.', true);
    } else if (!isManualDisconnect) {
      showToast('Se desconectó el LIVE de TikTok', true);
    }
  });
}

if (hasSession) {
  init();
}

