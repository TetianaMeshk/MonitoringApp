// server/routes/auth.js
const express = require('express');
const router = express.Router();
const { auth, db } = require('../config/firebaseAdmin');
const fetch = require('node-fetch'); // Потрібно встановити: npm install node-fetch
const authMiddleware = require('../middleware/authMiddleware'); // Підключення проміжного ПЗ
const admin = require('firebase-admin'); // Для доступу до FieldValue

// Реєстрація користувача
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ message: 'Необхідно вказати email, пароль та ім\'я' });
  }

  try {
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
    });

    // Створюємо Custom Token для входу
    const token = await admin.auth().createCustomToken(userRecord.uid);

    // Запис у Firestore (опціонально)
    await db.collection('users').doc(userRecord.uid).set({
      name,
      email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Повертаємо UID і токен клієнту
    res.status(201).json({ uid: userRecord.uid, token });
  } catch (error) {
    console.error('Помилка реєстрації:', error);
    if (error.code === 'auth/email-already-exists') {
      res.status(400).json({ message: 'Цей email вже використовується' });
    } else {
      res.status(500).json({ message: 'Помилка сервера' });
    }
  }
});

// Логін користувача та отримання Firebase ID токена
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const apiKey = process.env.FIREBASE_API_KEY; // Потрібно додати ваш Firebase Web API Key до .env

   if (!email || !password) {
       return res.status(400).send({ message: 'Необхідно вказати email та пароль' });
   }
   if (!apiKey) {
       console.error('FIREBASE_API_KEY не визначено в .env');
       return res.status(500).send({ message: 'Помилка конфігурації сервера' });
   }


  const firebaseAuthEndpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

  try {
    // Використовуємо Firebase Auth REST API для входу за email/паролем
    const response = await fetch(firebaseAuthEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });

    const data = await response.json();

    if (response.ok) {
      // Успішний вхід через Firebase Auth REST API
      // data.idToken - це Firebase ID токен
      // data.localId - це UID користувача

      // Отримання додаткових даних користувача з Firestore
      const userDoc = await db.collection('users').doc(data.localId).get();
      const userData = userDoc.exists ? userDoc.data() : {};

      // Оновлюємо або створюємо документ Firestore, якщо він відсутній
      // Це корисно для користувачів, які, можливо, зареєструвались не через наш backend
      await db.collection('users').doc(data.localId).set({
          email: data.email,
          name: userData.name || data.displayName || null, // Використовуємо ім'я з Firestore, якщо є, інакше з Auth
          photoURL: userData.photoURL || data.photoURL || null, // Використовуємо photoURL з Firestore, якщо є, інакше з Auth
          trainings: userData.trainings || [],
          completedTrainings: userData.completedTrainings || [],
          meals: userData.meals || {},
          createdAt: userData.createdAt || admin.firestore.FieldValue.serverTimestamp(), // Зберігаємо час створення
      }, { merge: true }); // Використовуємо merge, щоб не стерти існуючі поля

      res.send({
        token: data.idToken, // Повертаємо Firebase ID токен на фронтенд
        uid: data.localId,
        email: data.email,
        displayName: userData.name || data.displayName, // Повертаємо ім'я (з Firestore або Auth)
        photoURL: userData.photoURL || data.photoURL // Повертаємо photoURL (з Firestore або Auth)
        // Можна додати інші дані користувача з Firestore
      });
    } else {
      // Помилка входу
      console.error('Помилка входу через Firebase Auth REST API:', data);
      if (data.error && data.error.message === 'EMAIL_NOT_FOUND') {
         res.status(401).send({ message: 'Користувача з такою поштою не знайдено' });
      } else if (data.error && data.error.message === 'INVALID_PASSWORD') {
         res.status(401).send({ message: 'Невірний пароль' });
      } else if (data.error && data.error.message === 'USER_DISABLED') {
         res.status(401).send({ message: 'Обліковий запис користувача заблоковано' });
      }
      else {
        res.status(401).send({ message: 'Невірні облікові дані' });
      }
    }
  } catch (error) {
    console.error('Помилка сервера під час входу:', error);
    res.status(500).send({ message: 'Помилка сервера' });
  }
});

// Отримання даних профілю користувача (захищений маршрут)
router.get('/profile', authMiddleware, async (req, res) => {
  const userId = req.user.uid; // Отримуємо UID з верифікованого токена (з authMiddleware)
  try {
    // Отримуємо дані користувача з Firestore
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      // Якщо документ у Firestore не існує, але токен дійсний (наприклад, Google Auth користувач без документа)
      try {
           const userAuth = await auth.getUser(userId);
            // Створити документ у Firestore для майбутнього
            await db.collection('users').doc(userId).set({
              email: userAuth.email,
              name: userAuth.displayName || null,
              photoURL: userAuth.photoURL || null,
              trainings: [],
              completedTrainings: [],
              meals: {},
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true }); // Використовуємо merge

           // Повертаємо дані з Firebase Auth + порожні масиви/об'єкти з Firestore
           res.send({
               uid: userAuth.uid,
               email: userAuth.email,
               name: userAuth.displayName || null, // Використовуємо displayName з Auth
               photoURL: userAuth.photoURL || null,
               trainings: [],
               completedTrainings: [],
               meals: {}
           });

      } catch (authError) {
           console.error('Помилка отримання даних з Firebase Auth:', authError);
           // Якщо навіть у Firebase Auth не знайдено (що малоймовірно, якщо токен дійсний)
           res.status(404).send({ message: 'Дані користувача не знайдено' });
      }

    } else {
      // Якщо документ у Firestore існує, повертаємо дані з нього
      const userData = userDoc.data();
      if (!userData.email) {
        try {
          const userAuthRecord = await auth.getUser(userId);
          // Оновлюємо Firestore
          await db.collection('users').doc(userId).set({
            email: userAuthRecord.email,
          }, { merge: true });
          // Оновлюємо локальний об'єкт
          userData.email = userAuthRecord.email;
        } catch (err) {
          console.error('Помилка оновлення email у Firestore:', err);
        }
      }
      res.send({
        uid: userDoc.id,
        email: userData.email,  // Тут бере з Firestore
        name: userData.name,
        photoURL: userData.photoURL,
        trainings: userData.trainings || [],
        completedTrainings: userData.completedTrainings || [],
        meals: userData.meals || {}
      });
    }
  } catch (error) {
    console.error('Помилка при отриманні даних профілю:', error);
    res.status(500).send({ message: 'Помилка сервера' });
  }
});


module.exports = router;