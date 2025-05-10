const { auth } = require('../config/firebaseAdmin');

const authMiddleware = async (req, res, next) => {
  const token = req.cookies.authToken; // Отримуємо токен із cookie

  if (!token) {
    console.warn(`[AuthMiddleware] Відсутній токен авторизації для ${req.method} ${req.originalUrl}`);
    return res.status(401).json({ message: 'Токен не надано' });
  }

  try {
    const decodedToken = await auth.verifyIdToken(token);
    console.log(`[AuthMiddleware] Токен верифіковано для UID: ${decodedToken.uid}, Email: ${decodedToken.email}`);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error(`[AuthMiddleware] Помилка верифікації токена для ${req.method} ${req.originalUrl}:`, error.message);
    res.status(403).json({ message: 'Невалідний токен' });
  }
};

module.exports = authMiddleware;