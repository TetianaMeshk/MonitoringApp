// server/config/firebaseAdmin.js
const admin = require('firebase-admin');
const path = require('path');

// Завантажуємо змінні середовища з .env файлу
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Шлях до файлу ключа сервісного облікового запису
const serviceAccountPath = path.resolve(__dirname, process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH);

// Перевірка наявності шляху до ключа
if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH) {
    console.error('Помилка: Змінна середовища FIREBASE_SERVICE_ACCOUNT_KEY_PATH не визначена.');
    // Можливо, завершити процес або обробити помилку іншим чином
    // process.exit(1);
}

try {
  // Перевіряємо, чи Firebase Admin SDK вже ініціалізовано
  if (!admin.apps.length) {
     admin.initializeApp({
       credential: admin.credential.cert(serviceAccountPath),
       // storageBucket: process.env.FIREBASE_STORAGE_BUCKET // <-- Видаляємо bucket
     });
     console.log('Firebase Admin SDK ініціалізовано успішно');
  } else {
     console.warn('Firebase Admin SDK вже ініціалізовано (використовується існуючий додаток).');
  }

} catch (error) {
    console.error('Помилка ініціалізації Firebase Admin SDK:', error);
    // Можливо, завершити процес або обробити помилку іншим чином
    // process.exit(1);
}

const auth = admin.auth();
const db = admin.firestore();
// const bucket = admin.storage().bucket(); // <-- Видаляємо експорт bucket

module.exports = { auth, db /*, bucket*/ }; // Не експортуємо bucket