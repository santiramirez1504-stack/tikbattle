const mongoose = require('mongoose');
const { OVERLAY_SIZE_KEYS, DEFAULT_SIZE } = require('../utils/overlaySizes');

// Configuración del juego "Batalla de Países" de cada streamer (una por usuario).
const countrySchema = new mongoose.Schema(
  {
    id: { type: String, required: true },      // ej. "republica-dominicana" (se genera a partir del nombre)
    name: { type: String, required: true },    // ej. "República Dominicana" (lo que se ve en el overlay)
    command: { type: String, required: true }, // lo que escriben los espectadores en el chat
    color: { type: String, required: true },   // ej. "#2f7df6"
    flag: { type: String, default: null },     // código de bandera, ej. "cu" (null = sin bandera)
  },
  { _id: false }
);

const giftSchema = new mongoose.Schema(
  {
    giftId: { type: Number, required: true }, // id real del regalo en TikTok
    name: { type: String, required: true },
    points: { type: Number, required: true },
  },
  { _id: false }
);

// Tamaño de cada parte del overlay, en % (100 = normal). Ej: { flags: 80, points: 120, ... }
const overlaySizesSchema = new mongoose.Schema(
  Object.fromEntries(OVERLAY_SIZE_KEYS.map((key) => [key, { type: Number, default: DEFAULT_SIZE }])),
  { _id: false }
);

const gameConfigSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    durationSeconds: { type: Number, required: true },
    autoRestartSeconds: { type: Number, required: true, default: 0 },
    countries: { type: [countrySchema], required: true },
    gifts: { type: [giftSchema], default: [] },
    overlaySizes: { type: overlaySizesSchema, default: () => ({}) },
    // Qué se muestra en el overlay. Ej: { showStatus: false } oculta la barra de mensaje
    overlayOptions: {
      showStatus: { type: Boolean, default: true },
      showGiftAlerts: { type: Boolean, default: true },
      flagOpacity: { type: Number, default: 100 }, // opacidad de las banderas, en % (20 a 100)
      doubleFinal: { type: Boolean, default: true }, // false = nunca sale el X2 sorpresa
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GameConfig', gameConfigSchema);
