const EventEmitter = require('events');
const {
  TikTokLiveConnection,
  WebcastEvent,
  ControlEvent,
  UserOfflineError,
  SignatureRateLimitError,
} = require('tiktok-live-connector');

const CONNECTION_STATUS = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING', // se cortó sola y estamos esperando para volver a intentarlo
};

// Esperas entre intentos de reconexión (cada vez más largas): unos 5 minutos en total
const DEFAULT_RECONNECT_DELAYS_SECONDS = [5, 10, 20, 30, 60, 60, 60, 60];

// Regalos que se pueden enviar en combo (ej. Rosa x10)
const STREAKABLE_GIFT_TYPE = 1;
// Cuánto se recuerda un combo para no contarlo dos veces si TikTok repite algún evento
const STREAK_MEMORY_MS = 2 * 60 * 1000;

// ÚNICA parte del proyecto que conoce la librería tiktok-live-connector.
// Recibe los eventos de TikTok, los convierte al modelo interno y los anuncia con 'event'.
// Si la conexión se corta sola, intenta reconectar ('reconnecting'); si no lo logra, avisa con 'disconnected'.
// Si la librería cambia o deja de funcionar, solo hay que reescribir este archivo.
class TikTokService extends EventEmitter {
  // createConnection y reconnectDelaysSeconds se pueden cambiar en las pruebas (conexión falsa, esperas cortas)
  constructor({
    signApiKey,
    createConnection = (username, options) => new TikTokLiveConnection(username, options),
    reconnectDelaysSeconds = DEFAULT_RECONNECT_DELAYS_SECONDS,
  } = {}) {
    super();
    this.signApiKey = signApiKey;
    this.createConnection = createConnection;
    this.reconnectDelaysSeconds = reconnectDelaysSeconds;

    this.connection = null;
    this.status = CONNECTION_STATUS.DISCONNECTED;
    // Combos de regalos recientes: "usuario|regalo|combo" -> { counted, at }
    this.streaks = new Map();
    this.username = null;
    this.roomId = null;
    this.profile = null; // { nickname, avatarUrl } del dueño del LIVE

    // Reconexión
    this.wantsConnection = false; // true mientras el streamer quiera estar conectado
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.nextRetryAt = null;
  }

  getStatus() {
    const status = {
      status: this.status,
      username: this.username,
      roomId: this.roomId,
      profile: this.profile, // se mantiene mientras reconecta, para seguir mostrando la foto
    };
    if (this.status === CONNECTION_STATUS.RECONNECTING) {
      status.reconnectAttempt = this.reconnectAttempt;
      status.maxReconnectAttempts = this.reconnectDelaysSeconds.length;
      status.nextRetryAt = this.nextRetryAt;
    }
    return status;
  }

  // Conexión pedida por el streamer. Si falla, se le muestra el error (no se reintenta).
  async connect(username) {
    if (this.status !== CONNECTION_STATUS.DISCONNECTED) {
      throw createError('ALREADY_CONNECTED', 'Ya hay una conexión activa o en curso');
    }
    this.username = username;
    this.reconnectAttempt = 0;

    try {
      await this.openConnection();
      this.wantsConnection = true;
      return this.getStatus();
    } catch (error) {
      this.resetState();
      throw error;
    }
  }

  // Retoma una conexión que estaba activa antes de reiniciar el servidor.
  // Usa la reconexión automática: si el LIVE sigue, se conecta; si no, lo deja tras varios intentos.
  resume(username) {
    if (this.status !== CONNECTION_STATUS.DISCONNECTED) {
      return;
    }
    this.username = username;
    this.wantsConnection = true;
    this.reconnectAttempt = 0;
    this.scheduleReconnect();
  }

