// backend/controllers/authController.js
const jwt = require('jwt-simple');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');

dotenv.config();

let users = []; // Тут зберігаються користувачі для тестів

// Реєстрація користувача
exports.register = (req, res) => {
    const { email, password, name } = req.body;
    const user = { id: uuidv4(), email, password, name };
    users.push(user);
    res.status(201).send({ message: 'User registered successfully!' });
};

// Логін користувача та отримання JWT токену
exports.login = (req, res) => {
    const { email, password } = req.body;
    const user = users.find((u) => u.email === email && u.password === password);

    if (!user) return res.status(400).send({ message: 'Invalid credentials' });

    const payload = { id: user.id };
    const token = jwt.encode(payload, process.env.JWT_SECRET);
    res.status(200).send({ token });
};

// Отримання профілю користувача
exports.getProfile = (req, res) => {
    const token = req.headers['authorization'];

    if (!token) return res.status(403).send({ message: 'No token provided' });

    try {
        const decoded = jwt.decode(token, process.env.JWT_SECRET);
        const user = users.find((u) => u.id === decoded.id);
        if (!user) return res.status(404).send({ message: 'User not found' });

        res.status(200).send({ name: user.name, email: user.email });
    } catch (err) {
        return res.status(403).send({ message: 'Invalid token' });
    }
};
