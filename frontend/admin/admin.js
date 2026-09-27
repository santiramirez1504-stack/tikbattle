// Panel de administrador: solo para cuentas con rol ADMIN (el servidor lo comprueba en cada petición)
const hasSession = Boolean(getToken());
if (!hasSession) {
  window.location.replace('/login/');
}

const REFRESH_MS = 5000; // estadísticas y salas en vivo se actualizan cada 5 s
const el = (id) => document.getElementById(id);
let currentAdminId = null;
let usersPage = 1;
let usersSearch = '';
let toastTimer = null;

// ---------- Utilidades ----------

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

// Llama a la API: si la sesión caducó -> login; si no es admin -> dashboard; otros errores -> aviso
async function call(method, path, body) {
  try {
    return await apiRequest(method, path, body);
  } catch (error) {
    if (error.status === 401) {
      logout();
    } else if (error.status === 403) {
      window.location.replace('/dashboard/');
    } else {
      showToast(error.message, true);
    }
    throw error;
  }
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

// 95 -> "1:35"
function formatClock(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

// Hace hace cuánto: "hace 3 min"
function formatAgo(timestamp) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `hace ${seconds} s`;
  return `hace ${Math.round(seconds / 60)} min`;
}

// Crea una fila de tabla con celdas de texto (textContent: ningún dato puede inyectar HTML)
function createRow(cells) {
  const tr = document.createElement('tr');
  for (const cell of cells) {
    const td = document.createElement('td');
    if (cell instanceof Node) {
      td.append(cell);
    } else {
      td.textContent = cell;
    }
    tr.append(td);
  }
  return tr;
}

function createBadge(text, className) {
  const span = document.createElement('span');
  span.className = `badge ${className || ''}`.trim();
  span.textContent = text;
  return span;
}

// ---------- Estadísticas ----------

const STATS = [
  { key: 'totalUsers', label: 'Streamers registrados' },
  { key: 'newUsers7d', label: 'Nuevos (últimos 7 días)' },
  { key: 'totalGames', label: 'Partidas jugadas' },
  { key: 'gamesToday', label: 'Partidas hoy' },
  { key: 'participants7d', label: 'Espectadores participando (7 días)' },
  { key: 'activeRooms', label: 'Salas activas ahora', live: true },
  { key: 'runningGames', label: 'Partidas en curso ahora', live: true },
  { key: 'tiktokConnected', label: 'TikTok conectados ahora', live: true },
  { key: 'connectedClients', label: 'Dashboards y overlays abiertos', live: true },
  { key: 'blockedUsers', label: 'Cuentas bloqueadas' },
  { key: 'admins', label: 'Administradores' },
];

async function loadStats() {
  const stats = await call('GET', '/api/admin/stats').catch(() => null);
  if (!stats) return;

  const container = el('stats');
  container.innerHTML = '';
  for (const { key, label, live } of STATS) {
    const card = document.createElement('div');
    card.className = live ? 'stat live' : 'stat';
    const value = document.createElement('span');
    value.className = 'stat-value';
    value.textContent = (stats[key] || 0).toLocaleString('es');
    const text = document.createElement('span');
    text.className = 'stat-label';
    text.textContent = label;
    card.append(value, text);
    container.append(card);
  }
  el('updated-at').textContent = `Actualizado ${new Date().toLocaleTimeString('es')}`;
}

// ---------- Salas en vivo ----------

const GAME_LABEL = { WAITING: 'Esperando', RUNNING: 'En curso', FINISHED: 'Terminada' };
const TIKTOK_LABEL = { DISCONNECTED: 'No', CONNECTING: 'Conectando', CONNECTED: 'Sí', RECONNECTING: 'Reconectando' };

async function loadRooms() {
  const rooms = await call('GET', '/api/admin/rooms').catch(() => null);
  if (!rooms) return;

  el('rooms-count').textContent = rooms.length;
  el('rooms-empty').hidden = rooms.length > 0;
  const body = el('rooms-body');
  body.innerHTML = '';

  for (const room of rooms) {
    const isRunning = room.gameStatus === 'RUNNING';
    const tiktok = room.tiktokUsername
      ? `${TIKTOK_LABEL[room.tiktokStatus]} (@${room.tiktokUsername})`
      : TIKTOK_LABEL[room.tiktokStatus];
    body.append(createRow([
      room.name,
      createBadge(GAME_LABEL[room.gameStatus], isRunning ? 'live' : ''),
      isRunning ? formatClock(room.remainingTime) : '—',
      createBadge(tiktok, room.tiktokStatus === 'CONNECTED' ? 'ok' : ''),
      String(room.clients),
      formatAgo(room.lastActivityAt),
    ]));
  }
}

// ---------- Usuarios ----------

async function updateUser(user, changes, confirmText) {
  if (!confirm(confirmText)) return;
  try {
    await call('PATCH', `/api/admin/users/${encodeURIComponent(user.id)}`, changes);
    showToast('Usuario actualizado ✅');
    loadUsers();
    loadStats();
  } catch (error) {
    // call() ya mostró el error
  }
}

function createActionButton(text, onClick, disabled) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-ghost';
  button.textContent = text;
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

async function loadUsers() {
  const query = new URLSearchParams({ search: usersSearch, page: String(usersPage) });
  const data = await call('GET', `/api/admin/users?${query}`).catch(() => null);
  if (!data) return;

  el('users-total').textContent = data.total;
  el('users-page').textContent = `Página ${data.page} de ${data.totalPages}`;
  el('users-prev').disabled = data.page <= 1;
  el('users-next').disabled = data.page >= data.totalPages;

  const body = el('users-body');
  body.innerHTML = '';
  for (const user of data.users) {
    const isSelf = String(user.id) === String(currentAdminId);
    const isAdmin = user.role === 'ADMIN';

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(
      createActionButton(
        isAdmin ? 'Quitar admin' : 'Hacer admin',
        () => updateUser(user, { role: isAdmin ? 'USER' : 'ADMIN' },
          isAdmin ? `¿Quitar el rol de administrador a ${user.name}?` : `¿Dar rol de ADMINISTRADOR a ${user.name}? Podrá ver y gestionar toda la plataforma.`),
        isSelf,
      ),
      createActionButton(
        user.isBlocked ? 'Desbloquear' : 'Bloquear',
        () => updateUser(user, { isBlocked: !user.isBlocked },
          user.isBlocked ? `¿Desbloquear a ${user.name}?` : `¿Bloquear a ${user.name}? No podrá iniciar sesión y se detendrán su partida y su conexión con TikTok.`),
        isSelf,
      ),
    );

    body.append(createRow([
      isSelf ? `${user.name} (tú)` : user.name,
      user.email,
      createBadge(isAdmin ? 'ADMIN' : 'USER', isAdmin ? 'live' : ''),
      String(user.games),
      formatDate(user.lastGameAt),
      formatDate(user.createdAt),
      createBadge(user.isBlocked ? 'Bloqueado' : 'Activo', user.isBlocked ? 'warn' : 'ok'),
      actions,
    ]));
  }
}

el('users-search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  usersSearch = el('users-search').value.trim();
  usersPage = 1;
  loadUsers();
});
el('users-prev').addEventListener('click', () => { usersPage -= 1; loadUsers(); });
el('users-next').addEventListener('click', () => { usersPage += 1; loadUsers(); });

