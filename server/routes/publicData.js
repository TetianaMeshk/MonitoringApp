const express = require('express');
const router = express.Router();
const { db, auth } = require('../config/firebaseAdmin');
const admin = require('firebase-admin');

router.get('/reviews', async (req, res) => {
  try {
    const snapshot = await db.collection('reviews').orderBy('date', 'desc').get();
    const reviews = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(reviews);
  } catch (error) {
    console.error('Помилка при отриманні відгуків:', error);
    res.status(500).json({ message: 'Помилка сервера при отриманні відгуків.' });
  }
});

router.post('/reviews', async (req, res) => {
  const { name, text } = req.body;

  if (!name || name.trim() === '' || !text || text.trim() === '') {
    return res.status(400).json({ message: 'Необхідно вказати ім\'я та текст відгуку' });
  }

  if (typeof name !== 'string' || typeof text !== 'string') {
    return res.status(400).json({ message: 'Невірний тип даних для відгуку' });
  }

  try {
    const newReview = {
      name: name.trim(),
      text: text.trim(),
      date: new Date().toISOString(),
    };
    const reviewRef = await db.collection('reviews').add(newReview);
    res.status(201).json({ id: reviewRef.id, ...newReview });
  } catch (error) {
    console.error('Помилка при додаванні відгуку:', error);
    res.status(500).json({ message: 'Помилка сервера при додаванні відгуку.' });
  }
});

router.get('/meals', async (req, res) => {
  const token = req.cookies.authToken;

  if (token) {
    try {
      const decodedToken = await auth.verifyIdToken(token);
      const userId = decodedToken.uid;
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        res.json({ meals: userDoc.data().meals || {} });
      } else {
        res.json({ meals: {} });
      }
    } catch (error) {
      console.error('Помилка верифікації токена:', error);
      res.json({ meals: {} });
    }
  } else {
    res.json({ meals: {} });
  }
});

module.exports = router;