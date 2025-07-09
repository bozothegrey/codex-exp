const request = require('supertest');
const createApp = require('../server');
const DatabaseService = require('../db/dbService');
const { initializeDatabase } = require('../db/init');

// Shared persistent in-memory database instance for all tests
const testDb = new DatabaseService('test');

let app;
let server;

async function createTestApp() {
  // Initialize the database for tests (no default users/exercises)
  await initializeDatabase(testDb, false, false);

  // Create test app instance, passing the shared database service
  app = createApp({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  }, testDb);

  // Start the server on a random port
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      resolve({
        app,
        server,
        address: `http://localhost:${server.address().port}`,
        db: testDb
      });
    });
  });
}

async function createTestSession(userId, date = '2025-06-08') {
  const response = await request(app)
    .post('/api/sessions')
    .send({ user_id: userId, date });
  return response.body.id;
}

async function createTestExercise(sessionId, name = 'Bench Press') {
  const response = await request(app)
    .post(`/api/sessions/${sessionId}/exercises`)
    .send({ name });
  return response.body.id;
}

async function createTestUser(username, password) {
  try {
    const response = await request(app)
      .post('/api/register')
      .send({ 
        username, 
        password
      });
    
    if (!response.headers['set-cookie']) {
      console.error('User Creation failed - response:', response.status, response.body);
      throw new Error('User creation failed - no cookies received');
    }
    
    return response.headers['set-cookie'];
  } catch (err) {
    console.error('User creation error:', err);
    throw err;
  }
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
    
    return response.headers['set-cookie'];
  } catch (err) {
    console.error('Login error:', err);
    throw err;
  }
}

// Export all test helpers
module.exports = {
  createTestApp,  
  createTestSession,
  createTestExercise,
  createTestUser,
  loginTestUser,  
  app,
  testDb
};