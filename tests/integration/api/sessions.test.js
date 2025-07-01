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
});
