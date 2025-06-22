const bcrypt = require('bcrypt');

async function initializeDatabase(dbService, insertDefaultUsers = true) {
    try {
        // Create all tables with IF NOT EXISTS to be idempotent
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

        await dbService.run(`CREATE TABLE IF NOT EXISTS follows (
            follower_id INTEGER NOT NULL,
            following_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (follower_id, following_id),
            FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
        )`);

        await dbService.run(`CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            data TEXT NOT NULL,
            is_read BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);

        await dbService.run(`CREATE TABLE IF NOT EXISTS user_activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
    } catch (err) {
        console.error('Database initialization failed:', err);
        throw err; // Re-throw to allow callers to handle
    }
}

module.exports = { initializeDatabase };
