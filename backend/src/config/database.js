const dns = require('dns');
const mongoose = require('mongoose');

// Conecta con MongoDB usando la URI del .env (nunca escrita en el código).
async function connectDatabase() {
  // Opcional: algunos PCs (antivirus, VPN...) hacen que Node use un DNS que no resuelve
  // las direcciones "mongodb+srv://" (error querySrv ECONNREFUSED). Con DNS_SERVERS se usan otros DNS.
  if (process.env.DNS_SERVERS) {
    dns.setServers(process.env.DNS_SERVERS.split(',').map((server) => server.trim()));
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000, // si en 10 s no responde, falla con un error claro
  });
  console.log(`[DB] Conectado a MongoDB (base de datos: ${mongoose.connection.name})`);
}

module.exports = { connectDatabase };
