const EventEmitter = require('events');
const GameEngine = require('../games/countryBattle/GameEngine');
const ChatProcessor = require('../games/countryBattle/ChatProcessor');
const GiftProcessor = require('../games/countryBattle/GiftProcessor');
const TikTokService = require('../tiktok/TikTokService');
const gameConfigService = require('../services/gameConfigService');
const gameHistoryService = require('../services/gameHistoryService');
const activeRoomService = require('../services/activeRoomService');
const { normalizeOverlaySizes } = require('../utils/overlaySizes');
const { normalizeOverlayOptions } = require('../utils/overlayOptions');
const { getCachedGiftImage } = require('../tiktok/giftCatalog');

const { GAME_STATUS } = GameEngine;
const ENGINE_EVENTS = ['start', 'tick', 'score', 'end', 'reset', 'settings'];

// Conteo "1, 2, 3, ¡GO!" antes de cada partida nueva: la partida empieza de verdad al terminar
// (así el conteo no quita tiempo de juego). INTRO_COUNTDOWN_MS=0 en el .env lo desactiva.
const INTRO_COUNTDOWN_MS = process.env.INTRO_COUNTDOWN_MS !== undefined && process.env.INTRO_COUNTDOWN_MS !== ''
  ? Math.max(0, Number(process.env.INTRO_COUNTDOWN_MS) || 0)
  : 4000;
// Los puntos se guardan como mucho cada N segundos (SNAPSHOT_INTERVAL_SECONDS, por defecto 10).
// Menos guardados = mucho menos tráfico con MongoDB (importante en el plan gratis de Atlas).
// Si el servidor se cae, como mucho se pierden esos últimos segundos de puntos.
const PERSIST_INTERVAL_MS = (Number(process.env.SNAPSHOT_INTERVAL_SECONDS) || 10) * 1000;
// Avisos de "se unió a un país" para el feed del overlay: como mucho estos por segundo
// (en un LIVE grande entran cientos de comentarios por segundo; los regalos se avisan siempre)
const MAX_JOIN_ACTIVITIES_PER_SECOND = 4;

// La "sala" de UN streamer: su partida, su configuración y su conexión con TikTok LIVE.
// Cada streamer tiene la suya, así las partidas nunca se mezclan.
// Avisa a quien escuche (el WebSocket) con:
//   'game'    (nombre del evento del motor)  -> cambió la partida
//   'tiktok'  ('connected' | 'disconnected', estado) -> cambió la conexión con TikTok
//   'historySaved'                           -> se guardó una partida en el historial
//   'activity'                               -> algo para el feed del overlay (se unió a un país, envió un regalo)
// Además guarda una "foto" en MongoDB (partida en curso + TikTok) para recuperarla si el servidor se reinicia.
class GameRoom extends EventEmitter {
  constructor(userId, config) {
    super();
    this.userId = String(userId);

    // Países y regalos con los que está funcionando el juego ahora mismo (con comandos, para poder guardarlos)
    this.activeCountries = config.countries;
    this.activeGifts = config.gifts;
    this.overlaySizes = normalizeOverlaySizes(config.overlaySizes);
    this.overlayOptions = normalizeOverlayOptions(config.overlayOptions);

    this.game = new GameEngine(config.countries, { durationSeconds: config.durationSeconds });
    this.chatProcessor = new ChatProcessor(this.game, config.countries);
    this.giftProcessor = new GiftProcessor(this.game, config.gifts);
    this.autoRestartSeconds = config.autoRestartSeconds;
    this.autoRestartTimer = null;
    this.introTimer = null;     // conteo "1, 2, 3, ¡GO!" en marcha
    this.introEndsAt = null;
    this.isManualStop = false;
    this.persistTimer = null;
    this.persistChain = Promise.resolve();

    // Para saber si la sala está en uso (ver isIdle)
    this.clients = 0; // navegadores conectados (dashboards y overlays)
    this.joinWindowStart = 0; // para limitar los avisos de "se unió" por segundo
    this.joinsInWindow = 0;
    this.lastActivityAt = Date.now();

    // Reenvía los avisos del motor (primero, para que el overlay se actualice antes que nada)
    for (const eventName of ENGINE_EVENTS) {
      this.game.on(eventName, () => {
        this.touch();
        this.emit('game', eventName);
      });
    }
    this.game.on('end', (result) => this.handleEnd(result));

    // Cuándo se guarda la foto: al empezar/terminar al instante; los puntos, agrupados (cada SNAPSHOT_INTERVAL_SECONDS)
    this.game.on('start', () => this.persistNow());
    this.game.on('score', () => this.schedulePersist());
    this.game.on('end', () => this.persistNow());
    this.game.on('reset', () => this.persistNow());

    this.tiktok = new TikTokService({ signApiKey: process.env.EULER_API_KEY || undefined });
    this.tiktok.on('connected', (status) => {
      this.log(`Conectado al LIVE de @${status.username} (sala TikTok ${status.roomId})`);
      this.emit('tiktok', 'connected', status);
      this.persistNow();
    });
    this.tiktok.on('reconnecting', (status) => {
      const seconds = Math.round((status.nextRetryAt - Date.now()) / 1000);
      this.log(`Se cortó la conexión con TikTok. Reintento ${status.reconnectAttempt} de ${status.maxReconnectAttempts} en ${seconds} s`);
      this.emit('tiktok', 'reconnecting', status);
    });
    this.tiktok.on('disconnected', (status) => {
      this.log(status.reason === 'RECONNECT_FAILED'
        ? 'No se pudo reconectar con TikTok: se dejó de intentar (¿terminó el LIVE?)'
        : 'Desconectado del LIVE');
      this.emit('tiktok', 'disconnected', status);
      this.persistNow();
    });
    this.tiktok.on('event', (event) => this.handleTikTokEvent(event));
  }

