const bcrypt = require('bcrypt');

async function initializeDatabase(dbService, insertDefaultUsers = false) {
    try {
        // Create all tables with IF NOT EXISTS to be idempotent
        // TODO admin rights for exerciuses creation, location create etc
        await dbService.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            admin INTEGER DEFAULT 0, 
        )`);

        //TODO: location table    
        //TODO: populate LOCATION
        await dbService.run(`CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            location_id INTEGER DEFAULT 0,
            closed INTEGER DEFAULT 0,            
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);
                
        //TODO: disentangle exercises from session; stand-alone table of exercises from which users can pick 
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
            activity_type TEXT NOT NULL,
            certified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(activity_id, certifier_id),
            FOREIGN KEY (activity_id) REFERENCES sets(id) ON DELETE CASCADE,
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
            FOREIGN KEY (challenged_activity_id) REFERENCES sets(id) ON DELETE CASCADE,
            FOREIGN KEY (resolving_activity_id) REFERENCES sets(id) ON DELETE CASCADE
        )`);

        // Insert default users if requested and none exist
        if (insertDefaultUsers) {
            const defaultUsers = [
                { username: 'emanuele', password: 'ghisa' },
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
        // TOPO: import list of exercises from file

    } catch (err) {
        console.error('Database initialization failed:', err);
        throw err; // Re-throw to allow callers to handle
    }
}

module.exports = { initializeDatabase };
