// ===== استدعاء المكتبات الأساسية =====
const express = require('express');                     // ===== framework بيسهل انك تعمل سيرفر =====
const cors = require('cors');                           // =====  علشان ال browser يتواصل مع السيرفر  =====
const mqtt = require('mqtt');                           // ===== بروتوكول اللي بيبعت بيانات ال esp32  للسيرفر=====
const mysql = require('mysql2');                        // ===== للتعامل مع قاعدة البيانات MySQL   =====
const bcrypt = require('bcrypt');                       // =====   لتشفير الباسوردات =====
const jwt = require('jsonwebtoken');                    // ===== بيظبط التوكين علشان ميبقاش فى حاجة غلط=====
const rateLimit = require('express-rate-limit');        // =====   علشان نمنع محاولات تخمين الباسورد =====
const https = require('https');                         // =====   امان =====
const fs = require('fs');                               // =====   امان =====

const app = express();

// ===== إعدادات Middleware =====
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // ملفات HTML/CSS/JS

const SECRET_KEY = 'supersecret123'; // مفتاح JWT سري

// ===== اتصال بقاعدة البيانات MySQL =====
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'iot_db'
});

db.connect(err => {
    if (err) console.log('DB Error:', err);
    else console.log('Connected to MySQL');
});

// ===== اتصال بـ MQTT Broker =====
const client = mqtt.connect('mqtt://localhost:1883');

client.on('connect', () => {
    console.log('MQTT Connected');
    client.subscribe('esp32/data');
});

// ===== استقبال رسائل الـ MQTT وحمايتها =====
client.on('message', (topic, message) => {
    const msg = message.toString().trim();

    // حماية من أي محاولة HTML/JS ضار
    const isMalicious = /<|>|script|onerror|onload/i.test(msg);
    if (isMalicious) return console.log('Blocked malicious payload:', msg);

    // قبول القيم الرقمية فقط
    const numericValue = parseFloat(msg.replace(/[^\d.-]/g, ''));
    if (isNaN(numericValue)) return console.log('Blocked non-numeric payload:', msg);

    const sql = "INSERT INTO sensor_data (value) VALUES (?)";
    db.query(sql, [numericValue], (err, result) => {
        if (err) console.log('Insert Error:', err);
        else console.log('Saved to DB:', numericValue);
    });
});

// ===== Middleware للتحقق من JWT =====       // ===== بمعنى ي request عايز بيانات أو يحذف بيانات لازم يكون معاه توكن =====

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// ===== Middleware للتحقق من الدور  admin or user =====
function authorizeRole(requiredRole) {
    return (req, res, next) => {
        if (req.user.role !== requiredRole) {
            return res.status(403).json({ error: 'Access denied' });
        }
        next();
    };
}

// ===== Rate Limiter لتسجيل الدخول =====
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 5,                    // 5 محاولات لكل IP
    message: { error: "Too many login attempts. Try again later." },
    standardHeaders: true,
    legacyHeaders: false,
});

// ===== Account lock حسب المستخدم =====
const loginAttempts = {}; // تخزين المحاولات لكل username
const LOCK_TIME = 15 * 60 * 1000; // 15 دقيقة lock

// ===== تسجيل مستخدم جديد =====
app.post('/register', async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });

    const hashed = await bcrypt.hash(password, 10);
    const sql = "INSERT INTO users (username, password, role) VALUES (?, ?, ?)";
    db.query(sql, [username, hashed, role || 'user'], (err, result) => {
        if (err) return res.status(400).json({ error: 'User exists or DB error' });
        res.json({ message: 'User registered' });
    });
});

// ===== تسجيل الدخول مع حماية من Brute Force =====
app.post('/login', loginLimiter, (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });

    // لو الحساب locked
    if (loginAttempts[username] && loginAttempts[username].lockedUntil > Date.now()) {
        return res.status(429).json({ error: 'Account temporarily locked. Try again later.' });
    }

    db.query("SELECT * FROM users WHERE username = ?", [username], async (err, results) => {
        if (err || results.length === 0) return res.status(400).json({ error: 'User not found' });

        const user = results[0];

        if (await bcrypt.compare(password, user.password)) {
            // نجاح تسجيل الدخول
            loginAttempts[username] = { count: 0, lockedUntil: 0 }; // إعادة ضبط المحاولات
            const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '1h' });
            res.json({ token });
        } else {
            // فشل تسجيل الدخول
            if (!loginAttempts[username]) loginAttempts[username] = { count: 0, lockedUntil: 0 };
            loginAttempts[username].count++;

            // قفل الحساب بعد 5 محاولات
            if (loginAttempts[username].count >= 5) {
                loginAttempts[username].lockedUntil = Date.now() + LOCK_TIME;
                loginAttempts[username].count = 0;
                return res.status(429).json({ error: 'Account temporarily locked due to too many failed attempts.' });
            }

            res.status(403).json({ error: 'Wrong password' });
        }
    });
});

// ===== API لعرض البيانات (User/Admin) =====
app.get('/data', authenticateToken, (req, res) => {
    db.query("SELECT * FROM sensor_data ORDER BY id DESC", (err, results) => {
        if (err) return res.send(err);
        res.json(results);
    });
});

// ===== API للحذف (Admin فقط) =====
app.delete('/data/:id', authenticateToken, authorizeRole('admin'), (req, res) => {
    const sql = "DELETE FROM sensor_data WHERE id = ?";
    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.send(err);
        res.json({ message: 'Deleted' });
    });
});

// ===== إعداد HTTPS =====
const sslOptions = {
    key: fs.readFileSync('./ssl/server.key'),
    cert: fs.readFileSync('./ssl/server.cert')
};

// ===== تشغيل السيرفر HTTPS =====
https.createServer(sslOptions, app).listen(3443, '0.0.0.0', () => {
    console.log('HTTPS API running on port 3443');
});