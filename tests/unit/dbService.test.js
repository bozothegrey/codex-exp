const { describe, it, beforeAll, afterAll, beforeEach } = require('@jest/globals');
const assert = require('assert');
const sinon = require('sinon');
const DatabaseService = require('../../db/dbService');

describe('DatabaseService', () => {
  let dbService;
  let errorSpy;

  beforeAll(() => {
    dbService = new DatabaseService(':memory:');
    errorSpy = sinon.spy();
    dbService.on('error', errorSpy);
  });

  afterAll(async () => {
    try {
      await dbService.close();
    } catch (err) {
      console.error('Error during cleanup:', err);
      throw err;
    }
  });

  beforeEach(async () => {
    // Reset database state before each test
    await dbService.run('DROP TABLE IF EXISTS test');
    await dbService.run('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
    errorSpy.resetHistory();
  });

  describe('Error Cases', () => {
    it('should emit error on invalid SQL', async () => {
      await assert.rejects(
        () => dbService.run('INVALID SQL'),
        { name: 'Error' }
      );
      assert.strictEqual(errorSpy.callCount, 1);
    });

    it('should handle connection pool exhaustion', async () => {
      // Exhaust the pool
      const connections = [];
      for (let i = 0; i < dbService.maxPoolSize; i++) {
        connections.push(await dbService.getConnection());
      }

      // Should still work by creating new connection
      await assert.doesNotReject(
        () => dbService.run('SELECT 1')
      );

      // Release connections
      for (const conn of connections) {
        await dbService.releaseConnection(conn);
      }
    });
  });

  describe('Security Tests', () => {
    it('should prevent SQL injection', async () => {
      const maliciousInput = "'; DROP TABLE test;--";
      await dbService.run('INSERT INTO test (value) VALUES (?)', [maliciousInput]);
      
      // Verify table still exists and value was inserted as literal
      const result = await dbService.query('SELECT value FROM test');
      assert.strictEqual(result[0].value, maliciousInput);
    });
  });

  describe('Input Validation', () => {
    it('should reject non-string SQL', async () => {
      await assert.rejects(
        () => dbService.run(123),
        { name: 'TypeError' }
      );
    });

    it('should accept non-array parameters by wrapping them', async () => {
      await assert.doesNotReject(
        () => dbService.run('SELECT ?', 'valid-string')
      );
    });
  });

  describe('Database Initialization', () => {
    it('should initialize all required tables in memory', async () => {
      // Initialize database with all tables
      const { initializeDatabase } = require('../../db/init');
      await initializeDatabase(dbService, false); // Don't insert default users

      // Verify all expected tables exist
      const tables = await dbService.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      );
      const tableNames = tables.map(t => t.name);
      
      const expectedTables = [
        'users', 'sessions', 'exercises', 'sets', 'follows',
        'notifications', 'user_activities', 'certifications', 'challenges'
      ];
      
      for (const table of expectedTables) {
        assert.ok(
          tableNames.includes(table),
          `Expected table ${table} to exist`
        );
      }
    });
  });
});