  // Abre la conexión con el LIVE de this.username
  async openConnection() {
    this.status = CONNECTION_STATUS.CONNECTING;

    // La librería exige pasar siempre un objeto de opciones.
    // processInitialData: false -> no procesar los comentarios antiguos que había antes de conectarnos.
    const options = { processInitialData: false };
    if (this.signApiKey) {
      options.signApiKey = this.signApiKey;
    }

    const connection = this.createConnection(this.username, options);
    this.connection = connection;

    connection.on(WebcastEvent.CHAT, (data) => this.handleChat(data));
    connection.on(WebcastEvent.GIFT, (data) => this.handleGift(data));
    connection.on(ControlEvent.DISCONNECTED, () => this.handleDisconnected(connection));
    connection.on(ControlEvent.ERROR, ({ info, exception }) => {
      console.error('[TIKTOK] Error de la librería:', info, exception ? exception.message : '');
    });

    try {
      const state = await connection.connect();

      // Si el streamer pulsó "Desconectar" mientras esperábamos, se cierra esta conexión
      if (this.connection !== connection) {
        connection.disconnect().catch(() => {});
        throw createError('CANCELLED', 'Conexión cancelada por el streamer');
      }

      this.roomId = state.roomId;
      this.profile = extractProfile(state.roomInfo) || this.profile;
      this.status = CONNECTION_STATUS.CONNECTED;
      this.reconnectAttempt = 0;
      this.nextRetryAt = null;
      this.emit('connected', this.getStatus());
    } catch (error) {
      this.connection = null;
      connection.disconnect().catch(() => {});
      throw toFriendlyError(error);
    }
  }

  // Desconexión pedida por el streamer: también cancela cualquier reconexión pendiente
  async disconnect() {
    const wasActive = this.status !== CONNECTION_STATUS.DISCONNECTED;
    const connection = this.connection;
    this.resetState();

    if (connection) {
      await connection.disconnect().catch(() => {});
    }
    if (wasActive) {
      this.emit('disconnected', this.getStatus());
    }
  }

  // TikTok cerró la conexión sin que el streamer lo pidiera (caída de internet, fin del LIVE...)
  handleDisconnected(connection) {
    if (connection !== this.connection) {
      return; // es una conexión vieja o la cerramos nosotros
    }
    this.connection = null;
    this.roomId = null;

    if (this.wantsConnection) {
      this.scheduleReconnect();
    } else {
      this.resetState();
      this.emit('disconnected', this.getStatus());
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempt >= this.reconnectDelaysSeconds.length) {
      // Se acabaron los intentos: probablemente el LIVE terminó de verdad
      this.resetState();
      this.emit('disconnected', { ...this.getStatus(), reason: 'RECONNECT_FAILED' });
      return;
    }

    const delaySeconds = this.reconnectDelaysSeconds[this.reconnectAttempt];
    this.reconnectAttempt += 1;
    this.status = CONNECTION_STATUS.RECONNECTING;
    this.nextRetryAt = Date.now() + delaySeconds * 1000;
    this.emit('reconnecting', this.getStatus());

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.openConnection();
      } catch (error) {
        // Si el streamer canceló mientras tanto, no se sigue intentando
        if (this.wantsConnection) {
          this.scheduleReconnect();
        }
      }
    }, delaySeconds * 1000);
  }

  // Vuelve al estado "desconectado" y olvida cualquier reconexión pendiente
  resetState() {
    this.streaks.clear();
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.wantsConnection = false;
    this.connection = null;
    this.status = CONNECTION_STATUS.DISCONNECTED;
    this.username = null;
    this.roomId = null;
    this.profile = null;
    this.reconnectAttempt = 0;
    this.nextRetryAt = null;
  }

  // Solo usamos los datos necesarios: usuario, su foto de perfil, texto, regalo y cantidad.
  // Nota: los nombres de campos reales (verificados en un LIVE, v2.5.0) no coinciden con la documentación
  // de la librería. Aceptamos ambos: real (displayId, content, gift.name) y documentado (uniqueId, comment, giftDetails).
  handleChat(data) {
    const username = getUsername(data.user);
    const message = data.content ?? data.comment;
    if (!username || typeof message !== 'string' || message === '') {
      return;
    }

    this.emit('event', {
      type: 'CHAT',
      source: 'tiktok',
      username,
      avatarUrl: getAvatarUrl(data.user),
      message,
      timestamp: new Date().toISOString(),
    });
  }

  handleGift(data) {
    const username = getUsername(data.user);
    if (!username) {
      return;
    }

    const gift = data.gift || data.giftDetails || {};
    const giftType = gift.type ?? gift.giftType;

    // Combos (ej. Rosa x10): TikTok envía un evento por cada toque con el total acumulado (repeatCount)
    // y uno final con repeatEnd. Sumamos al instante solo lo NUEVO de cada evento: así los puntos
    // aparecen mientras el espectador sigue enviando, sin esperar a que termine el combo.
    let count = data.repeatCount || 1;
    if (giftType === STREAKABLE_GIFT_TYPE) {
      count = this.countStreakIncrement(username, data);
      if (count <= 0) {
        return; // nada nuevo (evento repetido o ya contado)
      }
    }

    this.emit('event', {
      type: 'GIFT',
      source: 'tiktok',
      username,
      avatarUrl: getAvatarUrl(data.user),
      giftName: gift.name ?? gift.giftName ?? null,
      giftId: data.giftId,
      count,
      timestamp: new Date().toISOString(),
    });
  }

  // Cuántos regalos NUEVOS trae este evento de un combo (total acumulado - lo ya contado)
  countStreakIncrement(username, data) {
    const now = Date.now();
    for (const [key, streak] of this.streaks) {
      if (now - streak.at > STREAK_MEMORY_MS) this.streaks.delete(key);
    }

    const key = `${username}|${data.giftId}|${data.groupId || ''}`;
    const total = Number(data.repeatCount) || 1;
    const previous = this.streaks.get(key);
    let counted = previous ? previous.counted : 0;
    // Si el total vuelve a empezar desde abajo, es un combo nuevo con el mismo identificador
    if (previous && total < counted) {
      counted = 0;
    }

    this.streaks.set(key, { counted: Math.max(counted, total), at: now });
    return total - counted;
  }
}

