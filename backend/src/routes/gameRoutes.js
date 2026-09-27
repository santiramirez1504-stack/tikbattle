const express = require('express');
const gameController = require('../controllers/gameController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// Todo requiere sesión: cada streamer solo ve y controla su propia sala.
// (El overlay no usa estas rutas: recibe el estado por WebSocket con la clave de su URL.)
router.use(requireAuth);

router.get('/state', gameController.getState);
router.post('/start', gameController.startGame);
router.post('/reset', gameController.resetGame);
router.post('/new', gameController.newGame);
router.post('/stop', gameController.stopGame);
router.get('/config', gameController.getConfig);
router.put('/config', gameController.saveConfig);
router.get('/history', gameController.getHistory);
router.delete('/history/:id', gameController.deleteHistoryItem);
router.get('/overlay', gameController.getOverlay);
router.post('/overlay/regenerate', gameController.regenerateOverlay);

module.exports = router;
