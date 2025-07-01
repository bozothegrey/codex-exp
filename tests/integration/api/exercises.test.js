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

  describe('Exercise Management API', () => {  
  let testUser;
  let sessionCookie;
  let testSessionId;
  

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
    
    // Create a session for the user
    const sessionResponse = await testRequest
      .post('/api/sessions')
      .set('Cookie', sessionCookie)
      .send({ date: '2025-06-08' });
    testSessionId = sessionResponse.body.id;
  });

  afterEach(async () => {
    // Delete user via API
    await testRequest
      .delete('/api/user')
      .set('Cookie', sessionCookie);
  });

  describe('POST /api/sessions/:id/exercises', () => {

    it('should create a new exercise', async () => {
      const response = await testRequest
        .post(`/api/sessions/${testSessionId}/exercises`)
        .set('Cookie', sessionCookie)
        .send({ name: 'Bench Press' });
      
      expect(response.statusCode).toBe(200);
      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe('Bench Press');
    });

    it('should require name field', async () => {
      const response = await testRequest
        .post(`/api/sessions/${testSessionId}/exercises`)
        .set('Cookie', sessionCookie)
        .send({});
      
      expect(response.statusCode).toBe(405);
    });

    it('should reject invalid session ID', async () => {
      const response = await testRequest
        .post('/api/sessions/999/exercises')
        .set('Cookie', sessionCookie)
        .send({ name: 'Bench Press' });
      
      expect(response.statusCode).toBe(404);
    }); 

    it('should delete an exercise', async () => {
      // First create a test exercise via API
      const createResponse = await testRequest
        .post(`/api/sessions/${testSessionId}/exercises`)
        .set('Cookie', sessionCookie)
        .send({ name: 'Squat' });

      const exerciseId = createResponse.body.id;

      const response = await testRequest
        .delete(`/api/exercises/${exerciseId}`)
        .set('Cookie', sessionCookie);
      
      expect(response.statusCode).toBe(200);
      expect(response.body.id).toBe(exerciseId);
    });
  });
});
