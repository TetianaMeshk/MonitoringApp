const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const app = express();

// Налаштування CORS для вашого фронтенду
app.use(cors({
  origin: 'https://app-health-monitoring.netlify.app',
  credentials: true
}));
app.use(express.json());

// Підключення маршрутів
const authRoutes = require('./routes/auth');
const dataRoutes = require('./routes/data');
const publicDataRoutes = require('./routes/publicData');
app.use('/auth', authRoutes);
app.use('/api', dataRoutes);
app.use('/public', publicDataRoutes);

// Базовий маршрут для перевірки
app.get('/', (req, res) => {
  res.send('Сервер моніторингу здоров\'я працює!');
});

// Слухаємо порт і хост
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущено на порту ${PORT}`);
});