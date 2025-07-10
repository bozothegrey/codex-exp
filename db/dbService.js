const { Client } = require('pg');
const { EventEmitter } = require('events');

class DatabaseService extends EventEmitter {
  constructor(env = process.env.NODE_ENV || 'development') {
    super();
    this.env = env;
    this._db = null;
    this._initialized = false;
    this.ssl = this.env === 'production' ? { rejectUnauthorized: false } : false;
  }

  async getConnection() {
    if (this._db) return this._db;
    
    this._db = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: this.ssl
    });
    
    try {
      await this._db.connect();
      await this._initializeDb(this._db);
      return this._db;
    } catch (err) {
      this._db = null;
      this.emit('error', err);
      throw err;
    }
  }

  async _initializeDb(db) {
    if (this._initialized) return;
    
    // Enable foreign key constraints
    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    
    const initModule = require('./init');
    await initModule.initializeDatabase({
      run: async (sql, params) => {
        const result = await db.query(sql, params);
        return { 
          lastID: result.rows[0]?.id,
          changes: result.rowCount 
        };
      },
      query: (sql, params) => db.query(sql, params)
    });
    
    this._initialized = true;
  }

  async query(sql, params = []) {
    const db = await this.getConnection();
    try {
      const result = await db.query(sql, params);
      return result.rows;
    } catch (err) {
      this.emit('error', err);
      throw err;
    }
  }

  async run(sql, params = []) {
    const db = await this.getConnection();
    try {
      const result = await db.query(sql, params);
      return {
        lastID: result.rows[0]?.id,
        changes: result.rowCount
      };
    } catch (err) {
      this.emit('error', err);
      throw err;
    }
  }

  async transaction(operations) {
    const db = await this.getConnection();
    try {
      await db.query('BEGIN');
      const result = await operations(db);
      await db.query('COMMIT');
      return result;
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  }

  async close() {
    if (this._db) {
      try {
        await this._db.end();
      } catch (err) {
        this.emit('error', err);
      } finally {
        this._db = null;
        this._initialized = false;
      }
    }
  }
}

module.exports = DatabaseService;
