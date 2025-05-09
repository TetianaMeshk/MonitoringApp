// my-backend/routes/data.js
const express = require('express');
const router = express.Router();
const { db, auth } = require('../config/firebaseAdmin');
const authMiddleware = require('../middleware/authMiddleware');
const admin = require('firebase-admin');

// Захищаємо всі маршрути в цьому файлі, вимагаючи валідний токен авторизації
router.use(authMiddleware);

// Маршрут для логування виконаних тренувань (ЗАХИЩЕНИЙ)
router.post('/trainings', async (req, res) => {
  const userId = req.user.uid; // Отримуємо UID користувача з middleware
  const trainingData = req.body; // Очікуємо об'єкт тренування з фронтенду { name, duration, calories }

  // Валідація вхідних даних
  if (!trainingData || !trainingData.name || trainingData.duration === undefined || trainingData.calories === undefined) {
      return res.status(400).send({ message: 'Неповні дані тренування' });
  }

  // Додаткова перевірка типів даних
  if (typeof trainingData.name !== 'string' || typeof trainingData.duration !== 'number' || typeof trainingData.calories !== 'number' || trainingData.duration < 0 || trainingData.calories < 0) {
       return res.status(400).send({ message: 'Невірний тип даних або значення для тренування (тривалість/калорії >= 0)' });
  }

  try {
    const userRef = db.collection('users').doc(userId);
    // Використовуємо arrayUnion для атомарного додавання елемента до масиву
    await userRef.update({
      completedTrainings: admin.firestore.FieldValue.arrayUnion({
        name: trainingData.name.trim(), // Обрізаємо пробіли
        duration: trainingData.duration,
        calories: trainingData.calories,
        date: new Date().toISOString() // Додаємо поточну дату в ISO форматі
      })
    });
    res.send({ message: 'Тренування успішно додано' });
  } catch (error) {
    console.error('Помилка при логуванні тренування:', error);
    res.status(500).send({ message: 'Помилка сервера при логуванні тренування.' });
  }
});

// Маршрут для отримання даних прогресу (ЗАХИЩЕНИЙ)
router.get('/progress', async (req, res) => {
    const userId = req.user.uid; // Отримуємо UID користувача з middleware
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        // Якщо користувача не знайдено у Firestore (наприклад, щойно зареєстрований через Auth),
        // повертаємо порожні масиви, а не помилку 404.
        res.send({ completedTrainings: [], trainings: [] });
      } else {
        const userData = userDoc.data();
        // Повертаємо масиви completedTrainings та trainings (заброньовані тренування)
        res.send({
           completedTrainings: userData.completedTrainings || [], // Використовуємо || [] на випадок, якщо поле ще не існує
           trainings: userData.trainings || []
        });
      }
    } catch (error) {
      console.error('Помилка при отриманні даних прогресу:', error);
      res.status(500).send({ message: 'Помилка сервера при отриманні даних прогресу.' });
    }
});

// Маршрут для оновлення даних профілю (name та photoDataURL) (ЗАХИЩЕНИЙ)
router.put('/profile', async (req, res) => {
    const userId = req.user.uid; // Отримуємо UID користувача з middleware
    // Очікуємо 'name' та необов'язкове 'photoDataURL'
    const { name, photoDataURL } = req.body;

    const updateDataFirestore = {};
    const updateDataAuth = {}; // Firebase Auth підтримує тільки displayName для оновлення

    let hasUpdate = false;

    // Оновлення імені (якщо присутнє в тілі запиту)
    if (name !== undefined) {
        if (typeof name !== 'string' || name.trim() === '') {
            return res.status(400).send({ message: 'Ім\'я не може бути порожнім.' });
        }
        updateDataFirestore.name = name.trim();
        updateDataAuth.displayName = name.trim(); // Оновлюємо displayName в Auth
        hasUpdate = true;
    }

    // Оновлення фотографії (як Data URL, якщо присутнє в тілі запиту)
    if (photoDataURL !== undefined) {
        if (photoDataURL === null) { // Дозволяємо встановити photoURL в null для видалення фото
             updateDataFirestore.photoURL = null;
             hasUpdate = true;
        } else if (typeof photoDataURL === 'string' && photoDataURL.startsWith('data:image/')) {
            // Приблизна перевірка розміру Data URL, щоб не перевищити ліміт документа Firestore (1MB)
            const maxFirestoreDocSize = 1024 * 1024; // 1MB
            // Data URL Base64 приблизно на 33% більше за оригінальні дані
            const estimatedDataSize = photoDataURL.length * 0.75;

            // Залишаємо запас для інших даних у документі
            const maxPhotoDataUrlDataSize = 700 * 1024; // Обмежуємо фото до ~700KB бінарних даних

            if (estimatedDataSize > maxPhotoDataUrlDataSize) {
                console.warn(`[PUT /api/profile] Надто великий Data URL. Приблизний розмір: ${estimatedDataSize / 1024} KB. Max: ${maxPhotoDataUrlDataSize / 1024} KB`);
                return res.status(400).send({ message: 'Файл зображення занадто великий (максимум ~700KB бінарних даних). Спробуйте менший файл.' });
            }

            updateDataFirestore.photoURL = photoDataURL;
            hasUpdate = true;
        } else {
            return res.status(400).send({ message: 'Невірний формат Data URL для фотографії.' });
        }
    }

    // Якщо немає даних для оновлення, повертаємо помилку
    if (!hasUpdate) {
        return res.status(400).send({ message: 'Немає даних для оновлення профілю (очікується ім\'я або фотографії).' });
    }

    try {
      // Оновлення даних у Firestore (використовуємо set з merge: true)
      if (Object.keys(updateDataFirestore).length > 0) {
          const userRef = db.collection('users').doc(userId);
          await userRef.set(updateDataFirestore, { merge: true });
      }

      // Оновлення даних у Firebase Authentication (тільки displayName)
       if (updateDataAuth.displayName !== undefined) {
           // Перевіряємо, чи displayName дійсно змінився, щоб уникнути зайвих викликів Auth API
           const userAuthRecord = await auth.getUser(userId);
           if (userAuthRecord.displayName !== updateDataAuth.displayName) {
               await auth.updateUser(userId, { displayName: updateDataAuth.displayName });
           }
       }

      res.send({ message: 'Профіль успішно оновлено' });
    } catch (error) {
      console.error('Помилка при оновленні профілю (Firestore/Auth):', error);
      // Перевіряємо, чи помилка пов'язана з розміром фотографії (хоча ми вже перевіряємо вище)
      if (error.code === 'storage/object-too-large') { // Приклад коду помилки, може відрізнятись
           return res.status(400).send({ message: 'Файл зображення занадто великий.' });
      }
      res.status(500).send({ message: 'Помилка сервера при оновленні профілю.' });
    }
});


