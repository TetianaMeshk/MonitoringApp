const express = require('express');
const router = express.Router();
const { db, auth } = require('../config/firebaseAdmin');
const authMiddleware = require('../middleware/authMiddleware');
const admin = require('firebase-admin');

console.log('[Routes/Data] Ініціалізація маршрутів data...');

// Захищаємо всі маршрути в цьому файлі через authMiddleware
router.use(authMiddleware);

// Маршрут для логування виконаних тренувань
router.post('/trainings', async (req, res) => {
  console.log('[Routes/Data] Обробка POST /api/trainings');
  const userId = req.user.uid;
  const trainingData = req.body;

  // Валідація вхідних даних
  if (!trainingData || !trainingData.name || trainingData.duration === undefined || trainingData.calories === undefined) {
    console.warn(`[${userId}] Неповні дані тренування:`, trainingData);
    return res.status(400).json({ message: 'Неповні дані тренування' });
  }

  // Перевірка типів даних
  if (
    typeof trainingData.name !== 'string' ||
    typeof trainingData.duration !== 'number' ||
    typeof trainingData.calories !== 'number' ||
    trainingData.duration < 0 ||
    trainingData.calories < 0
  ) {
    console.warn(`[${userId}] Невірний тип даних:`, trainingData);
    return res.status(400).json({ message: 'Невірний тип даних або значення для тренування (тривалість/калорії >= 0)' });
  }

  try {
    const userRef = db.collection('users').doc(userId);
    await userRef.update({
      completedTrainings: admin.firestore.FieldValue.arrayUnion({
        name: trainingData.name.trim(),
        duration: trainingData.duration,
        calories: trainingData.calories,
        date: new Date().toISOString(),
      }),
    });
    console.log(`[${userId}] Тренування додано:`, trainingData);
    res.json({ message: 'Тренування успішно додано' });
  } catch (error) {
    console.error(`[${userId}] Помилка при логуванні тренування:`, error);
    res.status(500).json({ message: 'Помилка сервера при логуванні тренування' });
  }
});

// Маршрут для отримання даних прогресу
router.get('/progress', async (req, res) => {
  console.log('[Routes/Data] Обробка GET /api/progress');
  const userId = req.user.uid;
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      console.log(`[${userId}] Користувача не знайдено в Firestore, повертаємо порожні дані`);
      res.json({ completedTrainings: [], trainings: [] });
    } else {
      const userData = userDoc.data();
      res.json({
        completedTrainings: userData.completedTrainings || [],
        trainings: userData.trainings || [],
      });
    }
  } catch (error) {
    console.error(`[${userId}] Помилка при отриманні прогресу:`, error);
    res.status(500).json({ message: 'Помилка сервера при отриманні даних прогресу' });
  }
});

// Маршрут для оновлення даних профілю
router.put('/profile', async (req, res) => {
  console.log('[Routes/Data] Обробка PUT /api/profile');
  const userId = req.user.uid;
  const { name, photoDataURL } = req.body;

  const updateDataFirestore = {};
  const updateDataAuth = {};
  let hasUpdate = false;

  // Валідація імені
  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim() === '') {
      console.warn(`[${userId}] Некоректне ім'я:`, name);
      return res.status(400).json({ message: 'Ім\'я не може бути порожнім' });
    }
    updateDataFirestore.name = name.trim();
    updateDataAuth.displayName = name.trim();
    hasUpdate = true;
  }

  // Валідація фотографії
  if (photoDataURL !== undefined) {
    if (photoDataURL === null) {
      updateDataFirestore.photoURL = null;
      hasUpdate = true;
    } else if (typeof photoDataURL === 'string' && photoDataURL.startsWith('data:image/')) {
      const maxFirestoreDocSize = 1024 * 1024; // 1MB
      const estimatedDataSize = photoDataURL.length * 0.75;
      const maxPhotoDataUrlDataSize = 700 * 1024; // ~700KB

      if (estimatedDataSize > maxPhotoDataUrlDataSize) {
        console.warn(`[${userId}] Надто великий Data URL: ${estimatedDataSize / 1024} KB`);
        return res.status(400).json({ message: 'Файл зображення занадто великий (максимум ~700KB)' });
      }
      updateDataFirestore.photoURL = photoDataURL;
      hasUpdate = true;
    } else {
      console.warn(`[${userId}] Некоректний формат Data URL:`, photoDataURL);
      return res.status(400).json({ message: 'Невірний формат Data URL для фотографії' });
    }
  }

  if (!hasUpdate) {
    console.warn(`[${userId}] Немає даних для оновлення профілю`);
    return res.status(400).json({ message: 'Немає даних для оновлення профілю' });
  }

  try {
    if (Object.keys(updateDataFirestore).length > 0) {
      const userRef = db.collection('users').doc(userId);
      await userRef.set(updateDataFirestore, { merge: true });
    }

    if (updateDataAuth.displayName !== undefined) {
      const userAuthRecord = await auth.getUser(userId);
      if (userAuthRecord.displayName !== updateDataAuth.displayName) {
        await auth.updateUser(userId, { displayName: updateDataAuth.displayName });
      }
    }
    console.log(`[${userId}] Профіль оновлено:`, updateDataFirestore);
    res.json({ message: 'Профіль успішно оновлено' });
  } catch (error) {
    console.error(`[${userId}] Помилка при оновленні профілю:`, error);
    res.status(500).json({ message: 'Помилка сервера при оновленні профілю' });
  }
});

