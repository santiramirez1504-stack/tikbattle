const express = require('express');
const adminController = require('../controllers/adminController');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

// TODO el panel exige sesión Y rol de administrador (se comprueba en cada petición)
router.use(requireAuth, requireAdmin);

router.get('/stats', adminController.getStats);
router.get('/rooms', adminController.getRooms);
router.get('/users', adminController.listUsers);
router.patch('/users/:id', adminController.updateUser);
router.get('/games', adminController.listGames);
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);

module.exports = router;
