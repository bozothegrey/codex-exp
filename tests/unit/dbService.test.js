const { describe, it, beforeAll, afterAll, beforeEach } = require('@jest/globals');
const assert = require('assert').strict;
const sinon = require('sinon');
const DatabaseService = require('../../db/dbService');

describe('DatabaseService', () => {
  let dbService;
  let errorSpy;

  beforeAll(() => {
    // Use environment-based constructor
    dbService = new DatabaseService('test');
    errorSpy = sinon.spy();
    dbService.on('error', errorSpy);
  });

  afterAll(async () => {
    await dbService.close();
  });

  beforeEach(async () => {  
    await dbService.run('BEGIN TRANSACTION');  
    errorSpy.resetHistory();
  });

  afterEach(async () => {
    await dbService.run('ROLLBACK');    
  });

  describe('Error Handling', () => {
    it('should emit error on invalid SQL', async () => {
      await assert.rejects(
        () => dbService.run('INVALID SQL'),
        { name: 'Error' }
      );
      assert.strictEqual(errorSpy.callCount, 1);
    });

    it('should handle connection errors', async () => {
      // Simulate connection failure
      const originalGetConnection = dbService.getConnection;
      dbService.getConnection = () => Promise.reject(new Error('Connection failed'));
      
      await assert.rejects(
        () => dbService.run('SELECT 1'),
        { message: 'Connection failed' }
      );
      
      // Restore original method
      dbService.getConnection = originalGetConnection;
    });
  });

  describe('Security', () => {
    beforeEach(async () => {
      // Create test table within transaction
      await dbService.run('CREATE TEMPORARY TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
    });

    it('should prevent SQL injection', async () => {
      const maliciousInput = "'; DROP TABLE test;--";
      await dbService.run('INSERT INTO test (value) VALUES (?)', [maliciousInput]);
      
      const result = await dbService.query('SELECT value FROM test');
      assert.strictEqual(result[0].value, maliciousInput);
      
      // Verify table still exists
      const tables = await dbService.query(
        "SELECT name FROM sqlite_temp_master WHERE type='table' AND name='test'"
      );
      assert.strictEqual(tables.length, 1);
    });
  });

  describe('Input Validation', () => {
    it('should reject non-string SQL', async () => {
      await assert.rejects(
        () => dbService.run(123),
        { name: 'TypeError' }
      );
    });

    it('should accept non-array parameters', async () => {
      await dbService.run('CREATE TEMPORARY TABLE test (id INT)');
      await assert.doesNotReject(
        () => dbService.run('INSERT INTO test VALUES (?)', 42)
      );
      const result = await dbService.query('SELECT id FROM test');
      assert.strictEqual(result[0].id, 42);
    });
  });
  
  describe('Database Initialization', () => {
    it('should initialize all required tables', async () => {
      // Trigger initialization via service
      await dbService.getConnection();
      
      const tables = await dbService.query(
        "SELECT name FROM sqlite_master WHERE type='table'"
      );
      const tableNames = tables.map(t => t.name);
      
      const expectedTables = [
        'users', 'sessions', 'exercises', 'sets', 'follows',
        'notifications', 'user_activities', 'certifications', 'challenges'
      ];
      
      for (const table of expectedTables) {
        assert.ok(
          tableNames.includes(table),
          `Missing table: ${table}`
        );
      }
    });
  });
});