  // Los mensajes de la terminal llevan el final del id del streamer para saber de qué sala son
  log(message) {
    console.log(`[SALA ${this.userId.slice(-6)}] ${message}`);
  }

  // ---------- Partida ----------

  getState() {
    const state = this.game.getState();
    return {
      ...state,
      result: state.gameStatus === GAME_STATUS.FINISHED ? this.game.getResult() : null,
      // Regalos que suman puntos, con su imagen: el overlay los muestra para que el público sepa cuánto vale cada uno
      // Milisegundos que faltan del conteo "1, 2, 3, ¡GO!" (0 = no hay conteo)
      introCountdownMs: this.introEndsAt ? Math.max(0, this.introEndsAt - Date.now()) : 0,
      gifts: this.activeGifts
        .map(({ giftId, name, points }) => ({ giftId, name, points, imageUrl: getCachedGiftImage(giftId) }))
        .sort((a, b) => b.points - a.points),
      // Tamaño de cada parte del overlay (lo ajusta el streamer desde el dashboard)
      overlaySizes: this.overlaySizes,
      // Qué partes se muestran (ej. la barra de mensaje)
      overlayOptions: this.overlayOptions,
    };
  }

  // Cambia qué se muestra en el overlay al instante
  applyOverlayOptions(options) {
    this.overlayOptions = normalizeOverlayOptions(options);
    this.emit('game', 'settings');
  }

  // Cambia los tamaños del overlay al instante (en todos los overlays abiertos de este streamer)
  applyOverlaySizes(sizes) {
    this.overlaySizes = normalizeOverlaySizes(sizes);
    this.emit('game', 'settings');
  }

  // Punto de entrada único para los eventos, vengan del simulador o de TikTok.
  // event: { type: 'CHAT' | 'GIFT', source, username, message?, giftName?, giftId?, count?, timestamp }
  processEvent(event) {
    switch (event.type) {
      case 'CHAT': {
        const previousCountry = this.game.getUserCountry(event.username);
        const countryId = this.chatProcessor.processMessage(event);
        // Aviso para el feed solo cuando el espectador ELIGE (o cambia de) país, no en cada comentario
        if (countryId && countryId !== previousCountry) {
          this.emitJoinActivity(event.username, countryId);
        }
        return countryId;
      }
      case 'GIFT': {
        const result = this.giftProcessor.processGift(event);
        if (result.assigned) {
          this.emit('activity', {
            type: 'GIFT',
            username: event.username,
            countryId: result.countryId,
            giftName: result.giftName,
            giftImage: getCachedGiftImage(result.giftId),
            count: result.count,
            points: result.points,
          });
        }
        return result;
      }
      default:
        throw new Error(`Tipo de evento desconocido: ${event.type}`);
    }
  }

  // Como mucho MAX_JOIN_ACTIVITIES_PER_SECOND avisos de "se unió" por segundo (el resto no se muestra)
  emitJoinActivity(username, countryId) {
    const now = Date.now();
    if (now - this.joinWindowStart >= 1000) {
      this.joinWindowStart = now;
      this.joinsInWindow = 0;
    }
    if (this.joinsInWindow < MAX_JOIN_ACTIVITIES_PER_SECOND) {
      this.joinsInWindow += 1;
      this.emit('activity', { type: 'JOIN', username, countryId });
    }
  }

  startGame() {
    this.cancelAutoRestart();
    this.cancelIntro();
    this.game.start();
  }

  resetGame() {
    this.cancelAutoRestart();
    this.cancelIntro();
    this.game.reset();
  }

