//PRESTAMOS-BACKEND/routes/capitalRoutes.js
const express = require('express');
const router = express.Router();
const capitalController = require('../controllers/capitalController');

// GET /api/capital -> Obtener montos actuales
router.get('/', capitalController.getCapital);

// POST /api/capital -> Actualizar los montos
router.post('/', capitalController.updateCapital);

module.exports = router;