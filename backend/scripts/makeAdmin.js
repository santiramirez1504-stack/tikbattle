// Da el rol de ADMINISTRADOR a una cuenta existente. Uso (desde tiktok-battle/backend):
//   npm run make-admin -- email@ejemplo.com
// Se hace desde la terminal (no desde la web) para que nadie pueda hacerse administrador a sí mismo.
// Después, un administrador puede nombrar a otros desde el panel.
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDatabase } = require('../src/config/database');
const User = require('../src/models/User');

async function main() {
  const email = (process.argv[2] || '').toLowerCase().trim();
  if (!email) {
    console.log('Uso: npm run make-admin -- email@ejemplo.com');
    process.exit(1);
  }

  await connectDatabase();
  const user = await User.findOneAndUpdate(
    { email },
    { $set: { role: User.USER_ROLES.ADMIN, isBlocked: false } },
    { new: true }
  );

  if (!user) {
    console.log(`No existe ninguna cuenta con el email ${email}. Regístrate primero en el dashboard.`);
  } else {
    console.log(`✅ ${user.name} <${user.email}> ahora es ADMINISTRADOR.`);
    console.log('   Vuelve a cargar el dashboard: verás el enlace "Panel de administrador".');
  }
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Error:', error.message);
  await mongoose.disconnect();
  process.exit(1);
});
