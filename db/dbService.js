const sqlite3 = require('sqlite3').verbose();
const { EventEmitter } = require('events');

class DatabaseService extends EventEmitter {
  constructor(dbFile = ':memory:') {
    super();
    this.dbFile = dbFile;
    this.pool = [];
    this.maxPoolSize = 5;
    this.initializePool();
  }

  initializePool() {
    for (let i = 0; i < this.maxPoolSize; i++) {
      this.pool.push(this.createConnection());
    }
  }

  createConnection() {
    const db = new sqlite3.Database(this.dbFile);
    db.run('PRAGMA foreign_keys = ON');
    return db;
  }

  async getConnection() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    }
    return this.createConnection();
  }

  async releaseConnection(conn) {
    if (this.pool.length < this.maxPoolSize) {
      this.pool.push(conn);
    } else {
      conn.close();
    }
  }

  async query(sql, params = []) {
    const db = await this.getConnection();
    const self = this; // Store reference to class instance
    try {
      return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
          self.releaseConnection(db);
          if (err) {
            self.emit('error', err);
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });
    } catch (err) {
      self.releaseConnection(db);
      throw err;
    }
  }

  async run(sql, params = []) {
    const db = await this.getConnection();
    const self = this; // Store reference to class instance
    try {
      return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
          self.releaseConnection(db);
          if (err) {
            self.emit('error', err);
            reject(err);
          } else {
            resolve(this);
          }
        });
      });
    } catch (err) {
      self.releaseConnection(db);
      throw err;
    }
  }

  async transaction(operations) {
    const db = await this.getConnection();
    try {
      await new Promise((resolve, reject) => {
        db.run('BEGIN TRANSACTION', (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      const result = await operations(db);

      await new Promise((resolve, reject) => {
        db.run('COMMIT', (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      this.releaseConnection(db);
      return result;
    } catch (err) {
      await new Promise((resolve) => {
        db.run('ROLLBACK', () => resolve());
      });
      this.releaseConnection(db);
      throw err;
    }
  }

  async close() {
    await Promise.all(this.pool.map(conn => 
      new Promise(resolve => conn.close(resolve))
    ));
    this.pool = [];
  }
}

module.exports = DatabaseService;
