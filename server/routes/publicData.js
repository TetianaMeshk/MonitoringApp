const express = require('express');
const router = express.Router();
const { db, auth } = require('../config/firebaseAdmin'); // Використовуємо auth для get user info
const admin = require('firebase-admin'); // Для доступу до FieldValue

// Цей файл містить маршрути, які не вимагають авторизації (публічні)

// Публічний маршрут для отримання відгуків
router.get('/reviews', async (req, res) => {
  try {
    const snapshot = await db.collection('reviews').orderBy('date', 'desc').get();
    const reviews = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    res.send(reviews);
  } catch (error) {
    console.error('Помилка при отриманні відгуків:', error);
    res.status(500).send({ message: 'Помилка сервера при отриманні відгуків.' });
  }
});

// Публічний маршрут для додавання відгуку
router.post('/reviews', async (req, res) => {
  const { name, text } = req.body;

  if (!name || name.trim() === '' || !text || text.trim() === '') {
    return res.status(400).send({ message: 'Необхідно вказати ім\'я та текст відгуку' });
  }

  if (typeof name !== 'string' || typeof text !== 'string') {
    return res.status(400).send({ message: 'Невірний тип даних для відгуку' });
  }

  try {
    const newReview = {
      name: name.trim(),
      text: text.trim(),
      date: new Date().toISOString()
    };
    const reviewRef = await db.collection('reviews').add(newReview);
    res.status(201).send({ id: reviewRef.id, ...newReview });
  } catch (error) {
    console.error('Помилка при додаванні відгуку:', error);
    res.status(500).send({ message: 'Помилка сервера при додаванні відгуку.' });
  }
});

// Публічний маршрут для отримання прийомів їжі (GET)
router.get('/meals', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decodedToken = await auth.verifyIdToken(token);
      const userId = decodedToken.uid;
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        res.send({ meals: userDoc.data().meals || {} });
      } else {
        res.send({ meals: {} });
      }
    } catch (error) {
      console.error('Помилка верифікації токена:', error);
      res.send({ meals: {} });
    }
  } else {
    // Без токена — повертаємо порожні
    res.send({ meals: {} });
  }
});

module.exports = router;
