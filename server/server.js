// server/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') }); // Завантажуємо змінні середовища

const app = express();
const port = process.env.PORT || 3001;

app.use(cors()); // Дозволяємо CORS для всіх запитів
app.use(express.json()); // Дозволяє обробляти JSON-запити

// Підключення маршрутів
const authRoutes = require('./routes/auth');
const dataRoutes = require('./routes/data');
const publicDataRoutes = require('./routes/publicData');
app.use('/auth', authRoutes);
app.use('/api', dataRoutes);
app.use('/public', publicDataRoutes); // для публічних маршрутів

// Базовий маршрут для перевірки
app.get('/', (req, res) => {
  res.send('Сервер моніторингу здоров\'я працює!');
});

app.listen(port, () => {
  console.log(`Сервер запущено на порту ${port}`);
});