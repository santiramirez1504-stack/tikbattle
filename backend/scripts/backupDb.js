// Copia de seguridad de toda la base de datos en un archivo comprimido.
// El plan gratis de MongoDB Atlas no hace copias automáticas: en el servidor se ejecuta cada día (cron).
//
// Uso:  npm run backup
// Crea: backups/tikbattle-AAAA-MM-DD_HH-MM.json.gz  y borra las más viejas (se quedan BACKUP_KEEP, por defecto 7)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const mongoose = require('mongoose');
const { connectDatabase } = require('../src/config/database');

const { EJSON } = mongoose.mongo.BSON; // JSON que conserva los tipos de MongoDB (ObjectId, fechas...)
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const BACKUP_KEEP = Number(process.env.BACKUP_KEEP) || 7;
const FILE_PATTERN = /^tikbattle-.*\.json\.gz$/;

async function backup() {
  await connectDatabase();
  const db = mongoose.connection.db;

  const collections = {};
  let total = 0;
  for (const { name } of await db.listCollections().toArray()) {
    const docs = await db.collection(name).find().toArray();
    collections[name] = docs;
    total += docs.length;
    console.log(`  ${name}: ${docs.length} documentos`);
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const file = path.join(BACKUP_DIR, `tikbattle-${stamp}.json.gz`);
  const content = EJSON.stringify({ createdAt: new Date(), database: db.databaseName, collections }, { relaxed: false });
  fs.writeFileSync(file, zlib.gzipSync(content));
  console.log(`[BACKUP] ${total} documentos guardados en ${file}`);

  // Borra las copias más viejas
  const old = fs.readdirSync(BACKUP_DIR).filter((name) => FILE_PATTERN.test(name)).sort().reverse().slice(BACKUP_KEEP);
  for (const name of old) {
    fs.unlinkSync(path.join(BACKUP_DIR, name));
    console.log(`[BACKUP] Borrada copia vieja: ${name}`);
  }
}

backup()
  .catch((error) => {
    console.error('[BACKUP] Error:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
