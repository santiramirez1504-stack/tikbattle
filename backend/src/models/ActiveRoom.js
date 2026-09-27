const mongoose = require('mongoose');

// "Foto" de la sala de un streamer mientras tiene algo que no se debe perder si el servidor se reinicia:
// una partida en curso y/o una conexión con TikTok. Cuando no queda nada de eso, el documento se borra.
const countrySchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    command: { type: String, required: true },
    color: { type: String, required: true },
    flag: { type: String, default: null },
    points: { type: Number, required: true },
  },
  { _id: false }
);

const giftSchema = new mongoose.Schema(
  {
    giftId: { type: Number, required: true },
    name: { type: String, required: true },
    points: { type: Number, required: true },
  },
  { _id: false }
);

const supporterSchema = new mongoose.Schema(
  {
    username: { type: String, required: true },
    countryId: { type: String, required: true },
  },
  { _id: false }
);

// Puntos que aportó cada espectador a cada país (para el MVP y el podio)
const contributionSchema = new mongoose.Schema(
  {
    username: { type: String, required: true },
    countryId: { type: String, required: true },
    points: { type: Number, required: true },
  },
  { _id: false }
);

const runningGameSchema = new mongoose.Schema(
  {
    durationSeconds: { type: Number, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    countries: { type: [countrySchema], required: true }, // con sus puntos
    gifts: { type: [giftSchema], default: [] },
    userCountries: { type: [supporterSchema], default: [] }, // qué país eligió cada espectador
    contributions: { type: [contributionSchema], default: [] },
  },
  { _id: false }
);

const activeRoomSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    game: { type: runningGameSchema, default: null },      // null si no hay partida en curso
    tiktokUsername: { type: String, default: null },       // null si no estaba conectado a TikTok
  },
  { timestamps: true }
);

module.exports = mongoose.model('ActiveRoom', activeRoomSchema);
