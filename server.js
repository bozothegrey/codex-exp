const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const DatabaseService = require('./db/dbService');
const { setupChallengeJobs } = require('./db/challengeJobs');

// Admin middleware
function requireAdminApiKey(req, res, next) {
  const apiKey = req.get('X-Admin-API-Key');
  if (!apiKey || apiKey !== process.env.SESSION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || 'gym.db';
const SESSION_SECRET = process.env.SESSION_SECRET || 'secret-key';

function createApp(sessionConfig = {}, dbService) {
  const app = express();
  
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

  // Add readiness check (assume db is ready if app is running)
  app.get('/ready', (req, res) => {
    res.sendStatus(200);
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
    
    const { username, password } = req.body;
    const rows = await dbService.query('SELECT * FROM users WHERE username = ?', [username]);    
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    
    const row = rows[0];
    const match = await bcrypt.compare(password, row.password);
    if (!match) {      
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    
    req.session.userId = row.id;
    req.session.username = row.username;
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

  app.get('/logout', (req, res) => {
    const userId = req.session.userId;
    req.session.destroy(() => {
      if (userId) {
        dbService.emit('user:logout', { userId });
      }
      res.redirect('index.html');

    });
  });

  // Session routes
  app.get('/api/sessions', ensureLoggedIn, async (req, res) => {
    try {
      const sessions = await dbService.query(
        `SELECT s.*, l.name as location_name 
         FROM sessions s
         LEFT JOIN locations l ON s.location_id = l.id
         WHERE s.user_id = ? 
         ORDER BY start_time DESC`,
        [req.session.userId]
      );
      res.json(sessions);
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/sessions', ensureLoggedIn, async (req, res) => {
    try {
      const { location_id } = req.body;
      const { lastID } = await dbService.run(
        'INSERT INTO sessions (user_id, location_id) VALUES (?, ?)',
        [req.session.userId, location_id || 0]
      );
      const newSession = await dbService.query(
        `SELECT s.*, l.name as location_name 
         FROM sessions s
         LEFT JOIN locations l ON s.location_id = l.id
         WHERE s.id = ?`, 
        [lastID]
      );
      const session = newSession[0];
      
      console.log(`Created session ${session.id} for user ${req.session.userId}`);
      
      dbService.emit('session:created', session);
      
      // Notify followers about new session
      await notifyFollowers(
        req.session.userId,
        'session_started',
        {
          sessionId: session.id,
          date: session.start_time,
          username: req.session.username
        }
      );
      
      res.json(session);
    } catch (err) {
      handleError(res, err);
    }
  });

  app.delete('/api/sessions/:id', ensureLoggedIn, async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const userId = req.session.userId;
      console.log(`Deleting session ${sessionId} for user ${userId}`);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (isNaN(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID' });
      }

      const result = await dbService.transaction(async () => {
      const session = await dbService.query(
        `SELECT s.*, l.name as location_name 
         FROM sessions s
         LEFT JOIN locations l ON s.location_id = l.id
         WHERE s.id = ? AND s.user_id = ?`,
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

      const sessionData = {
        sessionId: sessionId,
        userId,
        sessionData: result.session
      };
      dbService.emit('session:deleted', sessionData);

      // Notify followers about session deletion
      await notifyFollowers(
        userId,
        'session_deleted',
        {
          sessionId: sessionId,
          date: result.session.start_time,
          username: req.session.username
        }
      );

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
        `SELECT s.*, l.name as location_name 
         FROM sessions s
         LEFT JOIN locations l ON s.location_id = l.id
         WHERE s.id = ? AND s.user_id = ?`,
        [id, userId]
      );
      
      if (sessionRows.length === 0) {
        return res.status(404).json({ error: 'not found' });
      }

      const session = sessionRows[0];
      const sets = await dbService.query(
        `SELECT s.*, e.id as exercise_id, e.name as exercise_name 
         FROM sets s
         JOIN exercises e ON s.exercise_id = e.id
         WHERE s.session_id = ?
         ORDER BY s.id`,
        [id]
      );

      const formattedSets = sets.map(set => ({
        id: set.id,
        reps: set.reps,
        weight: set.weight,
        exercise: {
          id: set.exercise_id,
          name: set.exercise_name
        }
      }));

      dbService.emit('session:accessed', { sessionId: id, userId });
      res.json({ 
        ...session, 
        sets: formattedSets 
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  // --- GLOBAL EXERCISE ENDPOINTS ---

  // Create a new exercise (global)
  app.post('/api/exercises', ensureLoggedIn, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    try {
      const result = await dbService.run('INSERT INTO exercises (name) VALUES (?)', [name]);
      res.status(201).json({ id: result.lastID, name });
    } catch (e) {
      res.status(400).json({ error: 'Exercise already exists or invalid' });
    }
  });

  // Delete an exercise (only if not referenced in sets)
  app.delete('/api/exercises/:id', ensureLoggedIn, async (req, res) => {
    const { id } = req.params;
    const used = await dbService.query('SELECT 1 FROM sets WHERE exercise_id = ?', [id]);
    if (used.length > 0) return res.status(400).json({ error: 'Exercise is in use' });
    const result = await dbService.run('DELETE FROM exercises WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Exercise not found' });
    res.json({ id: Number(id) });
  });

  // --- SETS ENDPOINT ---

  const { calculate1RM } = require('./utils');

// ... (rest of the file)

// Endpoint matching frontend expectation
  app.post('/api/sessions/:id/sets', ensureLoggedIn, async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id, 10);
      const { exercise_id, reps, weight } = req.body;
      const userId = req.session.userId;
      
      if (isNaN(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID' });
      }

      if (!exercise_id || reps === undefined) {
        return res.status(400).json({ error: 'exercise_id and reps are required' });
      }
      if (typeof reps !== 'number' || !Number.isInteger(reps) || reps <= 0) {
        return res.status(400).json({ error: 'Reps must be a positive integer.' });
      }
      if (weight !== undefined && weight !== null && (typeof weight !== 'number' || weight < 0)) {
        return res.status(400).json({ error: 'Weight must be a non-negative number.' });
      }
      //Retrieve exercise name and hrow error if exercise does not exist
      const exercise = await dbService.query('SELECT * FROM exercises WHERE id = ?', [exercise_id]);
      if (exercise.length ===  0) {
        return res.status(404).json({ error: 'Exercise not found' });
      }
      const exercise_name = exercise[0].name;


      // Verify session exists and belongs to user
      const sess = await dbService.query(
        'SELECT * FROM sessions WHERE id = ? AND user_id = ?',
        [sessionId, req.session.userId]
      );
      if (!sess.length) return res.status(404).json({ error: 'Session not found' });

      // Create set
      const result = await dbService.run(
        'INSERT INTO sets (exercise_id, session_id, reps, weight, created_at) VALUES (?, ?, ?, ?, strftime(\'%Y-%m-%d %H:%M:%f\', \'now\'))',
        [exercise_id, sessionId, reps, weight || null]
      );
      const setId = result.lastID;

      // Notify followers about the set
      await notifyFollowers(
        req.session.userId,
        'set_logged',
        { 
          setId,
          exercise_id,
          exercise_name,
          session_id: sessionId,
          reps,
          weight,
          username: req.session.username
        }
      );

      // 1RM Calculation and Personal Record Check
      if (weight > 0 && reps > 0) {
        const oneRM = calculate1RM(weight, reps);

        // Find previous personal record for this exercise (sorted by 1RM desc)
        const [topPR] = await dbService.query(
          `SELECT data FROM user_activities 
           WHERE user_id = ? AND type = 'personal_record' 
           AND json_extract(data, '$.exercise_id') = ?
           ORDER BY json_extract(data, '$.oneRM') DESC
           LIMIT 1`,
          [userId, exercise_id]
        );
        const oldPR = topPR ? JSON.parse(topPR.data).oneRM : 0;

        if (oneRM > oldPR) {
          // New personal record!
          await notifyFollowers(
            userId,
            'personal_record',
            {
              exercise_id,
              exercise_name,
              oneRM: parseFloat(oneRM.toFixed(2)),
              reps,
              weight,
              username: req.session.username,
              setId
            }
          );
        }
      }

      res.status(201).json({ 
        id: setId,
        exercise_id,
        session_id: sessionId,
        reps,
        weight
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.delete('/api/sets/:id', ensureLoggedIn, async (req, res) => {
    try {
      const id = req.params.id;
      const userId = req.session.userId;

      const result = await dbService.transaction(async (db) => {
        // First verify the set exists and belongs to user
        const set = await dbService.query(
          `SELECT s.* FROM sets s
           JOIN sessions sess ON s.session_id = sess.id
           WHERE s.id = ? AND sess.user_id = ?`,
          [id, userId]
        );
        
        if (set.length === 0) {
          return { changes: 0 };
        }

        // Delete the set
        const result = await dbService.run(
          `DELETE FROM sets WHERE id = ?`,
          [id]
        );
        
        // Return deleted set info for event emission
        return { ...result, set: set[0] };

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
          `SELECT s.*, l.name as location_name 
           FROM sessions s
           LEFT JOIN locations l ON s.location_id = l.id
           WHERE s.id = ? AND s.user_id = ?`,
          [id, userId]
        );
        
        if (session.length === 0) return { changes: 0 };        

        // Update and return the updated session data
        const updatedSession = await dbService.query(
          `UPDATE sessions 
          SET closed = 1, end_time = CURRENT_TIMESTAMP 
          WHERE id = ? AND user_id = ?
          RETURNING *`,
          [id, userId]
        );

        return { 
          changes: 1, 
          session: updatedSession[0] // Now contains end_time
        };
      });

      if (result.changes === 0) {
        return res.status(404).json({ error: 'session not found' });
      }

      const sessionData = {
        sessionId: id,
        userId,
        sessionData: result.session
      };
      dbService.emit('session:closed', sessionData);      
      
      // Notify followers about session ending
      await notifyFollowers(
        userId,
        'session_ended',
        {
          sessionId: id,
          date: result.session.start_time,
          duration: Math.floor((new Date(result.session.end_time) - new Date(result.session.start_time)) / 60000),
          username: req.session.username
        }
      );

      res.json({ id });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Find user by username
app.get('/api/user', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'Username required' });
  const users = await dbService.query('SELECT id, username FROM users WHERE username = ?', [username]);
  if (users.length === 0) return res.status(404).json({ error: 'User not found' });
  res.json(users[0]);
});

// Follow user endpoint (now uses path parameter)
app.post('/api/follow/:userId', ensureLoggedIn, async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (!userId) return res.status(400).json({ error: 'User ID required' });
  if (userId === req.session.userId) return res.status(400).json({ error: 'Cannot follow yourself' });
  // Check if already following
  const exists = await dbService.query('SELECT * FROM follows WHERE follower_id = ? AND following_id = ?', [req.session.userId, userId]);
  if (exists.length > 0) return res.status(400).json({ error: 'Already following this user' });
  await dbService.run('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)', [req.session.userId, userId]);
  res.json({ success: true });
});

  // Unfollow a user
  app.delete('/api/follow/:userId', ensureLoggedIn, async (req, res) => {
    try {
      const followingId = parseInt(req.params.userId);
      const followerId = req.session.userId;

      await dbService.run(
        'DELETE FROM follows WHERE follower_id = ? AND following_id = ?',
        [followerId, followingId]
      );

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Get user's followers
  app.get('/api/followers', ensureLoggedIn, async (req, res) => {
    try {
      const userId = req.session.userId;
      const followers = await dbService.query(
        `SELECT u.id, u.username 
         FROM follows f 
         JOIN users u ON f.follower_id = u.id 
         WHERE f.following_id = ?`,
        [userId]
      );
      res.json(followers);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Get user's following (including groups)
  app.get('/api/following', ensureLoggedIn, async (req, res) => {
    try {
      const userId = req.session.userId;
      const following = await dbService.query(
        `SELECT u.id, u.username, u.is_group_user
         FROM follows f 
         JOIN users u ON f.following_id = u.id 
         WHERE f.follower_id = ?`,
        [userId]
      );
      res.json(following);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Get user's notifications
  app.get('/api/notifications', ensureLoggedIn, async (req, res) => {
    try {
      const userId = req.session.userId;
      const notifications = await dbService.query(
        `SELECT id, activity_id, type, data, is_read, created_at 
         FROM notifications 
         WHERE user_id = ? 
         ORDER BY created_at DESC 
         LIMIT 50`,
        [userId]
      );
      res.json(notifications);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Mark notification as read
  app.put('/api/notifications/:id/read', ensureLoggedIn, async (req, res) => {
    try {
      const userId = req.session.userId;
      const notificationId = parseInt(req.params.id);

      await dbService.run(
        'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
        [notificationId, userId]
      );

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Helper function to create notifications for followers
  async function notifyFollowers(userId, activityType, activityData) {
    try {
      // First log the activity and get its ID
      const activityResult = await dbService.run(
        'INSERT INTO user_activities (user_id, type, data) VALUES (?, ?, ?)',
        [userId, activityType, JSON.stringify(activityData)]
      );
      const activityId = activityResult.lastID;

      // Get followers
      const followers = await dbService.query(
        `SELECT follower_id 
         FROM follows 
         WHERE following_id = ?`,
        [userId]
      );
      
      // Notify each follower
      for (const follower of followers) {
        await dbService.run(
          `INSERT INTO notifications (user_id, activity_id, type, data) VALUES (?, ?, ?, ?)`,
          [follower.follower_id, activityId, activityType, JSON.stringify(activityData)]
        );
      }
    } catch (err) {
      console.error('Error notifying followers:', err);
    }
  }

  // Helper function to notify group members
  async function notifyGroupMembers(groupId, activityType, activityData) {
    try {
      // Get group user ID
      const group = await dbService.query(
        'SELECT group_user_id FROM groups WHERE id = ?',
        [groupId]
      );
      
      if (group.length === 0) {
        throw new Error('Group not found');
      }
      
      const groupUserId = group[0].group_user_id;
      
      // Create activity under group user
      const activityResult = await dbService.run(
        'INSERT INTO user_activities (user_id, type, data) VALUES (?, ?, ?)',
        [groupUserId, activityType, JSON.stringify(activityData)]
      );
      const activityId = activityResult.lastID;
      
      // Get group members (excluding the group user itself)
      const members = await dbService.query(
        `SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ?`,
        [groupId, groupUserId]
      );
      
      // Notify each member
      for (const member of members) {
        await dbService.run(
          `INSERT INTO notifications (user_id, activity_id, type, data) VALUES (?, ?, ?, ?)`,
          [member.user_id, activityId, activityType, JSON.stringify(activityData)]
        );
      }
    } catch (err) {
      console.error('Error notifying group members:', err);
    }
  }

  // Get current user info
  app.get('/api/me', ensureLoggedIn, async (req, res) => {    
    try {
      const userId = req.session.userId;
      const user = await dbService.query('SELECT id, username FROM users WHERE id = ?', [userId]);
      if (!user.length) return res.status(404).json({ error: 'User not found' });
      res.json(user[0]);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Get all exercises
  app.get('/api/exercises', ensureLoggedIn, async (req, res) => {
    try {
      const exercises = await dbService.query('SELECT * FROM exercises');
      res.json(exercises);
    } catch (err) {
      console.error('Error fetching exercises:', err);
      res.status(500).json({ error: 'Failed to fetch exercises' });
    }
  });

  // Location management endpoints
  app.get('/api/locations', ensureLoggedIn, async (req, res) => {
    try {
      const locations = await dbService.query('SELECT * FROM locations');
      res.json(locations);
    } catch (err) {
      console.error('Error fetching locations:', err);
      res.status(500).json({ error: 'Failed to fetch locations' });
    }
  });

  app.post('/api/locations', ensureLoggedIn, async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'Location name required' });
      if (name.toLowerCase() === '<undisclosed>') {
        return res.status(400).json({ error: 'Cannot create location with reserved name' });
      }
      
      const result = await dbService.run(
        'INSERT INTO locations (name) VALUES (?)',
        [name]
      );
      res.status(201).json({ id: result.lastID, name });
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        res.status(409).json({ error: 'Location name already exists' });
      } else {
        console.error('Error creating location:', err);
        res.status(500).json({ error: 'Failed to create location' });
      }
    }
  });

  app.delete('/api/locations/:id', ensureLoggedIn, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (id === 0) return res.status(400).json({ error: 'Cannot delete default location' });

      const result = await dbService.run(
        'DELETE FROM locations WHERE id = ?',
        [id]
      );
      
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Location not found' });
      }
      
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting location:', err);
      res.status(500).json({ error: 'Failed to delete location' });
    }
  });

  // Get followed users
  app.get('/api/follows', ensureLoggedIn, async (req, res) => {
    const users = await dbService.query(
      `SELECT u.id, u.username FROM users u
       JOIN follows f ON u.id = f.following_id
       WHERE f.follower_id = ?`,
      [req.session.userId]
    );
    res.json(users);
  });

  // Create a challenge
app.post('/api/challenges', ensureLoggedIn, async (req, res) => {
  const { challenged_activity_id, expires_at } = req.body;
  const challenger_user_id = req.session.userId;
  if (!challenged_activity_id) {
    return res.status(400).json({ error: 'Missing activity_id' });
  }

  // Get activity owner from user_activities table
  const activityOwner = await dbService.query(
    `SELECT user_id FROM user_activities WHERE id = ?`,
    [challenged_activity_id]
  );
  if (!activityOwner.length) {
    return res.status(404).json({ error: 'Activity not found' });
  }
  const challenged_user_id = activityOwner[0].user_id;

  // Prevent self-challenges
  if (challenger_user_id === challenged_user_id) {
    return res.status(400).json({ error: 'Cannot challenge your own activity' });
  }
  // Check if activity is already certified
  const certified = await dbService.query('SELECT 1 FROM certifications WHERE activity_id = ?', [challenged_activity_id]);
  if (certified.length > 0) {
    return res.status(400).json({ error: 'Activity already certified' });
  }
  // Check if already challenged
  const existing = await dbService.query('SELECT 1 FROM challenges WHERE challenged_activity_id = ? AND status = "open"', [challenged_activity_id]);
  if (existing.length > 0) {
    return res.status(400).json({ error: 'Activity already challenged' });
  }
  // Check if activity was part of a previously resolved challenge
  const previouslyResolved = await dbService.query(
    `SELECT 1 FROM challenges 
     WHERE challenged_activity_id = ? 
     AND status = 'closed'
     AND resolution_reason IN ('resolved_by_superior', 'certified')`,
    [challenged_activity_id]
  );
  if (previouslyResolved.length > 0) {
    return res.status(400).json({ error: 'This activity has already been successfully resolved and cannot be challenged again' });
  }
  await dbService.run(
    `INSERT INTO challenges (challenged_user_id, challenger_user_id, challenged_activity_id, status, expires_at) VALUES (?, ?, ?, 'open', COALESCE(?, datetime('now', '+14 days')))`,
    [challenged_user_id, challenger_user_id, challenged_activity_id, expires_at || null]
  );
  res.json({ success: true });
});

  // Certify an activity
app.post('/api/certifications', ensureLoggedIn, async (req, res) => {
  const { activity_id } = req.body;
  const certifier_id = req.session.userId;
  if (!activity_id) return res.status(401).json({ error: 'Missing activity_id' });
  // Check if already certified
  const certified = await dbService.query('SELECT 1 FROM certifications WHERE activity_id = ? ', [activity_id]);
  if (certified.length > 0) return res.status(402).json({ error: 'Already certified' });

   // Get activity owner from user_activities table
  const activityOwner = await dbService.query(
    `SELECT user_id FROM user_activities WHERE id = ?`,
    [activity_id]
  );
  
  if (!activityOwner.length) {
    return res.status(403).json({ error: 'Activity not found' });
  }

  if (activityOwner[0].user_id == certifier_id) {
    return res.status(404).json({ error: 'Cannot certify your own activity' });
  }  

  
  await dbService.run(    
    `INSERT INTO certifications (activity_id, certifier_id) VALUES (?, ?)`,
    [activity_id, certifier_id]
  );
  // Close any open challenges on this activity
  await dbService.run(
    `UPDATE challenges SET status = 'closed', closed_at = CURRENT_TIMESTAMP, resolution_reason = 'certified' WHERE challenged_activity_id = ? AND status = 'open'`,
    [activity_id]
  );
  res.json({ success: true });
});

// Check if activity is certified
app.get('/api/certifications/:id', ensureLoggedIn, async (req, res) => {
  try {
    const activityId = req.params.id;
    const certification = await dbService.query(
      'SELECT 1 FROM certifications WHERE activity_id = ?',
      [activityId]
    );
    res.status(200).json({ certified: certification.length > 0 });
  } catch (err) {
    handleError(res, err);
  }
});


// List challenges for a user with status filtering
app.get('/api/challenges', ensureLoggedIn, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { status = 'both' } = req.query;
    
    // Validate status parameter
    if (!['open', 'closed', 'both'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value. Must be "open", "closed", or "both"' });
    }

    let query = 'SELECT * FROM challenges WHERE challenged_user_id = ?';
    const params = [userId];
    
    if (status !== 'both') {
      query += ' AND status = ?';
      params.push(status);
    }

    const challenges = await dbService.query(query, params);
    res.json(challenges);
  } catch (err) {
    handleError(res, err);
  }
});

  // List challenges given by a user with status filtering
  app.get('/api/challenges/given', ensureLoggedIn, async (req, res) => {
    try {
      const userId = req.session.userId;
      const { status = 'both' } = req.query;
      
      if (!['open', 'closed', 'both'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status value. Must be "open", "closed", or "both"' });
      }

      let query = 'SELECT * FROM challenges WHERE challenger_user_id = ?';
      const params = [userId];
      
      if (status !== 'both') {
        query += ' AND status = ?';
        params.push(status);
      }

      const challenges = await dbService.query(query, params);
      res.json(challenges);
    } catch (err) {
      handleError(res, err);
    }
  });

  // Check if activity has an open challenge
  app.get('/api/challenges/:id', ensureLoggedIn, async (req, res) => {
    try {
      const activityId = req.params.id;
      
      // Check if there's an open challenge for this activity
      const challenge = await dbService.query(
        'SELECT 1 FROM challenges WHERE challenged_activity_id = ? AND status = "open"',
        [activityId]
      );

      res.json({ hasOpenChallenge: challenge.length > 0 });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Get activity details by ID
  app.get('/api/activities/:id', ensureLoggedIn, async (req, res) => {
    try {
      const activityId = req.params.id;
      const userId = req.session.userId;

      // Get activity from database
      const activity = await dbService.query(
        'SELECT * FROM user_activities WHERE id = ?',
        [activityId]
      );

      if (!activity.length) {
        return res.status(404).json({ error: 'Activity not found' });
      }

      // Return activity details
      res.json({
        id: activity[0].id,
        user_id: activity[0].user_id,
        type: activity[0].type,
        data: JSON.parse(activity[0].data),
        created_at: activity[0].created_at
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Groups API endpoints
  // Create a new group
  app.post('/api/groups', ensureLoggedIn, async (req, res) => {
    try {
      const { name, description } = req.body;
      const userId = req.session.userId;
      
      if (!name) {
        return res.status(400).json({ error: 'Group name is required' });
      }
      
      // Check if group name already exists
      const existingGroup = await dbService.query(
        'SELECT * FROM groups WHERE name = ?',
        [name]
      );
      
      if (existingGroup.length > 0) {
        return res.status(400).json({ error: 'Group name already exists' });
      }
      
      // Create the group user account first
      const groupUsername = `group_${name.toLowerCase().replace(/\s+/g, '_')}`;
      const groupUserResult = await dbService.run(
        'INSERT INTO users (username, password, is_group_user) VALUES (?, ?, ?)',
        [groupUsername, 'group_password', 1]
      );
      
      // Create the group with group_user_id
      const result = await dbService.run(
        'INSERT INTO groups (name, description, owner_id, group_user_id) VALUES (?, ?, ?, ?)',
        [name, description || null, userId, groupUserResult.lastID]
      );
      
      // Add the creator as a member and make them follow the group user
      await dbService.transaction(async () => {
        await dbService.run(
          'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
          [result.lastID, userId]
        );
        await dbService.run(
          'INSERT INTO follows (follower_id, following_id) VALUES (?, ?)',
          [userId, groupUserResult.lastID]
        );
      });
      
      // Get the created group with owner info
      const group = await dbService.query(
        `SELECT g.*, u.username as owner_username 
         FROM groups g 
         JOIN users u ON g.owner_id = u.id 
         WHERE g.id = ?`,
        [result.lastID]
      );
      
      res.status(201).json(group[0]);
    } catch (err) {
      handleError(res, err);
    }
  });

  // List groups where user is a member
  app.get('/api/groups', ensureLoggedIn, async (req, res) => {
    try {
      const userId = req.session.userId;
      
      const groups = await dbService.query(
        `SELECT g.*, u.username as owner_username,
                CASE WHEN gm.user_id IS NOT NULL THEN 1 ELSE 0 END as is_member,
                CASE WHEN g.owner_id = ? THEN 1 ELSE 0 END as is_owner
         FROM groups g
         JOIN users u ON g.owner_id = u.id
         LEFT JOIN group_members gm ON g.id = gm.group_id AND gm.user_id = ?
         ORDER BY g.created_at DESC`,
        [userId, userId]
      );
      
      res.json(groups);
    } catch (err) {
      handleError(res, err);
    }
  });

  // Get group details and members
  app.get('/api/groups/:id', ensureLoggedIn, async (req, res) => {
    try {
      const groupId = parseInt(req.params.id);
      const userId = req.session.userId;
      
      if (isNaN(groupId)) {
        return res.status(400).json({ error: 'Invalid group ID' });
      }
      
      // Get group details
      const group = await dbService.query(
        `SELECT g.*, u.username as owner_username,
                CASE WHEN gm.user_id IS NOT NULL THEN 1 ELSE 0 END as is_member,
                CASE WHEN g.owner_id = ? THEN 1 ELSE 0 END as is_owner
         FROM groups g
         JOIN users u ON g.owner_id = u.id
         LEFT JOIN group_members gm ON g.id = gm.group_id AND gm.user_id = ?
         WHERE g.id = ?`,
        [userId, userId, groupId]
      );
      
      if (group.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }
      
      // Get group members
      const members = await dbService.query(
        `SELECT u.id, u.username, gm.joined_at,
                CASE WHEN g.owner_id = u.id THEN 1 ELSE 0 END as is_owner
         FROM group_members gm
         JOIN users u ON gm.user_id = u.id
         JOIN groups g ON gm.group_id = g.id
         WHERE gm.group_id = ?
         ORDER BY gm.joined_at ASC`,
        [groupId]
      );
      
      res.json({
        ...group[0],
        members
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Join a group
  app.post('/api/groups/:id/join', ensureLoggedIn, async (req, res) => {
    try {
      const groupId = parseInt(req.params.id);
      const userId = req.session.userId;
      
      if (isNaN(groupId)) {
        return res.status(400).json({ error: 'Invalid group ID' });
      }
      
      // Check if group exists and get group_user_id
      const group = await dbService.query(
        'SELECT * FROM groups WHERE id = ?',
        [groupId]
      );
      
      if (group.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }
      
      // Check if user is already a member
      const existingMember = await dbService.query(
        'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
        [groupId, userId]
      );
      
      if (existingMember.length > 0) {
        return res.status(400).json({ error: 'Already a member of this group' });
      }
      
      // Add user to group and make them follow the group user if not already following
      await dbService.transaction(async () => {
        await dbService.run(
          'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
          [groupId, userId]
        );
        
        // Check if follow relationship already exists
        const existingFollow = await dbService.query(
          'SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?',
          [userId, group[0].group_user_id]
        );
        
        if (existingFollow.length === 0) {
          await dbService.run(
            'INSERT INTO follows (follower_id, following_id) VALUES (?, ?)',
            [userId, group[0].group_user_id]
          );
        }
      });
      
      res.json({ success: true });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Leave a group
  app.delete('/api/groups/:id/leave', ensureLoggedIn, async (req, res) => {
    try {
      const groupId = parseInt(req.params.id);
      const userId = req.session.userId;
      
      if (isNaN(groupId)) {
        return res.status(400).json({ error: 'Invalid group ID' });
      }
      
      // Check if user is the owner
      const group = await dbService.query(
        'SELECT * FROM groups WHERE id = ? AND owner_id = ?',
        [groupId, userId]
      );
      
      if (group.length > 0) {
        return res.status(400).json({ error: 'Group owner cannot leave the group. Transfer ownership or delete the group instead.' });
      }
      
      // Remove user from group
      const result = await dbService.run(
        'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
        [groupId, userId]
      );
      
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Not a member of this group' });
      }
      
      res.json({ success: true });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Delete a group (owner only)
  app.delete('/api/groups/:id', ensureLoggedIn, async (req, res) => {
    try {
      const groupId = parseInt(req.params.id);
      const userId = req.session.userId;
      
      if (isNaN(groupId)) {
        return res.status(400).json({ error: 'Invalid group ID' });
      }
      
      // Check if user is the owner
      const group = await dbService.query(
        'SELECT * FROM groups WHERE id = ? AND owner_id = ?',
        [groupId, userId]
      );
      
      if (group.length === 0) {
        return res.status(403).json({ error: 'Only group owner can delete the group' });
      }
      
      // Delete the group (cascades to group_members)
      const result = await dbService.run(
        'DELETE FROM groups WHERE id = ?',
        [groupId]
      );
      
      res.json({ success: true });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Post activity to a group
  app.post('/api/groups/:id/activities', ensureLoggedIn, async (req, res) => {
    try {
      const groupId = parseInt(req.params.id);
      const userId = req.session.userId;
      const { type, data } = req.body;
      
      if (isNaN(groupId)) {
        return res.status(400).json({ error: 'Invalid group ID' });
      }
      
      // Verify user is a member of the group
      const isMember = await dbService.query(
        'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
        [groupId, userId]
      );
      
      if (isMember.length === 0) {
        return res.status(403).json({ error: 'Only group members can post activities' });
      }
      
      // Notify all group members
      await notifyGroupMembers(
        groupId,
        type,
        {
          ...data,
          groupId,
          postedBy: userId,
          postedByUsername: req.session.username
        }
      );
      
      res.json({ success: true });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Add 404 handler for undefined routes
  // Admin query endpoint
  app.post('/admin/query', requireAdminApiKey, async (req, res) => {
    try {
      const { sql } = req.body;
      if (!sql) {
        return res.status(400).json({ error: 'SQL query required' });
      }
      const results = await dbService.query(sql);
      res.json(results);
    } catch (err) {
      console.error('Admin query error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  return app;
}

module.exports = createApp;

// If run directly, start the server
if (require.main === module) {
  const dbService = new DatabaseService(DB_FILE);
  // Initialize database before creating app
  const { initializeDatabase } = require('./db/init');
  initializeDatabase(dbService, true, true).then(() => {
    const app = createApp({}, dbService);
    app.listen(PORT, () => {
      setupChallengeJobs(dbService); // Start challenge maintenance jobs
      console.log(`Server listening on port ${PORT}`);
    });
  }).catch(err => {
    console.error('Database initialization failed:', err);
    process.exit(1);
  });
}
