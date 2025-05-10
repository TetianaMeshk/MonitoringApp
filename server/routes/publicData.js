const express = require('express');
const router = express.Router();
const { db } = require('../config/firebaseAdmin');

console.log('[Routes/PublicData] Ініціалізація маршрутів publicData...');

// Публічний маршрут для отримання відгуків
router.get('/reviews', async (req, res) => {
  console.log('[Routes/PublicData] Обробка GET /public/reviews');
  try {
    const snapshot = await db.collection('reviews').orderBy('date', 'desc').get();
    const reviews = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(reviews);
  } catch (error) {
    console.error('[Routes/PublicData] Помилка при отриманні відгуків:', error);
    res.status(500).json({ message: 'Помилка сервера при отриманні відгуків' });
  }
});

// Публічний маршрут для додавання відгуку
router.post('/reviews', async (req, res) => {
  console.log('[Routes/PublicData] Обробка POST /public/reviews');
  const { name, text } = req.body;

  if (!name || name.trim() === '' || !text || text.trim() === '') {
    console.warn('[Routes/PublicData] Некоректні дані для відгуку:', req.body);
    return res.status(400).json({ message: 'Необхідно вказати ім\'я та текст відгуку' });
  }

  if (typeof name !== 'string' || typeof text !== 'string') {
    console.warn('[Routes/PublicData] Невірний тип даних для відгуку:', req.body);
    return res.status(400).json({ message: 'Невірний тип даних для відгуку' });
  }

  try {
    const newReview = {
      name: name.trim(),
      text: text.trim(),
      date: new Date().toISOString(),
    };
    const reviewRef = await db.collection('reviews').add(newReview);
    console.log('[Routes/PublicData] Відгук додано:', newReview);
    res.status(201).json({ id: reviewRef.id, ...newReview });
  } catch (error) {
    console.error('[Routes/PublicData] Помилка при додаванні відгуку:', error);
    res.status(500).json({ message: 'Помилка сервера при додаванні відгуку' });
  }
});

console.log('[Routes/PublicData] Маршрути publicData ініціалізовано');

module.exports = router;