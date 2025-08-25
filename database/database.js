//PRESTAMOS-BACKEND/database/database.js
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const fs = require('fs').promises;
const path = require('path');

// Variable para almacenar la conexión a la base de datos
let db;

// Función para obtener la conexión a la DB (singleton)
async function getDBConnection() {
    if (!db) {
        db = await open({
            filename: './prestamos.db', // Nombre del archivo de la base de datos
            driver: sqlite3.Database
        });
    }
    return db;
}

// Función para inicializar la base de datos
async function initializeDatabase() {
    const db = await getDBConnection();
    const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
    await db.exec(schema);
    console.log("Base de datos inicializada correctamente.");
}

module.exports = { getDBConnection, initializeDatabase };