const express = require('express');
const simulationController = require('../controllers/simulationController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// Requiere sesión: los eventos simulados van a la sala de quien los envía
router.use(requireAuth);

router.post('/chat', simulationController.simulateChat);
router.post('/gift', simulationController.simulateGift);

module.exports = router;
