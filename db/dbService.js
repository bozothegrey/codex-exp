const sqlite3 = require('sqlite3').verbose();
const { EventEmitter } = require('events');

class DatabaseService extends EventEmitter {
  constructor(env = 'production') {
    super();
    this.env = env;
    
    // Set DB configuration based on environment
    if (this.env === 'test') {
      this.dbFile = './test.db';
      this.persistent = false;
    } else {
      this.dbFile = process.env.DB_PATH || './gym.db';
      this.persistent = true;
    }

    this._db = null;
    this._initialized = false;
  }

  async ensureDatabaseExists() {
    const fs = require('fs');
    if (!fs.existsSync(this.dbFile)) {
      console.log('Initializing new database file at', this.dbFile);
      // Create empty file if it doesn't exist
      fs.closeSync(fs.openSync(this.dbFile, 'w'));
      // Initialize schema
      await this._initializeDb(await this.getConnection());
    }
  }

  async _initializeDb(db) {
    if (this._initialized) return;
    
    // Initialize database
    await new Promise((resolve, reject) => {
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Initialize schema
    const initModule = require('./init');
    await initModule.initializeDatabase({
      run: (sql, params) => new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve(this);
        });
      }),
      query: (sql, params) => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      })
    });

    this._initialized = true;
  }

  async getConnection() {
    // Reuse existing connection if available
    if (this._db) return this._db;
    await this.ensureDatabaseExists();
    // Create new connection
    this._db = new sqlite3.Database(
      this.dbFile,
      this.dbFile.startsWith('file:') ? { uri: true } : undefined
    );
    
    // Initialize database
    await this._initializeDb(this._db);
    return this._db;
  }

  async query(sql, params = []) {
    const db = await this.getConnection();
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) {
          this.emit('error', err);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async run(sql, params = []) {
    const db = await this.getConnection();
    const self = this; // capture DatabaseService instance
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) {
          self.emit('error', err);
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }



  async transaction(operations) {
    const db = await this.getConnection();
    
    try {
      // Begin transaction
      await new Promise((resolve, reject) => {
        db.run('BEGIN TRANSACTION', (err) => 
          err ? reject(err) : resolve()
        );
      });

      // Execute operations
      const result = await operations(db);

      // Commit transaction
      await new Promise((resolve, reject) => {
        db.run('COMMIT', (err) => 
          err ? reject(err) : resolve()
        );
      });

      return result;
    } catch (err) {
      // Rollback on error
      await new Promise((resolve) => {
        db.run('ROLLBACK', () => resolve());
      });
      throw err;
    }
  }

  async close() {
    if (this._db) {
      await new Promise((resolve) => {
        this._db.close((err) => {
          if (err) this.emit('error', err);
          resolve();
        });
      });
      this._db = null;
      this._initialized = false;
    }
  }
}

module.exports = DatabaseService;
