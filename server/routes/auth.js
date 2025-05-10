const express = require('express');
const router = express.Router();
const { auth, db } = require('../config/firebaseAdmin');
const fetch = require('node-fetch');
const authMiddleware = require('../middleware/authMiddleware');
const admin = require('firebase-admin');

console.log('[Routes/Auth] Ініціалізація маршрутів auth...');

// Функція для встановлення cookie
const setAuthCookie = (res, token) => {
  console.log('[Routes/Auth] Встановлення cookie для токена');
  res.cookie('authToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
    maxAge: 3600000, // 1 година
  });
};

// Реєстрація користувача
router.post('/register', async (req, res) => {
  console.log('[Routes/Auth] Обробка POST /auth/register');
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    console.warn('[Routes/Auth] Відсутні email, пароль або ім\'я:', req.body);
    return res.status(400).json({ message: 'Необхідно вказати email, пароль та ім\'я' });
  }

  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) {
    console.error('[Routes/Auth] FIREBASE_API_KEY не визначено');
    return res.status(500).json({ message: 'Помилка конфігурації сервера' });
  }

  try {
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
    });

    const firebaseAuthEndpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
    const response = await fetch(firebaseAuthEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('[Routes/Auth] Помилка входу після реєстрації:', data);
      await auth.deleteUser(userRecord.uid);
      return res.status(500).json({ message: 'Помилка входу після реєстрації' });
    }

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

    setAuthCookie(res, data.idToken);
    console.log(`[Routes/Auth] Користувач зареєстрований: ${userRecord.uid}`);
    res.status(201).json({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: name,
      photoURL: null,
    });
  } catch (error) {
    console.error('[Routes/Auth] Помилка реєстрації:', error);
    if (error.code === 'auth/email-already-exists') {
      res.status(400).json({ message: 'Цей email вже використовується' });
    } else {
      res.status(500).json({ message: 'Помилка сервера' });
    }
  }
});

// Логін користувача
router.post('/login', async (req, res) => {
  console.log('[Routes/Auth] Обробка POST /auth/login');
  const { email, password } = req.body;
  const apiKey = process.env.FIREBASE_API_KEY;

  if (!email || !password) {
    console.warn('[Routes/Auth] Відсутній email або пароль:', req.body);
    return res.status(400).json({ message: 'Необхідно вказати email та пароль' });
  }
  if (!apiKey) {
    console.error('[Routes/Auth] FIREBASE_API_KEY не визначено');
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
          createdAt: userData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      setAuthCookie(res, data.idToken);
      console.log(`[Routes/Auth] Успішний вхід: ${data.localId}`);
      res.json({
        uid: data.localId,
        email: data.email,
        displayName: userData.name || data.displayName,
        photoURL: userData.photoURL || data.photoURL,
      });
    } else {
      console.error('[Routes/Auth] Помилка входу:', data);
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
    console.error('[Routes/Auth] Помилка сервера під час входу:', error);
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

// Google-авторизація
router.post('/google-login', async (req, res) => {
  console.log('[Routes/Auth] Обробка POST /auth/google-login');
  const { idToken } = req.body;

  if (!idToken) {
    console.warn('[Routes/Auth] ID Token не надано');
    return res.status(400).json({ message: 'ID Token не надано' });
  }

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    const userId = decodedToken.uid;
    const userRecord = await auth.getUser(userId);

    // Оновлюємо лише необхідні поля, зберігаючи існуючі дані
    await db.collection('users').doc(userId).set(
      {
        email: userRecord.email,
        name: userRecord.displayName || 'User',
        photoURL: userRecord.photoURL || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    setAuthCookie(res, idToken);
    console.log(`[Routes/Auth] Успішна Google-авторизація: ${userId}`);
    res.status(200).json({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName || 'User',
      photoURL: userRecord.photoURL || null,
    });
  } catch (error) {
    console.error('[Routes/Auth] Помилка Google-входу:', error);
    res.status(401).json({ message: 'Помилка авторизації через Google' });
  }
});

// Вихід
router.post('/logout', (req, res) => {
  console.log('[Routes/Auth] Обробка POST /auth/logout');
  res.clearCookie('authToken');
  console.log('[Routes/Auth] Cookie очищено');
  res.json({ message: 'Вихід виконано' });
});

// Отримання профілю
router.get('/profile', authMiddleware, async (req, res) => {
  console.log('[Routes/Auth] Обробка GET /auth/profile');
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
      console.log(`[Routes/Auth] Створено новий профіль для UID: ${userId}`);
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
      console.log(`[Routes/Auth] Профіль отримано для UID: ${userId}`);
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
    console.error(`[Routes/Auth] Помилка при отриманні профілю для UID: ${userId}:`, error);
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

console.log('[Routes/Auth] Маршрути auth ініціалізовано');

module.exports = router;