const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const app = express();

// Налаштування CORS
app.use(cors({
  origin: ['https://app-health-monitoring.netlify.app', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Логування запитів для діагностики
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Маршрути
const authRoutes = require('./routes/auth');
const dataRoutes = require('./routes/data');
const publicDataRoutes = require('./routes/publicData');
app.use('/auth', authRoutes);
app.use('/api', dataRoutes);
app.use('/public', publicDataRoutes);

// Базовий маршрут
app.get('/', (req, res) => {
  res.send('Сервер моніторингу здоров\'я працює!');
});

// Запуск сервера
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущено на порту ${PORT}`);
});