// Маршрут для бронювання тренувань з тренером (ЗАХИЩЕНИЙ)
router.post('/book-training', async (req, res) => {
  const userId = req.user.uid;
  const { trainerId, trainerName, date, time } = req.body;

  // Валідація вхідних даних
  if (!trainerId || !trainerName || !date || !time) {
      console.log(`[${userId}] Невірні дані для бронювання:`, req.body);
      return res.status(400).send({ message: 'Неповні дані для бронювання' });
  }

  // Валідація типів і формату
  if (typeof trainerId !== 'number' || typeof trainerName !== 'string' || typeof date !== 'string' || typeof time !== 'string') {
      console.log(`[${userId}] Невірний тип даних:`, req.body);
      return res.status(400).send({ message: 'Невірний тип даних для бронювання' });
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const timeRegex = /^\d{2}:\d{2}$/;
  if (!dateRegex.test(date) || !timeRegex.test(time)) {
      console.log(`[${userId}] Невірний формат дати (${date}) або часу (${time})`);
      return res.status(400).send({ message: 'Невірний формат дати або часу' });
  }

  try {
      const usersCollection = db.collection('users');
      let isTimeTakenByOther = false;
      let isTimeTakenByCurrentUser = false;

      // Перевіряємо всі документи користувачів
      const usersSnapshot = await usersCollection.get();
      for (const userDoc of usersSnapshot.docs) {
          const userData = userDoc.data();
          const trainings = userData.trainings || [];
          const hasBooking = trainings.some(training =>
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

      // Обробка результатів перевірки
      if (isTimeTakenByCurrentUser) {
          console.log(`[${userId}] Спроба забронювати час ${date} ${time} з тренером ${trainerId}, який уже заброньовано цим користувачем.`);
          return res.status(400).send({ message: 'Ви вже записались на цей час.' });
      }

      if (isTimeTakenByOther) {
          console.log(`[${userId}] Спроба забронювати час ${date} ${time} з тренером ${trainerId}, який уже заброньовано іншим користувачем.`);
          return res.status(400).send({ message: 'Цей час уже заброньований іншим користувачем.' });
      }

      // Якщо час вільний, додаємо бронювання
      const userRef = db.collection('users').doc(userId);
      await userRef.update({
          trainings: admin.firestore.FieldValue.arrayUnion({
              trainerId,
              trainerName,
              date,
              time,
              bookedAt: new Date().toISOString()
          })
      });

      console.log(`[${userId}] Успішно заброньовано час ${date} ${time} з тренером ${trainerId}.`);
      res.send({ message: `Ви успішно записалися на тренування ${date} о ${time} з тренером ${trainerName}.` });
  } catch (error) {
      console.error(`[${userId}] Помилка при бронюванні тренування ${date} ${time} з тренером ${trainerId}:`, error);
      res.status(500).send({ message: 'Помилка сервера при бронюванні.' });
  }
});

// Захищений маршрут для отримання раціону користувача
// GET /api/meals
router.get('/meals', async (req, res) => {
    const userId = req.user.uid;
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        res.json({ meals: userDoc.data().meals || {} });
      } else {
        res.json({ meals: {} });
      }
    } catch (err) {
      console.error('Помилка при читанні раціону:', err);
      res.status(500).json({ message: 'Помилка сервера' });
    }
  });
  
  // POST /api/meals
  router.post('/meals', authMiddleware, async (req, res) => {
    const userId = req.user.uid;
    const { mealTime, mealData } = req.body;
  
    if (!mealTime || !mealData || typeof mealData !== 'object') {
      return res.status(400).json({ message: 'Некоректні дані' });
    }
  
    try {
      const userRef = db.collection('users').doc(userId);
      await userRef.set(
        {
          meals: {
            [mealTime]: admin.firestore.FieldValue.arrayUnion({
              ...mealData,
              date: new Date().toISOString()
            })
          }
        },
        { merge: true }
      );
      res.json({ message: 'Страву додано' });
    } catch (err) {
      console.error('Помилка додавання:', err);
      res.status(500).json({ message: 'Помилка сервера' });
    }
  });

module.exports = router;