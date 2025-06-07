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
db.run('PRAGMA foreign_keys = ON');

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
    closed INTEGER DEFAULT 0,
    activity TEXT,
    duration INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    reps INTEGER NOT NULL,
    weight REAL,
    FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
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

// Middleware to ensure authentication
function ensureLoggedIn(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function handleError(res, err) {
  console.error(err);
  res.status(500).json({ error: err.message });
}

// Auth routes
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, row) => {
    if (err) return handleError(res, err);
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

// Session routes
app.get('/api/sessions', ensureLoggedIn, (req, res) => {
  db.all('SELECT * FROM sessions WHERE user_id = ? ORDER BY date DESC', [req.session.userId], (err, rows) => {
    if (err) return handleError(res, err);
    res.json(rows);
  });
});

app.post('/api/sessions', ensureLoggedIn, (req, res) => {
  const { date } = req.body;
  if (!date) {
    return res.status(400).json({ error: 'date is required' });
  }
  db.run('INSERT INTO sessions (user_id, date) VALUES (?, ?)', [req.session.userId, date], function(err) {
    if (err) return handleError(res, err);
    res.json({ id: this.lastID, date, closed: 0 });
  });
});

app.delete('/api/sessions/:id', ensureLoggedIn, (req, res) => {
  const id = req.params.id;
  db.run(
    `DELETE FROM sessions WHERE id = ? AND user_id = ?`,
    [id, req.session.userId],
    function (err) {
      if (err) return handleError(res, err);
      if (this.changes === 0) return res.status(404).json({ error: 'not found' });
      res.json({ id });
    }
  );
});

app.get('/api/sessions/:id', ensureLoggedIn, (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM sessions WHERE id = ? AND user_id = ?', [id, req.session.userId], (err, sessionRow) => {
    if (err) return handleError(res, err);
    if (!sessionRow) return res.status(404).json({ error: 'not found' });
    db.all('SELECT * FROM exercises WHERE session_id = ?', [id], (err, exercises) => {
      if (err) return handleError(res, err);
      const exIds = exercises.map(e => e.id);
      if (exIds.length === 0) {
        return res.json({ ...sessionRow, exercises: [] });
      }
      const placeholders = exIds.map(() => '?').join(',');
      db.all(`SELECT * FROM sets WHERE exercise_id IN (${placeholders})`, exIds, (err, sets) => {
        if (err) return handleError(res, err);
        const map = {};
        sets.forEach(s => {
          if (!map[s.exercise_id]) map[s.exercise_id] = [];
          map[s.exercise_id].push(s);
        });
        const withSets = exercises.map(e => ({ ...e, sets: map[e.id] || [] }));
        res.json({ ...sessionRow, exercises: withSets });
      });
    });
  });
});

app.post('/api/sessions/:id/exercises', ensureLoggedIn, (req, res) => {
  const sessionId = req.params.id;
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }
  db.run('INSERT INTO exercises (session_id, name) VALUES (?, ?)', [sessionId, name], function(err) {
    if (err) return handleError(res, err);
    res.json({ id: this.lastID, session_id: sessionId, name });
  });
});

app.delete('/api/exercises/:id', ensureLoggedIn, (req, res) => {
  const id = req.params.id;
  db.run(
    `DELETE FROM exercises WHERE id IN (
      SELECT e.id FROM exercises e
      JOIN sessions s ON e.session_id = s.id
      WHERE e.id = ? AND s.user_id = ?
    )`,
    [id, req.session.userId],
    function (err) {
      if (err) return handleError(res, err);
      if (this.changes === 0) return res.status(404).json({ error: 'not found' });
      res.json({ id });
    }
  );
});

app.post('/api/exercises/:id/sets', ensureLoggedIn, (req, res) => {
  const exerciseId = req.params.id;
  const { reps, weight } = req.body;
  if (reps == null) {
    return res.status(400).json({ error: 'reps is required' });
  }
  db.run('INSERT INTO sets (exercise_id, reps, weight) VALUES (?, ?, ?)', [exerciseId, reps, weight || null], function(err) {
    if (err) return handleError(res, err);
    res.json({ id: this.lastID, exercise_id: exerciseId, reps, weight });
  });
});

app.delete('/api/sets/:id', ensureLoggedIn, (req, res) => {
  const id = req.params.id;
  db.run(
    `DELETE FROM sets WHERE id IN (
      SELECT s.id FROM sets s
      JOIN exercises e ON s.exercise_id = e.id
      JOIN sessions sess ON e.session_id = sess.id
      WHERE s.id = ? AND sess.user_id = ?
    )`,
    [id, req.session.userId],
    function (err) {
      if (err) return handleError(res, err);
      if (this.changes === 0) return res.status(404).json({ error: 'not found' });
      res.json({ id });
    }
  );
});

app.post('/api/sessions/:id/close', ensureLoggedIn, (req, res) => {
  const id = req.params.id;
  db.run('UPDATE sessions SET closed = 1 WHERE id = ? AND user_id = ?', [id, req.session.userId], function(err) {
    if (err) return handleError(res, err);
    res.json({ id });
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = app;
