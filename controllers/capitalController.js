//PRESTAMOS-BACKEND/controllers/capitalController.js

const { getDBConnection } = require('../database/database');

// Obtener los montos actuales de capital
exports.getCapital = async (req, res) => {
    try {
        const db = await getDBConnection();
        const rows = await db.all('SELECT * FROM capital');
        // Convertir el array de resultados en un objeto fácil de usar
        const capital = rows.reduce((acc, row) => {
            acc[row.source] = row.amount;
            return acc;
        }, { nequi: 0, efectivo: 0 }); // Valores por defecto

        res.status(200).json(capital);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener el capital', details: error.message });
    }
};

// Actualizar o crear los montos de capital
exports.updateCapital = async (req, res) => {
    const { nequi, efectivo } = req.body;
    try {
        const db = await getDBConnection();
        // Usamos una sentencia "UPSERT" para insertar si no existe, o actualizar si ya existe.
        const sql = `
            INSERT INTO capital (source, amount) VALUES (?, ?)
            ON CONFLICT(source) DO UPDATE SET amount = excluded.amount;
        `;
        await db.run(sql, ['nequi', nequi]);
        await db.run(sql, ['efectivo', efectivo]);

        res.status(200).json({ message: 'Capital actualizado correctamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar el capital', details: error.message });
    }
};