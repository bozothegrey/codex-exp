const express = require('express');
const request = require('supertest');
const session = require('express-session');
const createApp = require('../server');
const DatabaseService = require('../db/dbService');

let testDb;
let app;
let server;

async function initializeTestApp() {
  console.log('Starting database setup...');
  testDb = await setupTestDatabase();
  console.log('Database setup complete');
  
  // Create test app instance using the actual server implementation
  app = createApp({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  });
  
  // Override default database with test database
  app.locals.dbService = testDb;
  app.locals.dbReady = true;
  
  // Start the server on a random port
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      console.log(`Test server listening on port ${server.address().port}`);
      resolve({
        app,
        server,
        address: `http://localhost:${server.address().port}`,
        db: testDb
      });
    });
  });
}

// Initialize the test app
beforeAll(async () => {
  await initializeTestApp();
});

// Export all test helpers
module.exports = {
  setupTestDatabase,
  createTestSession,
  createTestExercise,
  loginTestUser,
  initializeTestApp,
  app,
  testDb
};

afterAll(async () => {
  try {
    if (testDb) {
      await testDb.close();
      console.log('Database connection closed');
    }
    if (server) {
      await new Promise(resolve => server.close(resolve));
      console.log('Test server closed');
    }
  } catch (err) {
    console.error('Cleanup error:', err);
  }
});

async function setupTestDatabase() {
  const dbService = new DatabaseService(':memory:');
  
  // Create tables
  await dbService.run(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )`);
  
  await dbService.run(`CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    closed INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
  
  await dbService.run(`CREATE TABLE exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
  )`);

  return dbService;
}

async function createTestSession(dbService, userId, date = '2025-06-08') {
  const result = await dbService.run(
    'INSERT INTO sessions (user_id, date) VALUES (?, ?)',
    [userId, date]
  );
  return result.lastID;
}

async function createTestExercise(dbService, sessionId, name = 'Bench Press') {
  const result = await dbService.run(
    'INSERT INTO exercises (session_id, name) VALUES (?, ?)',
    [sessionId, name]
  );
  return result.lastID;
}

async function loginTestUser(username, password) {
  try {
    const response = await request(app)
      .post('/api/login')
      .send({ 
        username, 
        password
      });
    
    if (!response.headers['set-cookie']) {
      console.error('Login failed - response:', response.status, response.body);
      throw new Error('Login failed - no cookies received');
    }
    
    return response.headers['set-cookie']
      .map(cookie => cookie.split(';')[0])
      .join('; ');
  } catch (err) {
    console.error('Login error:', err);
    throw err;
  }
}

// Remove duplicate exports
