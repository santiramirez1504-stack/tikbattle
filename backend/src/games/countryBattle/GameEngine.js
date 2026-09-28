const EventEmitter = require('events');
const GameTimer = require('./GameTimer');

const GAME_STATUS = {
  WAITING: 'WAITING',
  RUNNING: 'RUNNING',
  FINISHED: 'FINISHED',
};

const DEFAULT_DURATION_SECONDS = 5 * 60;
const TOP_SUPPORTERS = 3; // cuántos espectadores se muestran en el podio del ganador

// "X2 final": en algunas partidas (al azar), los últimos segundos todo vale el doble.
// Se sortea al empezar cada partida y es sorpresa: el overlay solo lo sabe cuando se activa.
// 35 % de las partidas. Se puede cambiar con DOUBLE_FINAL_CHANCE en el .env (0 = nunca, 1 = siempre; útil para probar)
const DOUBLE_FINAL_CHANCE = readChance(process.env.DOUBLE_FINAL_CHANCE, 0.35);
const DOUBLE_FINAL_SECONDS = 30;    // últimos 30 segundos, hasta el final de la partida
const DOUBLE_MULTIPLIER = 2;

// Motor del juego "Batalla de Países".
// No sabe nada de TikTok, ni de Express, ni de WebSocket: solo maneja países, puntos,
// qué país apoya cada espectador, cuánto aporta cada uno y el estado de la partida.
// Extiende EventEmitter para avisar a quien escuche:
// 'start' (inicio), 'tick' (cada segundo), 'score' (puntos sumados), 'end' (fin), 'reset' (reinicio)
// y 'settings' (cambió la configuración).
function readChance(value, fallback) {
  const chance = Number(value);
  return value !== undefined && value !== '' && chance >= 0 && chance <= 1 ? chance : fallback;
}

class GameEngine extends EventEmitter {
  // random: se puede cambiar en las pruebas para forzar (o impedir) el X2 final
  constructor(countries, { durationSeconds = DEFAULT_DURATION_SECONDS, random = Math.random } = {}) {
    super();
    this.durationSeconds = durationSeconds;
    this.random = random;
    this.status = GAME_STATUS.WAITING;
    this.timer = null;
    this.doubleFinal = false; // ¿esta partida tiene X2 en los últimos segundos?
    this.setCountries(countries);
  }

  // Define los países de la partida (todos con 0 puntos). No se puede con la partida en curso.
  // countries: [{ id, name, color, command?, flag? }]
  setCountries(countries) {
    if (this.isRunning()) {
      throw new Error('No se pueden cambiar los países con la partida en curso');
    }

    // Map: permite buscar un país por su id de forma rápida -> countries.get('cuba')
    this.countries = new Map();
    for (const country of countries) {
      this.countries.set(country.id, {
        id: country.id,
        name: country.name,
        color: country.color,
        command: country.command || null, // lo que hay que escribir (se muestra en el overlay)
        flag: country.flag || null,       // código de bandera, ej. "cu"
        points: 0,
        mvp: null,                        // espectador que más puntos le dio: { username, points }
      });
    }

    this.clearPlayers();
    this.emit('settings');
  }

  // Olvida quién apoya a quién y cuánto aportó cada uno (al empezar de cero)
  clearPlayers() {
    // Qué país apoya cada espectador en esta partida. Ej: "juan" -> "cuba"
    this.userCountries = new Map();
    // Puntos que aportó cada espectador a cada país: countryId -> Map(username -> puntos)
    this.contributions = new Map([...this.countries.keys()].map((id) => [id, new Map()]));
    // Foto de perfil de cada espectador (para el MVP y el podio). Ej: "juan" -> "https://..."
    this.userAvatars = new Map();
  }

  // Cuántos espectadores distintos eligieron país en esta partida
  getParticipantCount() {
    return this.userCountries.size;
  }

  isRunning() {
    return this.status === GAME_STATUS.RUNNING;
  }

