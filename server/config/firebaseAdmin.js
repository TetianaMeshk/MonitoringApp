const admin = require('firebase-admin');
require('dotenv').config();

let serviceAccount;

try {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT не визначено в змінних середовища');
  }
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

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
  throw error;
}

const auth = admin.auth();
const db = admin.firestore();

module.exports = { auth, db };