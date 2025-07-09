const request = require('supertest');
const { createTestApp, loginTestUser, createTestUser, testDb } = require('../../testHelpers');

let app, server, address;
let testRequest;

beforeAll(async () => {  
  const result = await createTestApp();
  app = result.app;
  server = result.server;
  address = result.address;
  testRequest = request(address);
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await testDb.close();
});

describe('Session Management API', () => {  
  let testUser;
  let sessionCookie;

  beforeEach(async () => {
    // Create unique test user via API
    const { v4: uuidv4 } = require('uuid');
    testUser = {      
      username: `user_${uuidv4()}`,      
      password: 'testpass'
    };
    
   // Register user
    await testRequest.post('/api/register').send(testUser);
    
    // Login to get session cookie
    const loginResponse = await testRequest
      .post('/api/login')
      .send({ username: testUser.username, password: testUser.password });
    sessionCookie = loginResponse.headers['set-cookie'][0];
  });

  afterEach(async () => {
    // Delete user via API
    await testRequest
      .delete('/api/user')
      .set('Cookie', sessionCookie);
  });

  describe('POST /api/sessions', () => {
    it('should create a new session', async () => {
      const response = await testRequest
        .post('/api/sessions')
        .set('Cookie', sessionCookie)
        .send({ date: '2025-06-08' });
      
      expect(response.statusCode).toBe(200);
      expect(response.body.id).toBeDefined();
      expect(response.body.date).toBe('2025-06-08');
    });

    it('should require date field', async () => {
      const response = await testRequest
        .post('/api/sessions')
        .set('Cookie', sessionCookie)
        .send({});
      
      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/sessions', () => {
    it('should retrieve user sessions', async () => {
      // Create session via API
      await testRequest
        .post('/api/sessions')
        .set('Cookie', sessionCookie)
        .send({ date: '2025-06-08' });

      const response = await testRequest
        .get('/api/sessions')
        .set('Cookie', sessionCookie);
      
      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });
  });

  describe('DELETE /api/sessions/:id', () => {
    it('should delete a session', async () => {
      // Create session via API
      const createResponse = await testRequest
        .post('/api/sessions')
        .set('Cookie', sessionCookie)
        .send({ date: '2025-06-08' });

      const sessionId = createResponse.body.id;

      const response = await testRequest
        .delete(`/api/sessions/${sessionId}`)
        .set('Cookie', sessionCookie);
      
      expect(response.statusCode).toBe(200);
      expect(response.body.id).toBe(sessionId);
    });
  });

  describe('Full session lifecycle', () => {
    it('should create session, add exercise, log set via new endpoint, retrieve sets, and close session', async () => {
      // 1. Create session
      const sessionRes = await testRequest
        .post('/api/sessions')
        .set('Cookie', sessionCookie)
        .send({ date: '2025-06-08' });
      const sessionId = sessionRes.body.id;
      expect(sessionRes.statusCode).toBe(200);

      // 2. Create exercise
      const { v4: uuidv4 } = require('uuid');
      const uniqueName = 'Bench Press ' + uuidv4();
      const exerciseRes = await testRequest
        .post('/api/exercises')
        .set('Cookie', sessionCookie)
        .send({ name: uniqueName });
      const exerciseId = exerciseRes.body.id;
      expect(exerciseRes.statusCode).toBe(201);

      // 3. Log set using new endpoint
      const setRes = await testRequest
        .post(`/api/sessions/${sessionId}/sets`)
        .set('Cookie', sessionCookie)
        .send({
          exercise_name: uniqueName,
          reps: 10,
          weight: 135
        });
      expect(setRes.statusCode).toBe(201);

      // 4. Retrieve sets
      const getSessionRes = await testRequest
        .get(`/api/sessions/${sessionId}`)
        .set('Cookie', sessionCookie);
      expect(getSessionRes.statusCode).toBe(200);
      expect(getSessionRes.body.sets).toHaveLength(1);
      expect(getSessionRes.body.sets[0].reps).toBe(10);
      expect(getSessionRes.body.sets[0].weight).toBe(135);

      // 5. Close session
      const closeRes = await testRequest
        .post(`/api/sessions/${sessionId}/close`)
        .set('Cookie', sessionCookie);
      expect(closeRes.statusCode).toBe(200);

      // Verify session is closed
      const verifyRes = await testRequest
        .get(`/api/sessions/${sessionId}`)
        .set('Cookie', sessionCookie);
      expect(verifyRes.body.closed).toBe(1);
    });
  });
});
