// PRESTAMOS-BACKEND/services/notificationService.js
require('dotenv').config();
const twilio = require('twilio');
const cron = require('node-cron');
const { getDBConnection } = require('../database/database');

// Configuración de Twilio (variables de entorno)
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;

// Función para enviar mensajes de WhatsApp
async function sendWhatsAppMessage(to, body) {
  try {
    const message = await client.messages.create({
      from: twilioWhatsAppNumber,
      to: `whatsapp:${to}`,
      body: body,
    });
    console.log(`Mensaje enviado a ${to}: ${message.sid}`);
    return message;
  } catch (error) {
    console.error(`Error al enviar mensaje a ${to}:`, error);
  }
}

// Función principal para verificar y enviar recordatorios
async function checkAndSendReminders() {
  let db;
  try {
    db = await getDBConnection();
    const hoy = new Date().toISOString().split('T')[0];
    const fechaRecordatorioSemanal = new Date();
    fechaRecordatorioSemanal.setDate(fechaRecordatorioSemanal.getDate() + 2);
    const fechaRecordatorioSemanalStr = fechaRecordatorioSemanal.toISOString().split('T')[0];

    // Consulta para obtener préstamos diarios que vencen hoy
    const deudoresDiarios = await db.all(`
        SELECT p.id, c.nombre, c.telefono, p.saldo_restante
        FROM prestamos p
        JOIN clientes c ON p.cliente_id = c.id
        WHERE p.estado = 'debe' AND p.plazo = 1 AND p.fecha_vencimiento = ?
    `, [hoy]);

    // Consulta para obtener préstamos semanales que vencen en 2 días
    const deudoresSemanales = await db.all(`
        SELECT p.id, c.nombre, c.telefono, p.saldo_restante
        FROM prestamos p
        JOIN clientes c ON p.cliente_id = c.id
        WHERE p.estado = 'debe' AND p.plazo = 7 AND p.fecha_vencimiento = ?
    `, [fechaRecordatorioSemanalStr]);

    // Enviar mensajes a deudores diarios
    for (const deudor of deudoresDiarios) {
      if (deudor.telefono) {
        const mensaje = `Hola ${deudor.nombre}, te recordamos que tu pago diario de $${deudor.saldo_restante} vence hoy. ¡Por favor, realiza tu pago a tiempo!`;
        await sendWhatsAppMessage(deudor.telefono, mensaje);
      }
    }

    // Enviar mensajes a deudores semanales
    for (const deudor of deudoresSemanales) {
      if (deudor.telefono) {
        const mensaje = `Hola ${deudor.nombre}, te recordamos que tu pago semanal de $${deudor.saldo_restante} vence en 2 días. ¡Por favor, realiza tu pago a tiempo!`;
        await sendWhatsAppMessage(deudor.telefono, mensaje);
      }
    }

  } catch (error) {
    console.error('Error en la tarea programada:', error);
  } finally {
    if (db) db.close();
  }
}

// Programador de tareas: Ejecutar cada día a las 10:00 AM (horario de Colombia)
exports.startScheduler = () => {
    cron.schedule('0 10 * * *', () => {
        console.log('Ejecutando la tarea programada de recordatorios...');
        checkAndSendReminders();
    }, {
        scheduled: true,
        timezone: "America/Bogota" // Zona horaria de Colombia
    });
    console.log('Programador de notificaciones iniciado. Se ejecutará a las 10:00 AM.');
};