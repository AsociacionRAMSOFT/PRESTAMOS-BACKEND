// PRESTAMOS-BACKEND/controllers/capitalController.js

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

// Obtener el historial de capital con opción de filtrado por fecha
exports.getCapitalHistory = async (req, res) => {
    const { startDate, endDate } = req.query;
    try {
        const db = await getDBConnection();
        let query = 'SELECT * FROM capital_history';
        const params = [];

        // Lógica de filtrado por fecha
        if (startDate && endDate) {
            query += ' WHERE fecha BETWEEN ? AND ?';
            params.push(startDate, endDate);
        } else if (startDate) {
            query += ' WHERE fecha >= ?';
            params.push(startDate);
        } else if (endDate) {
            query += ' WHERE fecha <= ?';
            params.push(endDate);
        }
        
        query += ' ORDER BY fecha DESC';

        const history = await db.all(query, params);
        res.status(200).json(history);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener el historial de capital', details: error.message });
    }
};

// Actualizar o crear los montos de capital y guardar el historial
exports.updateCapital = async (req, res) => {
    const { nequi, efectivo } = req.body;
    try {
        const db = await getDBConnection();

        // Iniciar una transacción para asegurar que ambas operaciones se completen
        await db.run('BEGIN TRANSACTION;');

        // 1. Actualizar la tabla 'capital' (UPSERT)
        const sql = `
            INSERT INTO capital (source, amount) VALUES (?, ?)
            ON CONFLICT(source) DO UPDATE SET amount = excluded.amount;
        `;
        await db.run(sql, ['nequi', nequi]);
        await db.run(sql, ['efectivo', efectivo]);

        // 2. Insertar un registro en la nueva tabla 'capital_history'
        const fecha = new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD
        const sqlHistory = `
            INSERT INTO capital_history (source, amount, fecha) VALUES (?, ?, ?);
        `;
        await db.run(sqlHistory, ['nequi', nequi, fecha]);
        await db.run(sqlHistory, ['efectivo', efectivo, fecha]);

        // Finalizar la transacción
        await db.run('COMMIT;');

        res.status(200).json({ message: 'Capital actualizado y guardado correctamente' });
    } catch (error) {
        // Revertir la transacción si algo sale mal
        await db.run('ROLLBACK;');
        res.status(500).json({ error: 'Error al actualizar el capital', details: error.message });
    }
};