  start() {
    if (this.status !== GAME_STATUS.WAITING) {
      throw new Error(`No se puede iniciar una partida en estado ${this.status}. Usa reset() primero.`);
    }

    this.timer = this.createTimer();
    this.status = GAME_STATUS.RUNNING;
    this.doubleFinal = this.random() < DOUBLE_FINAL_CHANCE;
    this.timer.start();
    this.emit('start');
  }

  // ¿Los puntos valen el doble AHORA? (partida con X2 final y dentro de los últimos segundos)
  isDoubleActive() {
    return this.isRunning() && this.doubleFinal
      && this.timer.getRemainingSeconds() <= DOUBLE_FINAL_SECONDS;
  }

  // Continúa una partida guardada (ej. después de reiniciar el servidor), con sus puntos,
  // sus espectadores, lo que aportó cada uno y su reloj.
  // countries: [{ id, name, color, command, flag, points }], userCountries: [{ username, countryId }],
  // contributions: [{ username, countryId, points }]
  resume({ countries, userCountries, contributions = [], durationSeconds, startTime, endTime, doubleFinal = false }) {
    if (this.status !== GAME_STATUS.WAITING) {
      throw new Error(`No se puede reanudar una partida en estado ${this.status}`);
    }

    this.durationSeconds = durationSeconds;
    this.setCountries(countries);
    for (const country of countries) {
      this.countries.get(country.id).points = country.points;
    }
    this.userCountries = new Map(userCountries.map(({ username, countryId }) => [username, countryId]));
    for (const { username, countryId, points, avatarUrl } of contributions) {
      if (this.contributions.has(countryId)) {
        this.addContribution(countryId, username, points);
        this.setUserAvatar(username, avatarUrl);
      }
    }

    this.timer = this.createTimer();
    this.status = GAME_STATUS.RUNNING;
    this.doubleFinal = Boolean(doubleFinal);
    this.timer.resume(startTime, endTime);
    this.emit('start');
  }

  createTimer() {
    return new GameTimer(this.durationSeconds, {
      onTick: (remainingTime) => this.emit('tick', remainingTime),
      onFinish: () => this.finish(),
    });
  }

  // Qué país eligió cada espectador, en formato fácil de guardar: [{ username, countryId }]
  getUserCountries() {
    return [...this.userCountries].map(([username, countryId]) => ({ username, countryId }));
  }

  // Lo que aportó cada espectador, en formato fácil de guardar: [{ username, countryId, points, avatarUrl }]
  getContributions() {
    const list = [];
    for (const [countryId, byUser] of this.contributions) {
      for (const [username, points] of byUser) {
        list.push({ username, countryId, points, avatarUrl: this.userAvatars.get(username) || null });
      }
    }
    return list;
  }

  // Guarda la foto de perfil de un espectador (solo direcciones https://)
  setUserAvatar(username, avatarUrl) {
    if (typeof username === 'string' && typeof avatarUrl === 'string'
      && avatarUrl.startsWith('https://') && avatarUrl.length <= 2000) {
      this.userAvatars.set(username, avatarUrl);
    }
  }

  // Se llama sola cuando el tiempo llega a 0. También sirve para detener la partida antes de tiempo.
  finish() {
    if (this.status !== GAME_STATUS.RUNNING) {
      return;
    }

    this.timer.stop();
    this.status = GAME_STATUS.FINISHED;
    this.emit('end', this.getResult());
  }

  // Deja la partida lista para jugar otra vez: puntos a 0, sin espectadores, estado WAITING.
  reset() {
    if (this.timer) {
      this.timer.stop();
    }
    this.timer = null;

    for (const country of this.countries.values()) {
      country.points = 0;
      country.mvp = null;
    }
    this.clearPlayers();
    this.doubleFinal = false;
    this.status = GAME_STATUS.WAITING;
    this.emit('reset');
  }

