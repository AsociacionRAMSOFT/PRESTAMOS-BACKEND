// PRESTAMOS-BACKEND/server.js
const express = require('express');
const cors = require('cors');
const { initializeDatabase } = require('./database/database');
const prestamosRoutes = require('./routes/prestamosRoutes');
const notificationService = require('./services/notificationService'); // NUEVA IMPORTACIÓN
const capitalRoutes = require('./routes/capitalRoutes'); // Asegúrate de tener esta importación

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Rutas de la API
app.use('/api/prestamos', prestamosRoutes);
app.use('/api/capital', capitalRoutes);

// Ruta de bienvenida
app.get('/', (req, res) => {
    res.send('API de Préstamos funcionando correctamente!');
});

// Función para iniciar el servidor
async function startServer() {
    try {
        await initializeDatabase();
        app.listen(PORT, () => {
            console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
            notificationService.startScheduler(); // Iniciar el programador de notificaciones
        });
    } catch (error) {
        console.error("Error al iniciar el servidor:", error);
        process.exit(1);
    }
}

startServer();