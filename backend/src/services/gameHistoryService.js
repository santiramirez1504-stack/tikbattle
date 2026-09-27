const mongoose = require('mongoose');
const GameSession = require('../models/GameSession');

const MAX_HISTORY_ITEMS = 50;

// Guarda una partida terminada en el historial del streamer
async function saveFinishedGame({ userId, state, result, endedBy, participants }) {
  const endedAt = new Date();
  const startedAt = new Date(state.gameStartTime);

  return GameSession.create({
    user: userId,
    startedAt,
    endedAt,
    durationSeconds: state.durationSeconds,
    // Máximo la duración configurada (si terminó con el servidor apagado, no cuenta el tiempo de apagado)
    playedSeconds: Math.min(Math.round((endedAt - startedAt) / 1000), state.durationSeconds),
    endedBy,
    results: result.ranking.map(({ name, color, flag, points }) => ({ name, color, flag, points })),
    winners: result.winners.map((country) => country.name),
    isTie: result.isTie,
    participants,
    topSupporters: (result.topSupporters || []).map(({ username, countryName, flag, points }) => ({ username, countryName, flag, points })),
  });
}

// Últimas partidas del streamer, de la más reciente a la más antigua
async function getHistory(userId, limit) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), MAX_HISTORY_ITEMS);
  const sessions = await GameSession.find({ user: userId })
    .sort({ endedAt: -1 })
    .limit(safeLimit)
    .lean();

  return sessions.map((session) => ({
    id: session._id,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    durationSeconds: session.durationSeconds,
    playedSeconds: session.playedSeconds,
    endedBy: session.endedBy,
    results: session.results,
    winners: session.winners,
    isTie: session.isTie,
    participants: session.participants,
    topSupporters: session.topSupporters || [],
  }));
}

// Borra una partida del historial. Solo si es de ese usuario: nadie puede borrar partidas ajenas.
// Devuelve true si se borró, false si no existe (o no es suya).
async function deleteSession(userId, sessionId) {
  if (!mongoose.isValidObjectId(sessionId)) {
    return false;
  }
  const { deletedCount } = await GameSession.deleteOne({ _id: sessionId, user: userId });
  return deletedCount === 1;
}

module.exports = { saveFinishedGame, getHistory, deleteSession };