  // Cambia la duración de las PRÓXIMAS partidas (la partida en curso no se ve afectada).
  setDuration(durationSeconds) {
    if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
      throw new Error(`Duración inválida: ${durationSeconds}`);
    }
    this.durationSeconds = durationSeconds;
    this.emit('settings');
  }

  // username (opcional): quién dio los puntos, para el MVP de cada país y el podio del ganador.
  // Devuelve los puntos que se sumaron de verdad (el doble si el X2 final está activo).
  addPoints(countryId, points, username) {
    if (!this.isRunning()) {
      throw new Error(`No se pueden sumar puntos: la partida está en estado ${this.status}`);
    }

    const country = this.countries.get(countryId);
    if (!country) {
      throw new Error(`País no encontrado: ${countryId}`);
    }
    if (!Number.isInteger(points) || points <= 0) {
      throw new Error(`Puntos inválidos: ${points}`);
    }

    const applied = this.isDoubleActive() ? points * DOUBLE_MULTIPLIER : points;
    country.points += applied;
    if (typeof username === 'string' && username !== '') {
      this.addContribution(countryId, username, applied);
    }
    this.emit('score', { countryId, points: applied, username });
    return applied;
  }

  // Suma lo que aportó un espectador y actualiza el MVP del país si lo supera
  addContribution(countryId, username, points) {
    const byUser = this.contributions.get(countryId);
    const total = (byUser.get(username) || 0) + points;
    byUser.set(username, total);

    const country = this.countries.get(countryId);
    if (!country.mvp || total > country.mvp.points || country.mvp.username === username) {
      country.mvp = { username, points: total };
    }
  }

  setUserCountry(username, countryId) {
    if (!this.countries.has(countryId)) {
      throw new Error(`País no encontrado: ${countryId}`);
    }
    this.userCountries.set(username, countryId);
  }

  // Devuelve el id del país que apoya el usuario, o null si todavía no eligió ninguno.
  getUserCountry(username) {
    return this.userCountries.get(username) || null;
  }

  getState() {
    // Devolvemos copias para que nadie pueda modificar los puntos desde fuera del motor
    return {
      gameStatus: this.status,
      durationSeconds: this.durationSeconds,
      gameStartTime: this.timer ? this.timer.startTime : null,
      gameEndTime: this.timer ? this.timer.endTime : null,
      remainingTime: this.timer ? this.timer.getRemainingSeconds() : this.durationSeconds,
      // Solo es true mientras el X2 está activo (antes no se revela: es sorpresa)
      doublePoints: this.isDoubleActive(),
      countries: [...this.countries.values()].map((country) => ({
        ...country,
        mvp: country.mvp
          ? { ...country.mvp, avatarUrl: this.userAvatars.get(country.mvp.username) || null }
          : null,
      })),
    };
  }

  // Los espectadores que más puntos aportaron en toda la partida (para el podio del ganador)
  getTopSupporters(limit = TOP_SUPPORTERS) {
    return this.getContributions()
      .sort((a, b) => b.points - a.points)
      .slice(0, limit)
      .map(({ username, countryId, points, avatarUrl }) => {
        const country = this.countries.get(countryId);
        return { username, avatarUrl, points, countryId, countryName: country.name, flag: country.flag, color: country.color };
      });
  }

  // Resultado de la partida: ranking de mayor a menor, ganador(es), si hubo empate y el podio de espectadores.
  getResult() {
    const ranking = this.getState().countries.sort((a, b) => b.points - a.points);
    const topPoints = ranking[0].points;

    // Si nadie sumó puntos no hay ganador.
    const winners = topPoints > 0 ? ranking.filter((country) => country.points === topPoints) : [];

    return {
      ranking,
      winners,
      isTie: winners.length > 1,
      topSupporters: this.getTopSupporters(),
    };
  }
}

module.exports = GameEngine;
module.exports.GAME_STATUS = GAME_STATUS;
