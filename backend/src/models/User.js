const mongoose = require('mongoose');

const USER_ROLES = {
  USER: 'USER',   // streamer: administra sus propios juegos
  ADMIN: 'ADMIN', // administra la plataforma (Módulo 15)
};

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    // Solo se guarda el hash (nunca la contraseña real). select: false -> no se lee salvo que se pida.
    password: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(USER_ROLES), default: USER_ROLES.USER },
    // Un administrador puede bloquear una cuenta: no puede iniciar sesión ni usar la plataforma
    isBlocked: { type: Boolean, default: false },
    // Clave secreta de la URL del overlay. sparse: permite usuarios antiguos que todavía no la tienen.
    overlayKey: { type: String, unique: true, sparse: true, select: false },
  },
  { timestamps: true } // añade createdAt y updatedAt automáticamente
);

// Al convertir a JSON (respuestas de la API) nunca se envía la contraseña
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    delete ret.password;
    delete ret.overlayKey;
    return ret;
  },
});

const User = mongoose.model('User', userSchema);

module.exports = User;
module.exports.USER_ROLES = USER_ROLES;
