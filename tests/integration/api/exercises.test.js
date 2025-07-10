const request = require('supertest');
const { setupTestDatabase, resetTestDatabase, seedTestData } = require('../../testHelpers');

let app;
let testRequest;

beforeAll(async () => {  
  await setupTestDatabase();
  const server = require('../../../server');
  app = server.createApp();
  testRequest = request(app);
});

afterAll(async () => {
  await resetTestDatabase();
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

  it('should create a new exercise', async () => {
    const { v4: uuidv4 } = require('uuid');
    const uniqueName = 'Bench Press ' + uuidv4();
    const response = await testRequest
      .post(`/api/exercises`)
      .set('Cookie', sessionCookie)
      .send({ name: uniqueName });
    expect(response.statusCode).toBe(201);
    expect(response.body.id).toBeDefined();
    expect(response.body.name).toBe(uniqueName);
  });

  it('should require name field', async () => {
    const response = await testRequest
      .post(`/api/exercises`)
      .set('Cookie', sessionCookie)
      .send({});
    expect(response.statusCode).toBe(400);
  });

  it('should delete an exercise', async () => {
    const { v4: uuidv4 } = require('uuid');
    const uniqueName = 'Squat ' + uuidv4();
    const createResponse = await testRequest
      .post(`/api/exercises`)
      .set('Cookie', sessionCookie)
      .send({ name: uniqueName });
    const exerciseId = createResponse.body.id;
    const response = await testRequest
      .delete(`/api/exercises/${exerciseId}`)
      .set('Cookie', sessionCookie);
    expect(response.statusCode).toBe(200);
    expect(response.body.id).toBe(exerciseId);
  });

  it('should not delete exercise in use', async () => {
    const { v4: uuidv4 } = require('uuid');
    const uniqueName = 'Deadlift ' + uuidv4();
    // Create exercise and set
    const exRes = await testRequest
      .post(`/api/exercises`)
      .set('Cookie', sessionCookie)
      .send({ name: uniqueName });
    const exerciseId = exRes.body.id;
    await testRequest
      .post(`/api/sessions/${testSessionId}/sets`)
      .set('Cookie', sessionCookie)
      .send({ exercise_id: exerciseId, reps: 5, weight: 100 });
    const delRes = await testRequest
      .delete(`/api/exercises/${exerciseId}`)
      .set('Cookie', sessionCookie);
    expect(delRes.statusCode).toBe(400);
  });

  it('should add a set only for existing exercise and session', async () => {
    const { v4: uuidv4 } = require('uuid');
    const uniqueName = 'Pull Up ' + uuidv4();
    const exRes = await testRequest
      .post(`/api/exercises`)
      .set('Cookie', sessionCookie)
      .send({ name: uniqueName });
    const exerciseId = exRes.body.id;
    const setRes = await testRequest
      .post(`/api/sessions/${testSessionId}/sets`)
      .set('Cookie', sessionCookie)
      .send({ exercise_id: exerciseId, reps: 10, weight: null });
    expect(setRes.statusCode).toBe(201);    
    expect(Number(setRes.body.exercise_id)).toBe(exerciseId);
    expect(Number(setRes.body.session_id)).toBe(testSessionId);
  });
});
