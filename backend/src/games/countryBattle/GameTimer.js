// Cuenta regresiva de una partida. Avisa cada segundo (onTick) y cuando llega a cero (onFinish).
class GameTimer {
  constructor(durationSeconds, { onTick, onFinish }) {
    this.durationSeconds = durationSeconds;
    this.onTick = onTick;
    this.onFinish = onFinish;
    this.startTime = null;
    this.endTime = null;
    this.intervalId = null;
  }

  start() {
    const now = Date.now();
    this.resume(now, now + this.durationSeconds * 1000);
  }

  // Continúa una cuenta regresiva que empezó antes (ej. partida recuperada tras reiniciar el servidor).
  // Si la hora de fin ya pasó, termina en el siguiente segundo.
  resume(startTime, endTime) {
    this.startTime = startTime;
    this.endTime = endTime;

    this.intervalId = setInterval(() => {
      const remaining = this.getRemainingSeconds();
      this.onTick(remaining);

      if (remaining <= 0) {
        this.stop();
        this.onFinish();
      }
    }, 1000);
  }

  stop() {
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  // Se calcula con la hora de fin (y no restando 1 cada segundo) para que el tiempo no se desfase.
  getRemainingSeconds() {
    if (this.endTime === null) {
      return this.durationSeconds;
    }
    return Math.max(0, Math.round((this.endTime - Date.now()) / 1000));
  }
}

module.exports = GameTimer;