  // "Nueva partida": carga la configuración guardada del streamer, reinicia y, tras el conteo
  // "1, 2, 3, ¡GO!" del overlay, la inicia
  async newGame() {
    this.cancelAutoRestart();
    this.cancelIntro();
    const config = await gameConfigService.getConfig(this.userId);
    this.game.reset();
    this.applyConfig(config);

    if (INTRO_COUNTDOWN_MS === 0) {
      this.game.start();
      return;
    }
    this.introEndsAt = Date.now() + INTRO_COUNTDOWN_MS;
    this.introTimer = setTimeout(() => {
      this.introTimer = null;
      this.introEndsAt = null;
      if (!this.game.isRunning()) this.game.start();
    }, INTRO_COUNTDOWN_MS);
    this.emit('game', 'countdown'); // el overlay empieza el conteo
  }

  cancelIntro() {
    clearTimeout(this.introTimer);
    this.introTimer = null;
    this.introEndsAt = null;
  }

  // "Detener": termina la partida antes de tiempo y muestra el resultado
  stopGame() {
    this.cancelAutoRestart();
    this.cancelIntro();
    this.isManualStop = true;
    this.game.finish();
    this.isManualStop = false;
  }

  // Regalos: siempre, al instante (cambiar lo que vale un regalo no afecta a los puntos ya sumados).
  // Duración y reinicio automático: siempre (la duración vale para la próxima partida).
  // Países: solo si no hay una partida en curso (si la hay, se aplican en la siguiente).
  applyConfig(config) {
    this.overlaySizes = normalizeOverlaySizes(config.overlaySizes);
    this.overlayOptions = normalizeOverlayOptions(config.overlayOptions);
    this.activeGifts = config.gifts;
    this.giftProcessor.setGifts(config.gifts);

    this.autoRestartSeconds = config.autoRestartSeconds;
    if (this.autoRestartSeconds === 0) {
      this.cancelAutoRestart();
    }
    this.game.setDuration(config.durationSeconds); // avisa al overlay y al dashboard (ya con los regalos nuevos)

    if (!this.game.isRunning()) {
      this.activeCountries = config.countries;
      this.game.setCountries(config.countries);
      this.chatProcessor.setCountries(config.countries);
    } else {
      this.schedulePersist(); // la foto de la partida en curso guarda también los regalos
    }
  }

  handleEnd(result) {
    const winners = result.winners.map((country) => country.name).join(', ') || 'ninguno';
    this.log(`Partida terminada. ${result.isTie ? 'EMPATE' : 'Ganador'}: ${winners}`);

    this.saveToHistory(result, this.isManualStop ? 'MANUAL' : 'TIMER');

    // Si el streamer pulsó "Detener", no se reinicia sola
    if (this.autoRestartSeconds > 0 && !this.isManualStop) {
      this.log(`Nueva partida automática en ${this.autoRestartSeconds} segundos`);
      this.autoRestartTimer = setTimeout(() => {
        this.newGame().catch((error) => this.log(`Error en el reinicio automático: ${error.message}`));
      }, this.autoRestartSeconds * 1000);
    }
  }

  // Guardar en MongoDB no debe frenar ni romper el juego: si falla, solo se registra el error
  saveToHistory(result, endedBy) {
    gameHistoryService.saveFinishedGame({
      userId: this.userId,
      state: this.game.getState(),
      result,
      endedBy,
      participants: this.game.getParticipantCount(),
    })
      .then(() => this.emit('historySaved'))
      .catch((error) => this.log(`No se pudo guardar la partida en el historial: ${error.message}`));
  }

  cancelAutoRestart() {
    clearTimeout(this.autoRestartTimer);
    this.autoRestartTimer = null;
  }

  // ---------- Uso de la sala (para liberar de la memoria las que no se usan) ----------

  // Marca que la sala se acaba de usar
  touch() {
    this.lastActivityAt = Date.now();
  }

  addClient() {
    this.clients += 1;
    this.touch();
  }

  removeClient() {
    this.clients = Math.max(0, this.clients - 1);
    this.touch();
  }

  // Inactiva = nada en marcha, nadie mirando y sin usarse desde hace idleMs milisegundos
  isIdle(idleMs) {
    const tiktokStatus = this.tiktok.getStatus().status;
    return !this.game.isRunning()
      && tiktokStatus === 'DISCONNECTED'
      && this.autoRestartTimer === null
      && this.introTimer === null
      && this.clients === 0
      && Date.now() - this.lastActivityAt >= idleMs;
  }

  // Resumen de la sala para el panel de administrador
  getSummary() {
    const state = this.game.getState();
    const tiktok = this.tiktok.getStatus();
    return {
      userId: this.userId,
      gameStatus: state.gameStatus,
      remainingTime: state.remainingTime,
      tiktokStatus: tiktok.status,
      tiktokUsername: tiktok.username,
      clients: this.clients,
      lastActivityAt: this.lastActivityAt,
    };
  }

  // Detiene la partida y desconecta TikTok (ej. cuando un administrador bloquea la cuenta)
  async shutdown() {
    this.cancelAutoRestart();
    this.cancelIntro();
    if (this.game.isRunning()) {
      this.stopGame();
    }
    await this.disconnectTikTok();
  }

