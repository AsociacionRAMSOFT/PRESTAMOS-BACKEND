// PRESTAMOS-BACKEND/controllers/prestamosController.js
const { getDBConnection } = require('../database/database');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');

// Función auxiliar para obtener un cliente por nombre
async function getClienteId(db, cliente) {
    const clienteExistente = await db.get('SELECT id FROM clientes WHERE nombre = ?', [cliente]);
    return clienteExistente ? clienteExistente.id : null;
}

// Función auxiliar para crear un cliente
async function createCliente(db, clienteData) {
    const { nombre, direccion, telefono, foto_cliente_url, foto_cedula_url } = clienteData;
    const result = await db.run(
        'INSERT INTO clientes (nombre, direccion, telefono, foto_cliente_url, foto_cedula_url) VALUES (?, ?, ?, ?, ?)',
        [nombre, direccion, telefono, foto_cliente_url, foto_cedula_url]
    );
    return result.lastID;
}

// Configuración de Multer
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const clienteFolder = path.join('uploads', req.body.nombre);
        try {
            await fs.mkdir(clienteFolder, { recursive: true });
            cb(null, clienteFolder);
        } catch (error) {
            cb(error, null);
        }
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const fileName = `${file.fieldname}-${Date.now()}${ext}`;
        cb(null, fileName);
    },
});

exports.uploadMiddleware = multer({ storage: storage }).fields([
    { name: 'foto_cliente', maxCount: 1 },
    { name: 'foto_cedula', maxCount: 1 },
]);

exports.createPrestamoHandler = async (req, res) => {
    const { nombre, direccion, telefono, monto_prestado, monto_total, saldo_restante, fecha, plazo, interes, source, tipo_plazo } = req.body;
    const fotoClientePath = req.files['foto_cliente'] ? req.files['foto_cliente'][0].path : null;
    const fotoCedulaPath = req.files['foto_cedula'] ? req.files['foto_cedula'][0].path : null;

    if (!nombre || monto_prestado <= 0 || !plazo || !interes) {
        return res.status(400).json({ error: 'Faltan campos obligatorios o son inválidos.' });
    }
    
    try {
        const db = await getDBConnection();
        await db.run('BEGIN TRANSACTION');
        
        let cliente_id = await getClienteId(db, nombre);
        if (!cliente_id) {
            const clienteData = {
                nombre,
                direccion,
                telefono,
                foto_cliente_url: fotoClientePath,
                foto_cedula_url: fotoCedulaPath
            };
            cliente_id = await createCliente(db, clienteData);
        } else {
            await db.run(
                'UPDATE clientes SET foto_cliente_url = ?, foto_cedula_url = ? WHERE id = ?',
                [fotoClientePath, fotoCedulaPath, cliente_id]
            );
        }

        const fechaInicio = new Date(fecha);
        const fechaVencimiento = new Date(fechaInicio.setDate(fechaInicio.getDate() + parseInt(plazo, 10))).toISOString().split('T')[0];
        
        const result = await db.run(
            `INSERT INTO prestamos (cliente_id, monto_prestado, monto_total, saldo_restante, fecha, plazo, interes, fecha_vencimiento, source, estado, pagado, tipo_plazo) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'debe', 0, ?)`,
            [cliente_id, monto_prestado, monto_total, saldo_restante, fecha, plazo, interes, fechaVencimiento, source, tipo_plazo]
        );
        
        await db.run('COMMIT');
        res.status(201).json({ message: 'Préstamo y archivos registrados correctamente.', id: result.lastID });

    } catch (error) {
        const db = await getDBConnection();
        await db.run('ROLLBACK');
        res.status(500).json({ error: 'Error al crear el préstamo', details: error.message });
    }
};

exports.getCapital = async (req, res) => {
    try {
        const db = await getDBConnection();
        const rows = await db.all('SELECT * FROM capital');
        const capital = rows.reduce((acc, row) => {
            acc[row.source] = row.amount;
            return acc;
        }, { nequi: 0, efectivo: 0 });
        res.status(200).json(capital);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener el capital', details: error.message });
    }
};

