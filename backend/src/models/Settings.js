const mongoose = require('mongoose');

// Configuración global de la plataforma (un único documento, con key "global").
// La cambia un administrador desde el panel.
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    // Aviso que ven todos los streamers en su dashboard (vacío = sin aviso)
    announcement: { type: String, default: '', maxlength: 300 },
    // false = no se pueden crear cuentas nuevas (las existentes siguen funcionando)
    registrationsOpen: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
