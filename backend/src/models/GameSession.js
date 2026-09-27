const mongoose = require('mongoose');

// Una partida terminada (historial). Se guarda al final de cada partida.
const resultSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    color: { type: String, required: true },
    flag: { type: String, default: null },
    points: { type: Number, required: true },
  },
  { _id: false }
);

// Espectadores que más puntos aportaron (podio)
const topSupporterSchema = new mongoose.Schema(
  {
    username: { type: String, required: true },
    countryName: { type: String, required: true },
    flag: { type: String, default: null },
    points: { type: Number, required: true },
  },
  { _id: false }
);

const gameSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    game: { type: String, required: true, default: 'country-battle' }, // preparado para más juegos
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, required: true },
    durationSeconds: { type: Number, required: true }, // duración configurada
    playedSeconds: { type: Number, required: true },   // lo que duró de verdad (menos si se detuvo antes)
    endedBy: { type: String, enum: ['TIMER', 'MANUAL'], required: true },
    results: { type: [resultSchema], required: true }, // países de mayor a menor puntuación
    winners: { type: [String], default: [] },
    isTie: { type: Boolean, default: false },
    participants: { type: Number, default: 0 },        // espectadores distintos que eligieron país
    topSupporters: { type: [topSupporterSchema], default: [] },
  },
  { timestamps: true }
);

// Acelera la consulta "últimas partidas de este usuario"
gameSessionSchema.index({ user: 1, endedAt: -1 });

module.exports = mongoose.model('GameSession', gameSessionSchema);