// Маршрут для бронювання тренувань
router.post('/book-training', async (req, res) => {
  console.log('[Routes/Data] Обробка POST /api/book-training');
  const userId = req.user.uid;
  const { trainerId, trainerName, date, time } = req.body;

  // Валідація вхідних даних
  if (!trainerId || !trainerName || !date || !time) {
    console.warn(`[${userId}] Неповні дані для бронювання:`, req.body);
    return res.status(400).json({ message: 'Неповні дані для бронювання' });
  }

  // Валідація типів і формату
  if (
    typeof trainerId !== 'number' ||
    typeof trainerName !== 'string' ||
    typeof date !== 'string' ||
    typeof time !== 'string'
  ) {
    console.warn(`[${userId}] Невірний тип даних:`, req.body);
    return res.status(400).json({ message: 'Невірний тип даних для бронювання' });
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const timeRegex = /^\d{2}:\d{2}$/;
  if (!dateRegex.test(date) || !timeRegex.test(time)) {
    console.warn(`[${userId}] Некоректний формат дати (${date}) або часу (${time})`);
    return res.status(400).json({ message: 'Невірний формат дати або часу' });
  }

  try {
    const usersCollection = db.collection('users');
    let isTimeTakenByOther = false;
    let isTimeTakenByCurrentUser = false;

    const usersSnapshot = await usersCollection.get();
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const trainings = userData.trainings || [];
      const hasBooking = trainings.some(
        training =>
          training.trainerId === trainerId &&
          training.date === date &&
          training.time === time
      );

      if (hasBooking) {
        if (userDoc.id === userId) {
          isTimeTakenByCurrentUser = true;
        } else {
          isTimeTakenByOther = true;
        }
      }
    }

    if (isTimeTakenByCurrentUser) {
      console.log(`[${userId}] Час ${date} ${time} уже заброньовано цим користувачем`);
      return res.status(400).json({ message: 'Ви вже записались на цей час' });
    }

    if (isTimeTakenByOther) {
      console.log(`[${userId}] Час ${date} ${time} заброньовано іншим користувачем`);
      return res.status(400).json({ message: 'Цей час уже заброньований іншим користувачем' });
    }

    const userRef = db.collection('users').doc(userId);
    await userRef.update({
      trainings: admin.firestore.FieldValue.arrayUnion({
        trainerId,
        trainerName,
        date,
        time,
        bookedAt: new Date().toISOString(),
      }),
    });

    console.log(`[${userId}] Успішно заброньовано час ${date} ${time} з тренером ${trainerId}`);
    res.json({
      message: `Ви успішно записалися на тренування ${date} о ${time} з тренером ${trainerName}`,
    });
  } catch (error) {
    console.error(`[${userId}] Помилка при бронюванні тренування:`, error);
    res.status(500).json({ message: 'Помилка сервера при бронюванні' });
  }
});

// Маршрут для отримання раціону
router.get('/meals', async (req, res) => {
  console.log('[Routes/Data] Обробка GET /api/meals');
  const userId = req.user.uid;
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      res.json({ meals: userDoc.data().meals || {} });
    } else {
      res.json({ meals: {} });
    }
  } catch (error) {
    console.error(`[${userId}] Помилка при читанні раціону:`, error);
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

// Маршрут для додавання страви до раціону
router.post('/meals', async (req, res) => {
  console.log('[Routes/Data] Обробка POST /api/meals');
  const userId = req.user.uid;
  const { mealTime, mealData } = req.body;

  if (!mealTime || !mealData || typeof mealData !== 'object') {
    console.warn(`[${userId}] Некоректні дані для раціону:`, req.body);
    return res.status(400).json({ message: 'Некоректні дані' });
  }

  try {
    const userRef = db.collection('users').doc(userId);
    await userRef.set(
      {
        meals: {
          [mealTime]: admin.firestore.FieldValue.arrayUnion({
            ...mealData,
            date: new Date().toISOString(),
          }),
        },
      },
      { merge: true }
    );
    console.log(`[${userId}] Страву додано до раціону:`, mealTime);
    res.json({ message: 'Страву додано' });
  } catch (error) {
    console.error(`[${userId}] Помилка при додаванні страви:`, error);
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

console.log('[Routes/Data] Маршрути data ініціалізовано');

module.exports = router;