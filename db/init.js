const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

async function initializeDatabase(dbService, insertDefaultUsers = false, insertDefaultExercises = false) {
    try {
        // Create all tables with IF NOT EXISTS to be idempotent
        // TODO admin rights for exercises creation, location create etc
        await dbService.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            admin INTEGER DEFAULT 0,
            is_group_user BOOLEAN DEFAULT 0
        )`);

        // Migration: Add is_group_user column if needed
        const userColumns = await dbService.query(`PRAGMA table_info(users)`);
        const hasIsGroupUser = userColumns.some(col => col.name === 'is_group_user');
        if (!hasIsGroupUser) {
          await dbService.run(`ALTER TABLE users ADD COLUMN is_group_user BOOLEAN DEFAULT 0`);
        }

        // Create locations table
        await dbService.run(`CREATE TABLE IF NOT EXISTS locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            UNIQUE(name) ON CONFLICT FAIL
        )`);

        // Check if default location exists before inserting
        const result = await dbService.run(
          `INSERT OR IGNORE INTO locations (id, name) VALUES (0, 'undisclosed')`
        );

        if (result.changes > 0) {
            console.log('Default location <undisclosed> was inserted successfully.');
        } else {
            console.log('Default location <undisclosed> already exists. No changes made.');
        }
        
        await dbService.run(`CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            end_time TIMESTAMP,
            location_id INTEGER DEFAULT 0,
            closed INTEGER DEFAULT 0,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(location_id) REFERENCES locations(id)
        )`);

        // Migration: Add location_id column to existing sessions if needed
        try {
            const columns = await dbService.query(`PRAGMA table_info(sessions)`);
            const hasLocationId = columns.some(col => col.name === 'location_id');
            
            if (!hasLocationId) {
                // Add column with default value 0
                await dbService.run(`ALTER TABLE sessions ADD COLUMN location_id INTEGER DEFAULT 1`);
                
                // Ensure foreign key constraint
                await dbService.run(`
                    CREATE TABLE sessions_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        end_time TIMESTAMP,
                        location_id INTEGER DEFAULT 0,
                        closed INTEGER DEFAULT 0,
                        FOREIGN KEY(user_id) REFERENCES users(id),
                        FOREIGN KEY(location_id) REFERENCES locations(id)
                    )
                `);
                
                // Copy data to new table
                await dbService.run(`
                    INSERT INTO sessions_new 
                    SELECT id, user_id, start_time, end_time, 0 as location_id, closed 
                    FROM sessions
                `);
                
                // Replace old table with new one
                await dbService.run(`DROP TABLE sessions`);
                await dbService.run(`ALTER TABLE sessions_new RENAME TO sessions`);
            }
        } catch (err) {
            console.error('Location migration failed:', err);
        }

        
                
        // New global exercises table
        await dbService.run(`CREATE TABLE IF NOT EXISTS exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )`);

        // Sets table links to exercise_id and session_id
        await dbService.run(`CREATE TABLE IF NOT EXISTS sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            exercise_id INTEGER NOT NULL,
            reps INTEGER NOT NULL,
            weight REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
            FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )`);

        // Migration: Check if created_at column exists first
        try {
            const columns = await dbService.query(`PRAGMA table_info(sets)`);
            const hasCreatedAt = columns.some(col => col.name === 'created_at');
            
            if (!hasCreatedAt) {
                // First add column without default
                await dbService.run(`ALTER TABLE sets ADD COLUMN created_at TIMESTAMP`);
                
                // Backfill existing sets with session start_time
                await dbService.run(`
                    UPDATE sets 
                    SET created_at = (
                        SELECT start_time 
                        FROM sessions 
                        WHERE sessions.id = sets.session_id
                    )
                `);
                
                // Add default constraint for new rows
                await dbService.run(`
                    CREATE TABLE sets_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id INTEGER NOT NULL,
                        exercise_id INTEGER NOT NULL,
                        reps INTEGER NOT NULL,
                        weight REAL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
                        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
                    )
                `);
                
                // Copy data to new table
                await dbService.run(`
                    INSERT INTO sets_new 
                    SELECT id, session_id, exercise_id, reps, weight, created_at 
                    FROM sets
                `);
                
                // Replace old table with new one
                await dbService.run(`DROP TABLE sets`);
                await dbService.run(`ALTER TABLE sets_new RENAME TO sets`);
            }
        } catch (err) {
            console.error('Migration failed:', err);
        }

        await dbService.run(`CREATE TABLE IF NOT EXISTS follows (
            follower_id INTEGER NOT NULL,
            following_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (follower_id, following_id),
            FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
        )`);

        // user_activities must be created before notifications due to FK
        await dbService.run(`CREATE TABLE IF NOT EXISTS user_activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);

        await dbService.run(`CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            activity_id INTEGER,
            type TEXT NOT NULL,            
            data TEXT NOT NULL,
            is_read BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (activity_id) REFERENCES user_activities(id) ON DELETE SET NULL
        )`);

        await dbService.run(`CREATE TABLE IF NOT EXISTS certifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            activity_id INTEGER NOT NULL,
            certifier_id INTEGER NOT NULL,            
            certified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(activity_id, certifier_id),
            FOREIGN KEY (activity_id) REFERENCES user_activities(id) ON DELETE CASCADE,
            FOREIGN KEY (certifier_id) REFERENCES users(id) ON DELETE CASCADE
        )`);

        await dbService.run(`CREATE TABLE IF NOT EXISTS challenges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            challenged_user_id INTEGER NOT NULL,
            challenger_user_id INTEGER NOT NULL,
            challenged_activity_id INTEGER NOT NULL,
            resolving_activity_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status TEXT NOT NULL CHECK(status IN ('open', 'closed', 'expired')),
            expires_at TIMESTAMP,
            closed_at TIMESTAMP,
            resolution_reason TEXT,
            FOREIGN KEY (challenged_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (challenger_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (challenged_activity_id) REFERENCES user_activities(id) ON DELETE CASCADE,
            FOREIGN KEY (resolving_activity_id) REFERENCES user_activities(id) ON DELETE CASCADE
        )`);

        // Groups functionality
        await dbService.run(`CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            owner_id INTEGER NOT NULL,
            group_user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (group_user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);

        // Migration: Add group_user_id column if needed
        const groupColumns = await dbService.query(`PRAGMA table_info(groups)`);
        const hasGroupUserId = groupColumns.some(col => col.name === 'group_user_id');
        if (!hasGroupUserId) {
          await dbService.run(`ALTER TABLE groups ADD COLUMN group_user_id INTEGER NOT NULL DEFAULT 0`);
          // Need to handle existing groups - set to 0 as placeholder
          // In production you'd want to backfill with actual group user IDs
        }

        await dbService.run(`CREATE TABLE IF NOT EXISTS group_members (
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (group_id, user_id),
            FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);

        // Insert default users if requested and none exist
        if (insertDefaultUsers) {
            const defaultUsers = [
                { username: 'ema', password: 'ghisa' },
                { username: 'SBP', password: 'ghisa' },
                { username: 'dino', password: 'ghisa' }
            ];
            const row = await dbService.query('SELECT COUNT(*) as count FROM users');
            if (row[0].count === 0) {
                for (const u of defaultUsers) {
                    const hash = await bcrypt.hash(u.password, 10);                    
                    await dbService.run(
                        'INSERT INTO users (username, password) VALUES (?, ?)', 
                        [u.username, hash]
                    );
                }
            }
        }
        // import list of exercises from file
        if (insertDefaultExercises) {
            const exercisesPath = path.join(__dirname, 'exercises.json');
            if (fs.existsSync(exercisesPath)) {
            const exercisesData = fs.readFileSync(exercisesPath, 'utf-8');
            let exercises;
            try {
                exercises = JSON.parse(exercisesData);
            } catch (e) {
                throw new Error('Failed to parse exercises.json: ' + e.message);
            }
            if (Array.isArray(exercises) && exercises.length > 0) {
                for (const ex of exercises) {
                try {
                    await dbService.run(
                    'INSERT OR IGNORE INTO exercises (name) VALUES (?)',
                    [ex.name || ex]
                    );
                } catch (e) {
                    // Ignore duplicate or malformed entries
                }
                }
            }
            }
        }

    } catch (err) {
        console.error('Database initialization failed:', err);
        throw err; // Re-throw to allow callers to handle
    }
}

async function clearDatabase(dbService) {
  try {
    await dbService.run('PRAGMA foreign_keys = OFF');
    const tables = await dbService.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
    for (const table of tables) {
      await dbService.run(`DELETE FROM ${table.name}`);
    }
    // Reset autoincrement counters
    await dbService.run("DELETE FROM sqlite_sequence");
  } catch (err) {
    console.error('Failed to clear database:', err);
    throw err;
  } finally {
    await dbService.run('PRAGMA foreign_keys = ON');
  }
}

module.exports = { initializeDatabase, clearDatabase };
