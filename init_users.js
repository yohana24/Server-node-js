const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const SECRET_KEY = 'supersecret123';

// اتصال MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'iot_db'
});

db.connect(err => {
    if (err) throw err;
    console.log('Connected to MySQL');
});

async function registerUser(username, password, role = 'user') {
    // تأكد أن اليوزر مش موجود
    db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            console.log(`${username} already exists`);
            return loginUser(username, password); // جرب login مباشرة
        }

        const hashed = await bcrypt.hash(password, 10);
        db.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hashed, role], (err, result) => {
            if (err) throw err;
            console.log(`${username} registered successfully`);
            loginUser(username, password);
        });
    });
}

function loginUser(username, password) {
    db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
        if (err || results.length === 0) return console.log(`${username} not found`);

        const user = results[0];
        if (await bcrypt.compare(password, user.password)) {
            const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '1h' });
            console.log(`${username} logged in!`);
            console.log('JWT Token:', token, '\n');
        } else {
            console.log('Wrong password for', username);
        }
    });
}

// جرب تسجيل Admin و User
registerUser('admin', '12345', 'admin');
registerUser('user1', '12345', 'user');