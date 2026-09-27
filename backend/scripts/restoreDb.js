// Restaura la base de datos desde una copia hecha con "npm run backup".
// ¡CUIDADO! Borra los datos actuales de cada colección y pone los de la copia.
//
// Uso:  npm run restore -- backups/tikbattle-2026-09-27_03-00.json.gz --confirm
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const zlib = require('zlib');
const mongoose = require('mongoose');
const { connectDatabase } = require('../src/config/database');

const { EJSON } = mongoose.mongo.BSON;

async function restore() {
  const [file, flag] = process.argv.slice(2);
  if (!file || flag !== '--confirm') {
    console.error('Uso: npm run restore -- <archivo.json.gz> --confirm');
    console.error('Borra los datos actuales y pone los de la copia. Apaga el servidor antes de restaurar.');
    process.exitCode = 1;
    return;
  }

  const backup = EJSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'), { relaxed: false });
  console.log(`[RESTORE] Copia del ${new Date(backup.createdAt).toLocaleString()} (base de datos: ${backup.database})`);

  await connectDatabase();
  const db = mongoose.connection.db;
  for (const [name, docs] of Object.entries(backup.collections)) {
    await db.collection(name).deleteMany({});
    if (docs.length > 0) {
      await db.collection(name).insertMany(docs);
    }
    console.log(`  ${name}: ${docs.length} documentos restaurados`);
  }
  console.log('[RESTORE] Listo. Ya puedes arrancar el servidor.');
}

restore()
  .catch((error) => {
    console.error('[RESTORE] Error:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