// ---------- Últimas partidas ----------

async function loadGames() {
  const games = await call('GET', '/api/admin/games?limit=20').catch(() => null);
  if (!games) return;

  el('games-empty').hidden = games.length > 0;
  const body = el('games-body');
  body.innerHTML = '';
  for (const game of games) {
    let result = 'Sin ganador';
    if (game.winners.length > 0) {
      result = game.isTie ? `🤝 Empate: ${game.winners.join(', ')}` : `🏆 ${game.winners[0]}`;
    }
    body.append(createRow([
      formatDate(game.endedAt),
      game.streamer,
      result,
      game.totalPoints.toLocaleString('es'),
      String(game.participants),
      `${formatClock(game.playedSeconds)}${game.endedBy === 'MANUAL' ? ' (detenida)' : ''}`,
    ]));
  }
}

// ---------- Configuración global ----------

async function loadSettings() {
  const settings = await call('GET', '/api/admin/settings').catch(() => null);
  if (!settings) return;
  el('announcement').value = settings.announcement;
  el('registrations-open').checked = settings.registrationsOpen;
}

el('settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await call('PUT', '/api/admin/settings', {
      announcement: el('announcement').value,
      registrationsOpen: el('registrations-open').checked,
    });
    showToast('Configuración global guardada ✅');
  } catch (error) {
    // call() ya mostró el error
  }
});

el('logout').addEventListener('click', logout);

// ---------- Inicio ----------

async function init() {
  let user;
  try {
    ({ user } = await call('GET', '/api/auth/me'));
  } catch (error) {
    return;
  }
  // Si no es administrador, a su dashboard (el servidor además rechaza todas las peticiones de /api/admin)
  if (user.role !== 'ADMIN') {
    window.location.replace('/dashboard/');
    return;
  }
  currentAdminId = user.id;
  el('user-name').textContent = user.name;

  await Promise.all([loadStats(), loadRooms(), loadUsers(), loadGames(), loadSettings()]);

  // Actualización periódica de lo "en vivo" (solo si la pestaña está visible)
  setInterval(() => {
    if (!document.hidden) {
      loadStats();
      loadRooms();
    }
  }, REFRESH_MS);
}

if (hasSession) {
  init();
}