exports.updateCapital = async (req, res) => {
    const { nequi, efectivo } = req.body;
    try {
        const db = await getDBConnection();
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

exports.getAllRegistros = async (req, res) => {
    try {
        const db = await getDBConnection();
        const prestamos = await db.all(`
            SELECT 
                p.*, 
                c.nombre AS cliente, 
                c.direccion AS cliente_direccion, 
                c.telefono AS cliente_telefono 
            FROM prestamos p
            JOIN clientes c ON p.cliente_id = c.id
            ORDER BY p.fecha DESC
        `);
        
        if (prestamos.length === 0) {
            return res.status(200).json([]);
        }

        const prestamoIds = prestamos.map(p => p.id);
        const placeholders = prestamoIds.map(() => '?').join(',');
        const pagos = await db.all(`SELECT * FROM pagos WHERE prestamo_id IN (${placeholders}) ORDER BY fecha ASC`, prestamoIds);

        const pagosMap = new Map();
        for (const pago of pagos) {
            if (!pagosMap.has(pago.prestamo_id)) {
                pagosMap.set(pago.prestamo_id, []);
            }
            pagosMap.get(pago.prestamo_id).push(pago);
        }

        const resultado = prestamos.map(prestamo => ({
            ...prestamo,
            pagos: pagosMap.get(prestamo.id) || []
        }));

        res.status(200).json(resultado);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener los registros', details: error.message });
    }
};

exports.getPrestamosDebe = async (req, res) => {
    try {
        const db = await getDBConnection();
        const fechaFiltro = req.query.fecha || new Date().toISOString().split('T')[0];
        const fechaFiltroObj = new Date(fechaFiltro);
        
        const prestamosDeudores = await db.all(`
            SELECT p.*, c.nombre AS cliente, c.telefono, c.direccion
            FROM prestamos p
            JOIN clientes c ON p.cliente_id = c.id
            WHERE p.estado = 'debe' AND p.fecha_vencimiento >= ?
        `, [fechaFiltro]);

        const prestamosFiltrados = prestamosDeudores.filter(prestamo => {
            const fechaInicio = new Date(prestamo.fecha);
            
            if (prestamo.tipo_plazo === 'diario') {
                return fechaFiltroObj >= fechaInicio;
            }

            if (prestamo.tipo_plazo === 'semanal') {
                const diffTime = fechaFiltroObj.getTime() - fechaInicio.getTime();
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                
                return diffDays > 0 && diffDays % 7 === 0;
            }

            return false;
        });

        res.status(200).json(prestamosFiltrados);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener préstamos activos", details: error.message });
    }
};

exports.getClientesPagados = async (req, res) => {
    try {
        const db = await getDBConnection();
        const clientes = await db.all(`
            SELECT DISTINCT c.nombre as cliente
            FROM prestamos p
            JOIN clientes c ON p.cliente_id = c.id
            WHERE p.estado = 'pagado'
        `);
        res.status(200).json(clientes);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener clientes que han pagado", details: error.message });
    }
};

exports.getPrestamoById = async (req, res) => {
    try {
        const { id } = req.params;
        const db = await getDBConnection();
        const prestamo = await db.get(`
            SELECT p.*, c.nombre as cliente
            FROM prestamos p
            JOIN clientes c ON p.cliente_id = c.id
            WHERE p.id = ?
        `, [id]);

        if (prestamo) {
            prestamo.pagos = await db.all('SELECT * FROM pagos WHERE prestamo_id = ? ORDER BY fecha ASC', [id]);
            res.status(200).json(prestamo);
        } else {
            res.status(404).json({ message: 'Préstamo no encontrado' });
        }
    } catch (error) {
        res.status(500).json({ error: "Error al obtener el préstamo", details: error.message });
    }
};

exports.deletePrestamo = async (req, res) => {
    try {
        const { id } = req.params;
        const db = await getDBConnection();
        const result = await db.run('DELETE FROM prestamos WHERE id = ?', [id]);
        
        if (result.changes > 0) {
            res.status(200).json({ message: 'Préstamo eliminado correctamente' });
        } else {
            res.status(404).json({ message: 'Préstamo no encontrado' });
        }
    } catch (error) {
        res.status(500).json({ error: "Error al eliminar el préstamo", details: error.message });
    }
};

exports.createPago = async (req, res) => {
    const { id: prestamo_id } = req.params;
    const { monto, fecha, source } = req.body;

    if (isNaN(monto) || monto < 0) {
        return res.status(400).json({ error: 'El monto no es válido.' });
    }

    if (monto > 0 && !['nequi', 'efectivo'].includes(source)) {
        return res.status(400).json({ error: 'El destino del capital no es válido.' });
    }

    try {
        const db = await getDBConnection();
        await db.run('BEGIN TRANSACTION');

        const prestamo = await db.get('SELECT saldo_restante FROM prestamos WHERE id = ?', [prestamo_id]);
        if (!prestamo) {
            await db.run('ROLLBACK');
            return res.status(404).json({ error: 'El préstamo no fue encontrado.' });
        }
        
        if (monto > 0) {
            const capitalSql = `
                INSERT INTO capital (source, amount) VALUES (?, ?)
                ON CONFLICT(source) DO UPDATE SET amount = amount + excluded.amount;
            `;
            await db.run(capitalSql, [source, monto]);
        }

        const nuevoSaldo = prestamo.saldo_restante - monto;
        const nuevoEstado = nuevoSaldo <= 0 ? 'pagado' : 'debe';
        const pagado = nuevoSaldo <= 0 ? 1 : 0;
        
        await db.run(
            'INSERT INTO pagos (prestamo_id, monto, fecha, destination) VALUES (?, ?, ?, ?)',
            [prestamo_id, monto, fecha, source || 'ninguno']
        );
        
        if (monto > 0) {
            await db.run(
                'UPDATE prestamos SET saldo_restante = ?, estado = ?, pagado = ? WHERE id = ?',
                [Math.max(0, nuevoSaldo), nuevoEstado, pagado, prestamo_id]
            );
        }

        await db.run('COMMIT');
        res.status(201).json({ message: 'Pago registrado con éxito', nuevoSaldo: Math.max(0, nuevoSaldo) });
    
    } catch (error) {
        const db = await getDBConnection();
        await db.run('ROLLBACK'); 
        res.status(500).json({ error: 'Error al registrar el pago', details: error.message });
    }
};

exports.getReporteDiario = async (req, res) => {
    try {
        const db = await getDBConnection();
        const fechaFiltro = req.query.fecha || new Date().toISOString().split('T')[0];

        const pagosHoy = await db.all(`
            SELECT pa.monto, pa.fecha, pa.destination, pa.prestamo_id,
                   p.monto_total, p.saldo_restante, p.fecha AS fecha_prestamo,
                   c.nombre AS cliente, p.tipo_plazo
            FROM pagos pa
            JOIN prestamos p ON pa.prestamo_id = p.id
            JOIN clientes c ON p.cliente_id = c.id
            WHERE pa.fecha = ?
        `, [fechaFiltro]);

        const prestamosDeudores = await db.all(`
            SELECT p.*, c.nombre AS cliente, c.telefono, c.direccion
            FROM prestamos p
            JOIN clientes c ON p.cliente_id = c.id
            WHERE p.estado = 'debe' AND p.fecha_vencimiento >= ?
        `, [fechaFiltro]);

        const deudasDiariasSinPago = prestamosDeudores.filter(p => 
            p.tipo_plazo === 'diario' && p.fecha === fechaFiltro
        );

        res.status(200).json({
            deudasDiarias: deudasDiariasSinPago,
            pagosHoy: pagosHoy
        });
    } catch (error) {
        res.status(500).json({ error: "Error al generar el reporte diario", details: error.message });
    }
};

exports.getReporteGanancias = async (req, res) => {
    try {
        const db = await getDBConnection();
        const { fechaInicio, fechaFin } = req.query;
        let queryPrestado = `SELECT SUM(monto_prestado) AS total FROM prestamos`;
        let queryGanado = `SELECT SUM(monto_total - monto_prestado) AS total FROM prestamos WHERE estado = 'pagado'`;
        
        const params = [];
        
        if (fechaInicio && fechaFin) {
            queryPrestado += ` WHERE fecha BETWEEN ? AND ?`;
            queryGanado += ` AND fecha BETWEEN ? AND ?`;
            params.push(fechaInicio, fechaFin, fechaInicio, fechaFin);
        }

        const totalPrestado = await db.get(queryPrestado, params.slice(0, 2));
        const totalGanado = await db.get(queryGanado, params.slice(2, 4));

        res.status(200).json({
            total_prestado: totalPrestado.total || 0,
            total_ganado: totalGanado.total || 0
        });

    } catch (error) {
        res.status(500).json({ error: "Error al obtener el reporte de ganancias", details: error.message });
    }
};