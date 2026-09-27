const express = require('express');
const settingsService = require('../services/settingsService');

const router = express.Router();

// GET /api/settings/public -> lo que cualquiera puede ver: el aviso global y si el registro está abierto
// (lo usan la página de login y el dashboard)
router.get('/public', async (req, res, next) => {
  try {
    res.json(await settingsService.getSettings());
  } catch (error) {
    next(error);
  }
});

module.exports = router;
