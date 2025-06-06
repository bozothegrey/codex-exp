const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcrypt');

const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || 'gym.db';
const SESSION_SECRET = process.env.SESSION_SECRET || 'secret-key';

const app = express();
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize SQLite database
const db = new sqlite3.Database(DB_FILE);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    activity TEXT NOT NULL,
    duration INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Insert default users if none exist
  const defaultUsers = [
    { username: 'emanuele', password: 'ghisa' },
    { username: 'SBP', password: 'ghisa' },
    { username: 'dino', password: 'ghisa' }
  ];
  db.get('SELECT COUNT(*) as count FROM users', async (err, row) => {
    if (err) return console.error(err);
    if (row.count === 0) {
      for (const u of defaultUsers) {
        const hash = await bcrypt.hash(u.password, 10);
        db.run('INSERT INTO users (username, password) VALUES (?, ?)', [u.username, hash]);
      }
    }
  });
});

// API routes
function ensureLoggedIn(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(401).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, row.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    req.session.userId = row.id;
    res.json({ success: true });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/sessions', ensureLoggedIn, (req, res) => {
  db.all('SELECT * FROM sessions WHERE user_id = ? ORDER BY date DESC', [req.session.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/sessions', ensureLoggedIn, (req, res) => {
  const { date, activity, duration } = req.body;
  if (!date || !activity) {
    return res.status(400).json({ error: 'date and activity are required' });
  }
  db.run('INSERT INTO sessions (user_id, date, activity, duration) VALUES (?, ?, ?, ?)',
    [req.session.userId, date, activity, duration || null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, date, activity, duration });
    });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
