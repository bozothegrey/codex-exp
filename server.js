const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const DatabaseService = require('./db/dbService');

const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || 'gym.db';
const SESSION_SECRET = process.env.SESSION_SECRET || 'secret-key';

function createApp(sessionConfig = {}) {
  const app = express();
  const dbService = new DatabaseService(DB_FILE);
  let dbReady = false;
  
  // Default session config
  const defaultSessionConfig = {
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {}
  };

  // Merge with any provided config
  const finalSessionConfig = {
    ...defaultSessionConfig,
    ...sessionConfig
  };

  // Configure middleware
  app.use(express.json());
  app.use(session(finalSessionConfig));
  app.use(express.static(path.join(__dirname, 'public')));

  // Handle database errors
  dbService.on('error', (err) => {
    console.error('Database error:', err);
  });

  // Initialize database tables
  async function initializeDatabase() {
    try {
      await dbService.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
      )`);

      await dbService.run(`CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        closed INTEGER DEFAULT 0,
        activity TEXT,
        duration INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )`);

      await dbService.run(`CREATE TABLE IF NOT EXISTS exercises (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )`);

      await dbService.run(`CREATE TABLE IF NOT EXISTS sets (
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
      const row = await dbService.query('SELECT COUNT(*) as count FROM users');
      if (row[0].count === 0) {
        for (const u of defaultUsers) {
          const hash = await bcrypt.hash(u.password, 10);
          await dbService.run('INSERT INTO users (username, password) VALUES (?, ?)', [u.username, hash]);
        }
      }
    } catch (err) {
      console.error('Database initialization failed:', err);
      process.exit(1);
    }
  }

  initializeDatabase().then(() => {
    dbReady = true;
    console.log('Database initialized');
  }).catch(err => {
    console.error('Database initialization failed:', err);
    process.exit(1);
  });

  // Add readiness check
  app.get('/ready', (req, res) => {
    dbReady ? res.sendStatus(200) : res.sendStatus(503);
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
app.post('/api/login', async (req, res) => {
  try {
    console.log('Login attempt:', { username: req.body.username });
    const { username, password } = req.body;
    const rows = await dbService.query('SELECT * FROM users WHERE username = ?', [username]);
    console.log('User lookup result:', { userExists: rows.length > 0 });
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    
    const row = rows[0];
    const match = await bcrypt.compare(password, row.password);
    if (!match) {
      console.log('Password mismatch for user:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    console.log('Successful login for user:', username);
    req.session.userId = row.id;
    req.session.save(err => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Login failed' });
      }
      dbService.emit('user:login', { userId: row.id, username });
      res.json({ success: true });
    });
  } catch (err) {
    handleError(res, err);
  }
});

// User registration endpoint
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Check if username already exists
    const existingUser = await dbService.query('SELECT * FROM users WHERE username = ?', [username]);
    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    // Hash password and create user
    const hash = await bcrypt.hash(password, 10);
    await dbService.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash]);
    
    res.status(201).json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

