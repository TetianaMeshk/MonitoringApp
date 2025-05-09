// server/middleware/authMiddleware.js
const { auth } = require('../config/firebaseAdmin'); // Виправлено імпорт

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Очікуємо формат "Bearer <token>"

  if (token == null) {
    console.warn(`[AuthMiddleware] Відсутній токен авторизації для ${req.method} ${req.originalUrl}`);
    return res.sendStatus(401); // Якщо токен відсутній
  }

  try {
    // Верифікація Firebase ID токена
    const decodedToken = await auth.verifyIdToken(token);
    req.user = decodedToken; // Додаємо дані користувача (включаючи uid) до запиту
    // console.log(`[AuthMiddleware] Токен верифіковано для UID: ${req.user.uid}`);
    next(); // Переходимо до наступного обробника
  } catch (error) {
    console.error(`[AuthMiddleware] Помилка верифікації токена для ${req.method} ${req.originalUrl}:`, error.message);
    // Якщо токен недійсний або термін дії закінчився
    res.sendStatus(403); // Forbidden
  }
};

module.exports = authMiddleware;