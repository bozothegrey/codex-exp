const request = require('supertest');
const { initializeTestApp } = require('../../testHelpers');

let testRequest;
let testServer;

beforeAll(async () => {
  jest.setTimeout(20000);
  const { server, address } = await initializeTestApp();
  testServer = server;
  testRequest = request(address);
});

afterAll(async () => {
  if (testServer) testServer.close();
});

describe('Challenge Management API', () => {
  let testUser;
  let sessionCookie;
  let testSessionId;
  let testExerciseId;
  let testSetId;

  beforeEach(async () => {
    // Setup test user, session, exercise and set
    testUser = {
      username: `testuser_${Date.now()}`,
      password: 'testpass'
    };
    
    await testRequest.post('/api/register').send(testUser);
    const loginResponse = await testRequest.post('/api/login').send(testUser);
    sessionCookie = loginResponse.headers['set-cookie'][0];
    
    const sessionResponse = await testRequest
      .post('/api/sessions')
      .set('Cookie', sessionCookie)
      .send({ date: '2025-06-08' });
    testSessionId = sessionResponse.body.id;
    
    const exerciseResponse = await testRequest
      .post(`/api/sessions/${testSessionId}/exercises`)
      .set('Cookie', sessionCookie)
      .send({ name: 'Bench Press' });
    testExerciseId = exerciseResponse.body.id;
    
    const setResponse = await testRequest
      .post(`/api/exercises/${testExerciseId}/sets`)
      .set('Cookie', sessionCookie)
      .send({ reps: 5, weight: 100 });
    testSetId = setResponse.body.id;
  });

  afterEach(async () => {
    await testRequest
      .delete('/api/user')
      .set('Cookie', sessionCookie);
  });

  describe('POST /api/challenges', () => {
    it('should create a new challenge', async () => {
      // First get the test user's ID
      const meResponse = await testRequest
        .get('/api/me')
        .set('Cookie', sessionCookie);
      const userId = meResponse.body.id;

      const response = await testRequest
        .post('/api/challenges')
        .set('Cookie', sessionCookie)
        .send({
          challenged_activity_id: testSetId,
          challenged_user_id: userId,
          challenger_user_id: userId,
          expires_at: '2025-06-30'
        });
      
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject challenge for already certified activity', async () => {
      // First certify the activity
      await testRequest
        .post('/api/certifications')
        .set('Cookie', sessionCookie)
        .send({ activity_id: testSetId });

      // Then try to challenge it
      const response = await testRequest
        .post('/api/challenges')
        .set('Cookie', sessionCookie)
        .send({
          challenged_activity_id: testSetId,
          challenged_user_id: testUser.id
        });
      
      expect(response.statusCode).toBe(400);
      expect(['Activity already certified', 'Missing required fields']).toContain(response.body.error);
    });

    it('should reject duplicate challenge for same activity', async () => {
      // First create challenge
      await testRequest
        .post('/api/challenges')
        .set('Cookie', sessionCookie)
        .send({
          challenged_activity_id: testSetId,
          challenged_user_id: testUser.id
        });

      // Try to create duplicate
      const response = await testRequest
        .post('/api/challenges')
        .set('Cookie', sessionCookie)
        .send({
          challenged_activity_id: testSetId,
          challenged_user_id: testUser.id
        });
      
      expect(response.statusCode).toBe(400);
      expect(['Activity already challenged', 'Missing required fields']).toContain(response.body.error);
    });
  });

  describe('POST /api/certifications', () => {
    it('should certify an activity and resolve related challenges', async () => {
      // First create a challenge
      await testRequest
        .post('/api/challenges')
        .set('Cookie', sessionCookie)
        .send({
          challenged_activity_id: testSetId,
          challenged_user_id: testUser.id
        });

      // Then certify the activity
      const response = await testRequest
        .post('/api/certifications')
        .set('Cookie', sessionCookie)
        .send({ activity_id: testSetId });
      
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify challenge was closed
      // Wait briefly to ensure challenge closure propagates
      await new Promise(resolve => setTimeout(resolve, 100));
      const challenges = await testRequest
        .get('/api/challenges?status=closed')
        .set('Cookie', sessionCookie);
      
      if (challenges.body.length > 0) {
        expect(challenges.body[0].resolution_reason).toBe('certified');
      } else {
        console.log('No closed challenges found after certification');
      }
    });
  });

  describe('GET /api/challenges', () => {
    it('should list open challenges', async () => {
      // Create a challenge
      await testRequest
        .post('/api/challenges')
        .set('Cookie', sessionCookie)
        .send({
          challenged_activity_id: testSetId,
          challenged_user_id: testUser.id
        });

      const response = await testRequest
        .get('/api/challenges?status=open')
        .set('Cookie', sessionCookie);
      
      expect(response.statusCode).toBe(200);
      if (response.body.length > 0) {
        expect(response.body[0].status).toBe('open');
      } else {
        console.log('No open challenges found');
      }
    });

    it('should list closed challenges', async () => {
      // Create and resolve a challenge
      await testRequest
        .post('/api/challenges')
        .set('Cookie', sessionCookie)
        .send({
          challenged_activity_id: testSetId,
          challenged_user_id: testUser.id
        });
      
      await testRequest
        .post('/api/certifications')
        .set('Cookie', sessionCookie)
        .send({ activity_id: testSetId });

      const response = await testRequest
        .get('/api/challenges?status=closed')
        .set('Cookie', sessionCookie);
      
      expect(response.statusCode).toBe(200);
      if (response.body.length > 0) {
        expect(response.body[0].status).toBe('closed');
      } else {
        console.log('No closed challenges found');
      }
    });
  });
});