  // Apaga todo lo que la sala tenga pendiente para que pueda borrarse de la memoria
  dispose() {
    this.cancelAutoRestart();
    this.cancelIntro();
    clearTimeout(this.persistTimer);
    this.persistTimer = null;
    // Primero se quitan los "oyentes" para que el reset no avise ni guarde nada
    this.game.removeAllListeners();
    this.game.reset(); // detiene el reloj si hubiera uno
    this.tiktok.removeAllListeners();
    this.removeAllListeners();
  }

  // ---------- Guardar y recuperar la sala (reinicios del servidor) ----------

  // Foto de lo que no se debe perder: la partida en curso y la conexión con TikTok
  getSnapshot() {
    const state = this.game.getState();
    const tiktokStatus = this.tiktok.getStatus();
    const tiktokActive = tiktokStatus.status === 'CONNECTED' || tiktokStatus.status === 'RECONNECTING';

    let game = null;
    if (state.gameStatus === GAME_STATUS.RUNNING) {
      const pointsById = new Map(state.countries.map((country) => [country.id, country.points]));
      game = {
        durationSeconds: state.durationSeconds,
        startTime: new Date(state.gameStartTime),
        endTime: new Date(state.gameEndTime),
        countries: this.activeCountries.map((country) => ({ ...country, points: pointsById.get(country.id) || 0 })),
        gifts: this.activeGifts,
        userCountries: this.game.getUserCountries(),
        doubleFinal: this.game.doubleFinal,
        // Sin la foto de perfil: ocupa mucho y se recupera sola con el siguiente comentario del espectador
        contributions: this.game.getContributions().map(({ username, countryId, points }) => ({ username, countryId, points })),
      };
    }

    return { game, tiktokUsername: tiktokActive ? tiktokStatus.username : null };
  }

  // Guarda dentro de un momento (varios puntos seguidos se guardan juntos)
  schedulePersist() {
    if (!this.persistTimer) {
      this.persistTimer = setTimeout(() => this.persistNow(), PERSIST_INTERVAL_MS);
    }
  }

  // Guarda ya. Los guardados van en fila para que nunca se escriba una foto vieja encima de una nueva.
  persistNow() {
    clearTimeout(this.persistTimer);
    this.persistTimer = null;
    const snapshot = this.getSnapshot();
    this.persistChain = this.persistChain
      .then(() => activeRoomService.saveSnapshot(this.userId, snapshot))
      .catch((error) => this.log(`No se pudo guardar el estado de la sala: ${error.message}`));
    return this.persistChain;
  }

  // Recupera la sala a partir de su foto (al arrancar el servidor)
  restore({ game, tiktokUsername }) {
    if (game) {
      this.activeCountries = game.countries.map(({ id, name, command, color, flag }) => ({ id, name, command, color, flag }));
      this.activeGifts = game.gifts.map(({ giftId, name, points }) => ({ giftId, name, points }));
      this.chatProcessor.setCountries(this.activeCountries);
      this.giftProcessor.setGifts(this.activeGifts);
      this.game.resume({
        countries: game.countries,
        userCountries: game.userCountries,
        contributions: game.contributions || [],
        doubleFinal: game.doubleFinal,
        durationSeconds: game.durationSeconds,
        startTime: new Date(game.startTime).getTime(),
        endTime: new Date(game.endTime).getTime(),
      });
      const remaining = this.game.getState().remainingTime;
      this.log(remaining > 0
        ? `Partida recuperada tras el reinicio (quedan ${remaining} s)`
        : 'Partida recuperada: su tiempo terminó mientras el servidor estaba apagado; se cierra ahora');
    }

    if (tiktokUsername) {
      this.log(`Retomando la conexión con el LIVE de @${tiktokUsername}...`);
      this.tiktok.resume(tiktokUsername);
    }
  }

  // ---------- TikTok LIVE ----------

  connectTikTok(username) {
    return this.tiktok.connect(username);
  }

  disconnectTikTok() {
    return this.tiktok.disconnect();
  }

  getTikTokStatus() {
    return this.tiktok.getStatus();
  }

  handleTikTokEvent(event) {
    try {
      const result = this.processEvent(event);
      if (event.type === 'CHAT') {
        // Solo se muestran los comentarios que sumaron puntos, para no llenar la terminal
        if (result) this.log(`💬 ${event.username}: "${event.message}" -> +1 ${result}`);
        return;
      }
      this.log(`🎁 ${event.username} envió "${event.giftName}" (giftId ${event.giftId}) x${event.count} -> ${JSON.stringify(result)}`);
    } catch (error) {
      this.log(`Error procesando evento de TikTok: ${error.message}`);
    }
  }
}

module.exports = GameRoom;