// Nombre visible y foto de perfil del dueño del LIVE, a partir de la información de la sala.
// Verificado en un LIVE real (v2.5.0): los datos vienen en roomInfo.data.owner (no en roomInfo.owner).
// La foto se muestra directamente desde TikTok (la dirección caduca en unos días; se renueva al reconectar).
function extractProfile(roomInfo) {
  const owner = roomInfo && ((roomInfo.data && roomInfo.data.owner) || roomInfo.owner);
  if (!owner) {
    return null;
  }

  const avatar = owner.avatar_thumb || owner.avatarThumb || {};
  const urls = avatar.url_list || avatar.urlList || [];
  const avatarUrl = urls.find((url) => typeof url === 'string' && url.startsWith('https://')) || null;
  const nickname = typeof owner.nickname === 'string' ? owner.nickname.trim().slice(0, 60) : null;

  return { nickname: nickname || null, avatarUrl };
}

// Foto de perfil (pequeña) del espectador, para mostrarla junto al MVP y en el podio.
// Verificado en un LIVE real: viene en user.avatarThumb.urlList. Solo se aceptan direcciones https://
function getAvatarUrl(user) {
  const avatar = user && (user.avatarThumb || user.avatar_thumb);
  const urls = avatar ? (avatar.urlList || avatar.url_list || []) : [];
  return urls.find((url) => typeof url === 'string' && url.startsWith('https://')) || null;
}

// El @usuario de TikTok (ej. "juan_123")
function getUsername(user) {
  if (!user) return null;
  return user.displayId || user.uniqueId || null;
}

function createError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// Traduce los errores de la librería a códigos propios, para que el resto del proyecto no dependa de ella.
function toFriendlyError(error) {
  if (error.code) {
    return error;
  }
  if (error instanceof UserOfflineError) {
    return createError('USER_OFFLINE', 'El usuario no está en LIVE');
  }
  if (error instanceof SignatureRateLimitError) {
    return createError('RATE_LIMIT', 'Límite de conexiones alcanzado');
  }
  console.error('[TIKTOK] Error al conectar:', error.message);
  return createError('CONNECTION_FAILED', error.message);
}

module.exports = TikTokService;
module.exports.CONNECTION_STATUS = CONNECTION_STATUS;
