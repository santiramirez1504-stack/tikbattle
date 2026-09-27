const express = require('express');
const tiktokController = require('../controllers/tiktokController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// Todas las rutas de TikTok requieren sesión iniciada
router.use(requireAuth);

router.post('/connect', tiktokController.connect);
router.post('/disconnect', tiktokController.disconnect);
router.get('/status', tiktokController.getStatus);
router.get('/gifts', tiktokController.getGifts);

module.exports = router;
