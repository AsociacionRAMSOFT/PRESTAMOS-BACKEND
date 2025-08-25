// PRESTAMOS-BACKEND/routes/prestamosRoutes.js
const express = require('express');
const router = express.Router();
const prestamosController = require('../controllers/prestamosController');

// --- API Endpoints ---
// La ruta de creación de préstamos ahora usa el middleware de Multer
router.post('/', prestamosController.uploadMiddleware, prestamosController.createPrestamoHandler);

router.get('/', prestamosController.getAllRegistros);
router.get('/debe', prestamosController.getPrestamosDebe);
router.get('/pagados/clientes', prestamosController.getClientesPagados);
router.get('/:id', prestamosController.getPrestamoById);
router.delete('/:id', prestamosController.deletePrestamo);
router.post('/:id/pagos', prestamosController.createPago);

// --- Rutas para Reportes ---
router.get('/reporte/diario', prestamosController.getReporteDiario);
router.get('/reporte/ganancias', prestamosController.getReporteGanancias);

module.exports = router;