// Password change endpoint
app.put('/api/user/password', ensureLoggedIn, async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmNewPassword } = req.body;
    const userId = req.session.userId;
    
    // Validate input
    if (!oldPassword || !newPassword || !confirmNewPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ error: 'New passwords do not match' });
    }
    
    // Get current user
    const [user] = await dbService.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify old password
    const match = await bcrypt.compare(oldPassword, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Update password
    const hash = await bcrypt.hash(newPassword, 10);
    await dbService.run('UPDATE users SET password = ? WHERE id = ?', [hash, userId]);
    
    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

// User deletion endpoint
app.delete('/api/user', ensureLoggedIn, async (req, res) => {
  const userId = req.session.userId;
  
  try {
    await dbService.transaction(async () => {
      // Delete user sessions (cascades to exercises and sets)
      await dbService.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
      
      // Delete user
      await dbService.run('DELETE FROM users WHERE id = ?', [userId]);
    });
    
    // Destroy session after successful deletion
    req.session.destroy(() => {
      res.json({ success: true });
    });
  } catch (err) {
    handleError(res, err);
  }
});

  app.post('/api/logout', (req, res) => {
    const userId = req.session.userId;
    req.session.destroy(() => {
      if (userId) {
        dbService.emit('user:logout', { userId });
      }
      res.json({ success: true });
    });
  });

  // Session routes
  app.get('/api/sessions', ensureLoggedIn, async (req, res) => {
    try {
      const sessions = await dbService.query(
        'SELECT * FROM sessions WHERE user_id = ? ORDER BY date DESC',
        [req.session.userId]
      );
      res.json(sessions);
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/sessions', ensureLoggedIn, async (req, res) => {
    try {
      const { date } = req.body;
      if (!date) {
        return res.status(400).json({ error: 'date is required' });
      }

      const result = await dbService.run(
        'INSERT INTO sessions (user_id, date) VALUES (?, ?)',
        [req.session.userId, date]
      );

      const session = {
        id: result.lastID,
        date,
        closed: 0,
        user_id: req.session.userId
      };

      dbService.emit('session:created', session);
      res.json(session);
    } catch (err) {
      handleError(res, err);
    }
  });

  app.delete('/api/sessions/:id', ensureLoggedIn, async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const userId = req.session.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (isNaN(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID' });
      }

      const result = await dbService.transaction(async () => {
        const session = await dbService.query(
          'SELECT * FROM sessions WHERE id = ? AND user_id = ?',
          [sessionId, userId]
        );
        
        if (session.length === 0) {
          return { changes: 0 };
        }

        const deleteResult = await dbService.run(
          'DELETE FROM sessions WHERE id = ? AND user_id = ?',
          [sessionId, userId]
        );

        return { ...deleteResult, session: session[0] };
      });

      if (result.changes === 0) {
        return res.status(404).json({ error: 'not found' });
      }

      dbService.emit('session:deleted', {
        sessionId: sessionId,
        userId,
        sessionData: result.session
      });
      res.json({ id: sessionId });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get('/api/sessions/:id', ensureLoggedIn, async (req, res) => {
    try {
      const id = req.params.id;
      const userId = req.session.userId;

      const sessionRows = await dbService.query(
        'SELECT * FROM sessions WHERE id = ? AND user_id = ?',
        [id, userId]
      );
      
      if (sessionRows.length === 0) {
        return res.status(404).json({ error: 'not found' });
      }

      const session = sessionRows[0];
      const exercises = await dbService.query(
        'SELECT * FROM exercises WHERE session_id = ?',
        [id]
      );

      if (exercises.length === 0) {
        dbService.emit('session:accessed', { sessionId: id, userId });
        return res.json({ ...session, exercises: [] });
      }

      const exIds = exercises.map(e => e.id);
      const placeholders = exIds.map(() => '?').join(',');
      const sets = await dbService.query(
        `SELECT * FROM sets WHERE exercise_id IN (${placeholders})`,
        exIds
      );

      const setsByExercise = sets.reduce((acc, set) => {
        if (!acc[set.exercise_id]) acc[set.exercise_id] = [];
        acc[set.exercise_id].push(set);
        return acc;
      }, {});

      const exercisesWithSets = exercises.map(exercise => ({
        ...exercise,
        sets: setsByExercise[exercise.id] || []
      }));

      dbService.emit('session:accessed', { sessionId: id, userId });
      res.json({ ...session, exercises: exercisesWithSets });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/sessions/:id/exercises', ensureLoggedIn, async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const userId = req.session.userId;
      const { name } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!name || typeof name !== 'string') {
        return res.status(405).json({ error: 'Exercise name is required' });
      }

      if (isNaN(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID' });
      }

      const session = await dbService.query(
        'SELECT * FROM sessions WHERE id = ? AND user_id = ?',
        [sessionId, userId]
      );
      
      if (session.length === 0) {
        return res.status(404).json({ error: 'session not found' });
      }

      if (name.length === 0) {
        return res.status(405).json({ error: 'Exercise Name Required' });
      }

      const result = await dbService.run(
        'INSERT INTO exercises (session_id, name) VALUES (?, ?)',
        [sessionId, name]
      );

      const exercise = {
        id: result.lastID,
        session_id: sessionId,
        name
      };

      dbService.emit('exercise:created', {
        exerciseId: exercise.id,
        sessionId,
        userId,
        name
      });

      res.json(exercise);
    } catch (err) {
      handleError(res, err);
    }
  });

  app.delete('/api/exercises/:id', ensureLoggedIn, async (req, res) => {
    try {
      const id = req.params.id;
      const userId = req.session.userId;

      const result = await dbService.transaction(async (db) => {
        const exercise = await dbService.query(
          `SELECT e.* FROM exercises e
           JOIN sessions s ON e.session_id = s.id
           WHERE e.id = ? AND s.user_id = ?`,
          [id, userId]
        );
        
        if (exercise.length === 0) {
          return { changes: 0 };
        }

        const result = await dbService.run(
          `DELETE FROM exercises WHERE id IN (
            SELECT e.id FROM exercises e
            JOIN sessions s ON e.session_id = s.id
            WHERE e.id = ? AND s.user_id = ?
          )`,
          [id, userId]
        );

        return { ...result, exercise: exercise[0] };
      });

      if (result.changes === 0) {
        return res.status(404).json({ error: 'not found' });
      }

      dbService.emit('exercise:deleted', {
        exerciseId: id,
        sessionId: result.exercise.session_id,
        userId
      });

      res.json({ id: parseInt(id) });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/exercises/:id/sets', ensureLoggedIn, async (req, res) => {
    try {
      const exerciseId = req.params.id;
      const { reps, weight } = req.body;
      const userId = req.session.userId;

      if (reps == null) {
        return res.status(400).json({ error: 'reps is required' });
      }

      const exercise = await dbService.query(
        `SELECT e.* FROM exercises e
         JOIN sessions s ON e.session_id = s.id
         WHERE e.id = ? AND s.user_id = ?`,
        [exerciseId, userId]
      );
      
      if (exercise.length === 0) {
        return res.status(404).json({ error: 'exercise not found' });
      }

      const result = await dbService.run(
        'INSERT INTO sets (exercise_id, reps, weight) VALUES (?, ?, ?)',
        [exerciseId, reps, weight || null]
      );

      const set = {
        id: result.lastID,
        exercise_id: exerciseId,
        reps,
        weight: weight || null
      };

      dbService.emit('set:created', {
        setId: set.id,
        exerciseId,
        sessionId: exercise[0].session_id,
        userId,
        reps,
        weight
      });

      res.json(set);
    } catch (err) {
      handleError(res, err);
    }
  });

  app.delete('/api/sets/:id', ensureLoggedIn, async (req, res) => {
    try {
      const id = req.params.id;
      const userId = req.session.userId;

      const result = await dbService.transaction(async (db) => {
        const set = await dbService.query(
          `SELECT s.*, e.session_id FROM sets s
           JOIN exercises e ON s.exercise_id = e.id
           JOIN sessions sess ON e.session_id = sess.id
           WHERE s.id = ? AND sess.user_id = ?`,
          [id, userId]
        );
        
        if (set.length === 0) {
          return { changes: 0 };
        }

        const result = await dbService.run(
          `DELETE FROM sets WHERE id IN (
            SELECT s.id FROM sets s
            JOIN exercises e ON s.exercise_id = e.id
            JOIN sessions sess ON e.session_id = sess.id
            WHERE s.id = ? AND sess.user_id = ?
          )`,
          [id, userId]
        );

        return { ...result, set: set[0] };
      });

      if (result.changes === 0) {
        return res.status(404).json({ error: 'not found' });
      }

      dbService.emit('set:deleted', {
        setId: id,
        exerciseId: result.set.exercise_id,
        sessionId: result.set.session_id,
        userId
      });

      res.json({ id });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/sessions/:id/close', ensureLoggedIn, async (req, res) => {
    try {
      const id = req.params.id;
      const userId = req.session.userId;

      const result = await dbService.transaction(async (db) => {
        const session = await dbService.query(
          'SELECT * FROM sessions WHERE id = ? AND user_id = ?',
          [id, userId]
        );
        
        if (session.length === 0) {
          return { changes: 0 };
        }

        const result = await dbService.run(
          'UPDATE sessions SET closed = 1 WHERE id = ? AND user_id = ?',
          [id, userId]
        );

        return { ...result, session: session[0] };
      });

      if (result.changes === 0) {
        return res.status(404).json({ error: 'session not found' });
      }

      dbService.emit('session:closed', {
        sessionId: id,
        userId,
        sessionData: result.session
      });

      res.json({ id });
    } catch (err) {
      handleError(res, err);
    }
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = createApp;
