const express = require('express');
const router = express.Router();
const { auth, db } = require('../config/firebaseAdmin');
const fetch = require('node-fetch');
const authMiddleware = require('../middleware/authMiddleware');
const admin = require('firebase-admin');

// Встановлення cookie
const setAuthCookie = (res, token) => {
  res.cookie('authToken', token, {
    httpOnly: true, // Захищаємо від XSS
    secure: process.env.NODE_ENV === 'production', // Лише HTTPS у продакшені
    sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax', // Крос-доменні запити
    maxAge: 3600000, // 1 година
  });
};

// Реєстрація користувача
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ message: 'Необхідно вказати email, пароль та ім\'я' });
  }

  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) {
    console.error('FIREBASE_API_KEY не визначено в .env');
    return res.status(500).json({ message: 'Помилка конфігурації сервера' });
  }

  try {
    // Створюємо користувача
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
    });

    // Виконуємо вхід через REST API для отримання ID Token
    const firebaseAuthEndpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
    const response = await fetch(firebaseAuthEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Помилка входу після реєстрації:', data);
      await auth.deleteUser(userRecord.uid); // Видаляємо користувача при помилці
      return res.status(500).json({ message: 'Помилка входу після реєстрації' });
    }

    // Запис у Firestore
    await db.collection('users').doc(userRecord.uid).set(
      {
        email,
        name,
        photoURL: null,
        trainings: [],
        completedTrainings: [],
        meals: {},
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Встановлюємо cookie
    setAuthCookie(res, data.idToken);

    res.status(201).json({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: name,
      photoURL: null,
    });
  } catch (error) {
    console.error('Помилка реєстрації:', error);
    if (error.code === 'auth/email-already-exists') {
      res.status(400).json({ message: 'Цей email вже використовується' });
    } else {
      res.status(500).json({ message: 'Помилка сервера' });
    }
  }
});

// Логін користувача
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const apiKey = process.env.FIREBASE_API_KEY;

  console.log(`[POST /auth/login] Спроба входу для email: ${email}`);

  if (!email || !password) {
    console.warn(`[POST /auth/login] Відсутній email або пароль`);
    return res.status(400).json({ message: 'Необхідно вказати email та пароль' });
  }
  if (!apiKey) {
    console.error('[POST /auth/login] FIREBASE_API_KEY не визначено');
    return res.status(500).json({ message: 'Помилка конфігурації сервера' });
  }

  const firebaseAuthEndpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

  try {
    const response = await fetch(firebaseAuthEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });

    const data = await response.json();

    if (response.ok) {
      const userDoc = await db.collection('users').doc(data.localId).get();
      const userData = userDoc.exists ? userDoc.data() : {};

      await db.collection('users').doc(data.localId).set(
        {
          email: data.email,
          name: userData.name || data.displayName || null,
          photoURL: userData.photoURL || data.photoURL || null,
          trainings: userData.trainings || [],
          completedTrainings: userData.completedTrainings || [],
          meals: userData.meals || {},
          createdAt: userData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Встановлюємо cookie
      setAuthCookie(res, data.idToken);

      res.json({
        uid: data.localId,
        email: data.email,
        displayName: userData.name || data.displayName,
        photoURL: userData.photoURL || data.photoURL,
      });
    } else {
      console.error('Помилка входу через Firebase Auth REST API:', data);
      if (data.error && data.error.message === 'EMAIL_NOT_FOUND') {
        res.status(401).json({ message: 'Користувача з такою поштою не знайдено' });
      } else if (data.error && data.error.message === 'INVALID_PASSWORD') {
        res.status(401).json({ message: 'Невірний пароль' });
      } else if (data.error && data.error.message === 'USER_DISABLED') {
        res.status(401).json({ message: 'Обліковий запис користувача заблоковано' });
      } else {
        res.status(401).json({ message: 'Невірні облікові дані' });
      }
    }
  } catch (error) {
    console.error('Помилка сервера під час входу:', error);
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

// Google-авторизація
router.post('/google-login', async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: 'ID Token не надано' });
  }

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    const userId = decodedToken.uid;
    const userRecord = await auth.getUser(userId);

    await db.collection('users').doc(userId).set(
      {
        email: userRecord.email,
        name: userRecord.displayName || 'User',
        photoURL: userRecord.photoURL || null,
        trainings: [],
        completedTrainings: [],
        meals: {},
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Встановлюємо cookie
    setAuthCookie(res, idToken);

    res.status(200).json({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName || 'User',
      photoURL: userRecord.photoURL || null,
    });
  } catch (error) {
    console.error('Помилка Google-входу:', error);
    res.status(401).json({ message: 'Помилка авторизації через Google' });
  }
});

// Вихід (очищення cookie)
router.post('/logout', (req, res) => {
  res.clearCookie('authToken');
  res.json({ message: 'Вихід виконано' });
});

// Профіль (уже є, без змін)
router.get('/profile', authMiddleware, async (req, res) => {
  const userId = req.user.uid;
  try {
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      const userAuth = await auth.getUser(userId);
      await db.collection('users').doc(userId).set(
        {
          email: userAuth.email,
          name: userAuth.displayName || null,
          photoURL: userAuth.photoURL || null,
          trainings: [],
          completedTrainings: [],
          meals: {},
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      res.json({
        uid: userAuth.uid,
        email: userAuth.email,
        name: userAuth.displayName || null,
        photoURL: userAuth.photoURL || null,
        trainings: [],
        completedTrainings: [],
        meals: {},
      });
    } else {
      const userData = userDoc.data();
      if (!userData.email) {
        const userAuthRecord = await auth.getUser(userId);
        await db.collection('users').doc(userId).set(
          { email: userAuthRecord.email },
          { merge: true }
        );
        userData.email = userAuthRecord.email;
      }
      res.json({
        uid: userDoc.id,
        email: userData.email,
        name: userData.name,
        photoURL: userData.photoURL,
        trainings: userData.trainings || [],
        completedTrainings: userData.completedTrainings || [],
        meals: userData.meals || {},
      });
    }
  } catch (error) {
    console.error('Помилка при отриманні даних профілю:', error);
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

module.exports = router;