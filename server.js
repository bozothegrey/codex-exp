const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || 'gym.db';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite database
const db = new sqlite3.Database(DB_FILE);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    activity TEXT NOT NULL,
    duration INTEGER
  )`);
});

// API routes
app.get('/api/sessions', (req, res) => {
  db.all('SELECT * FROM sessions ORDER BY date DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/sessions', (req, res) => {
  const { date, activity, duration } = req.body;
  if (!date || !activity) {
    return res.status(400).json({ error: 'date and activity are required' });
  }
  db.run('INSERT INTO sessions (date, activity, duration) VALUES (?, ?, ?)',
    [date, activity, duration || null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, date, activity, duration });
    });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
