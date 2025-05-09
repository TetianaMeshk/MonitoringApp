const admin = require('firebase-admin');
require('dotenv').config();

let serviceAccount;

try {
  // На Render ключ передається як JSON-рядок у змінній середовища
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT не визначено в змінних середовища');
  }
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  // Ініціалізація Firebase Admin SDK
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin SDK ініціалізовано успішно');
  } else {
    console.warn('Firebase Admin SDK вже ініціалізовано');
  }
} catch (error) {
  console.error('Помилка ініціалізації Firebase Admin SDK:', error);
  throw error; // Зупиняємо сервер, якщо ініціалізація не вдалася
}

const auth = admin.auth();
const db = admin.firestore();

module.exports = { auth, db };