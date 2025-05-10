const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const app = express();

// Налаштування CORS
app.use(cors({
  origin: ['https://app-health-monitoring.netlify.app', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Length', 'X-Requested-With'],
}));

// Обробка CORS preflight-запитів
app.options('*', cors());

// Парсинг cookies
app.use(cookieParser());

// Парсинг JSON
app.use(express.json());

// Логування запитів
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Маршрути
const authRoutes = require('./routes/auth');
const dataRoutes = require('./routes/data');
const publicDataRoutes = require('./routes/publicData');

try {
  // Дебагінг маршрутів
  console.log('[Server] Реєстрація маршрутів...');
  app.use('/auth', authRoutes);
  console.log('[Server] Маршрути /auth зареєстровано');
  app.use('/api', dataRoutes);
  console.log('[Server] Маршрути /api зареєстровано');
  app.use('/public', publicDataRoutes);
  console.log('[Server] Маршрути /public зареєстровано');
} catch (error) {
  console.error('[Server] Помилка при реєстрації маршрутів:', error);
  process.exit(1);
}

// Базовий маршрут
app.get('/', (req, res) => {
  res.send('Сервер моніторингу здоров\'я працює!');
});

// Обробка помилок
app.use((err, req, res, next) => {
  console.error(`[Error] ${req.method} ${req.url}:`, err.message);
  res.status(500).json({ message: 'Помилка сервера' });
});

// Запуск сервера
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущено на порту ${PORT}`);
});