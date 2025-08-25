-- PRESTAMOS-BACKEND/database/schema.sql
-- Este archivo se ejecutará una vez para crear las tablas si no existen.

-- NUEVA TABLA: Clientes
CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    direccion TEXT,
    telefono TEXT,
    foto_cliente_url TEXT,
    foto_cedula_url TEXT
);

-- Tabla de Préstamos (MODIFICADA)
CREATE TABLE IF NOT EXISTS prestamos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    monto_prestado REAL NOT NULL,
    monto_total REAL NOT NULL,
    saldo_restante REAL NOT NULL,
    fecha TEXT NOT NULL,
    plazo INTEGER NOT NULL,
    interes REAL NOT NULL,
    fecha_vencimiento TEXT,
    tipo_plazo TEXT NOT NULL DEFAULT 'diario',
    source TEXT NOT NULL DEFAULT 'efectivo' CHECK(source IN ('nequi', 'efectivo')),
    estado TEXT NOT NULL CHECK(estado IN ('debe', 'pagado')),
    pagado INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
);

-- Tabla de Pagos (MODIFICADA)
CREATE TABLE IF NOT EXISTS pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prestamo_id INTEGER NOT NULL,
    monto REAL NOT NULL,
    fecha TEXT NOT NULL,
    destination TEXT NOT NULL DEFAULT 'efectivo' CHECK(destination IN ('nequi', 'efectivo', 'ninguno')),
    FOREIGN KEY (prestamo_id) REFERENCES prestamos(id) ON DELETE CASCADE
);

-- Tabla para el Capital
CREATE TABLE IF NOT EXISTS capital (
    source TEXT PRIMARY KEY,
    amount REAL NOT NULL DEFAULT 0
);

-- NUEVA TABLA PARA EL HISTORIAL DE CAPITAL
CREATE TABLE IF NOT EXISTS capital_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    amount REAL NOT NULL,
    fecha TEXT NOT NULL
);

-- Índices para mejorar la velocidad de las búsquedas
CREATE INDEX IF NOT EXISTS idx_prestamos_cliente_id ON prestamos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_prestamos_estado ON prestamos (estado);
CREATE INDEX IF NOT EXISTS idx_pagos_prestamo_id ON pagos (prestamo_id);