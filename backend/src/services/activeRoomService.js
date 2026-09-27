const ActiveRoom = require('../models/ActiveRoom');

// Guarda la "foto" de una sala. Si no hay nada que recuperar (sin partida ni TikTok), la borra.
async function saveSnapshot(userId, { game, tiktokUsername }) {
  if (!game && !tiktokUsername) {
    await ActiveRoom.deleteOne({ user: userId });
    return;
  }
  await ActiveRoom.updateOne(
    { user: userId },
    { $set: { game, tiktokUsername } },
    { upsert: true, runValidators: true }
  );
}

// Todas las salas que hay que recuperar al arrancar el servidor
async function findAllSnapshots() {
  const docs = await ActiveRoom.find().lean();
  return docs.map((doc) => ({
    userId: String(doc.user),
    game: doc.game || null,
    tiktokUsername: doc.tiktokUsername || null,
  }));
}

module.exports = { saveSnapshot, findAllSnapshots };
