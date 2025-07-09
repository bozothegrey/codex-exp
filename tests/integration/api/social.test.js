const request = require('supertest');
const { createTestApp, loginTestUser, testDb } = require('../../testHelpers');
const { v4: uuidv4 } = require('uuid');

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
  await testDb.run('DELETE FROM exercises');
  await testDb.close();
});

describe('Social Features API', () => {  
  let userA, userB, cookieA, cookieB, userAId, userBId, sessionId;

  beforeEach(async () => {
    // Create unique test user via API
    userA = { username: `userA_${uuidv4()}`, password: 'passA' };    
    userB = { username: `userB_${uuidv4()}`, password: 'passB' };
    
    // Register users
    await testRequest.post('/api/register').send(userA);
    await testRequest.post('/api/register').send(userB);
    
    // Login using helper function that properly handles cookies
    cookieA = await loginTestUser(userA.username, userA.password);
    cookieB = await loginTestUser(userB.username, userB.password);
    
    // Get user IDs
    const meA = await testRequest.get('/api/me').set('Cookie', cookieA[0]);
    const meB = await testRequest.get('/api/me').set('Cookie', cookieB[0]);
    userAId = meA.body.id;
    userBId = meB.body.id;
  });

  test('User A can follow and unfollow User B', async () => {
    // Follow
    const followRes = await testRequest.post(`/api/follow/${userBId}`).set('Cookie', cookieA[0]);
    expect(followRes.status).toBe(200);
    expect(followRes.body.success).toBe(true);
    // Unfollow
    const unfollowRes = await testRequest.delete(`/api/follow/${userBId}`).set('Cookie', cookieA[0]);
    expect(unfollowRes.status).toBe(200);
    expect(unfollowRes.body.success).toBe(true);
  });

  test('User A receives notification when User B logs a set', async () => {
    // User A follows User B
    await testRequest.post(`/api/follow/${userBId}`).set('Cookie', cookieA[0]);    
    // Verify follow relationship
    const followingRes = await testRequest.get('/api/following').set('Cookie', cookieA[0]);
    expect(followingRes.body.some(u => u.id === userBId)).toBe(true);
    // User B creates a session and exercise
    const sessionRes = await testRequest
        .post(`/api/sessions`)
        .set(`Cookie`, cookieB[0])
        .send({ date: '2025-06-19' });
    sessionId = sessionRes.body.id;
    const uniqueExerciseName = 'Push Ups ' + uuidv4();
    const exerciseRes = await testRequest
        .post(`/api/exercises`)
        .set(`Cookie`, cookieB[0])
        .send({ name: uniqueExerciseName });
    const exerciseId = exerciseRes.body.id;
    // User B logs a set using correct endpoint
    await testRequest
        .post(`/api/sessions/${sessionId}/sets`)
        .set('Cookie', cookieB[0])
        .send({ exercise_name: uniqueExerciseName, reps: 10, weight: 50 });
    // User A checks notifications
    const notifResA = await testRequest.get('/api/notifications').set('Cookie', cookieA[0]);
    expect(notifResA.status).toBe(200);
    expect(Array.isArray(notifResA.body)).toBe(true);
    expect(notifResA.body.some(n => n.type === 'set_logged')).toBe(true);
  });

  test('User deletion is possible even when followed', async () => {
    // User A follows User B
    await testRequest.post(`/api/follow/${userBId}`).set('Cookie', cookieA[0]);
    // Delete User B
    const deleteRes = await testRequest.delete('/api/user').set('Cookie', cookieB[0]);
    expect(deleteRes.status).toBe(200);
    // User A should not see User B in following list
    const followingRes = await testRequest.get('/api/following').set('Cookie', cookieA[0]);
    expect(followingRes.status).toBe(200);
    expect(followingRes.body.some(u => u.id === userBId)).toBe(false);
  });

  test('User A can certify User B\'s set (activity)', async () => {
    // User B creates a session and exercise
    const sessionRes = await testRequest
      .post(`/api/sessions`)
      .set('Cookie', cookieB[0])
      .send({ date: '2025-06-20' });
    const sessionIdB = sessionRes.body.id;
    const uniqueExerciseName = 'Squats ' + uuidv4();
    const exerciseRes = await testRequest
      .post(`/api/exercises`)
      .set('Cookie', cookieB[0])
      .send({ name: uniqueExerciseName });
    const exerciseIdB = exerciseRes.body.id;
    // User B logs a set using correct endpoint
    const setRes = await testRequest
      .post(`/api/sessions/${sessionIdB}/sets`)
      .set('Cookie', cookieB[0])
      .send({ exercise_name: uniqueExerciseName, reps: 8, weight: 100 });
    const setId = setRes.body.id;
    // User A certifies User B's set
    const certRes = await testRequest
      .post('/api/certifications')
      .set('Cookie', cookieA[0])
      .send({ activity_id: setId });
    expect(certRes.status).toBe(200);
    expect(certRes.body.success).toBe(true);
    // User A cannot certify the same set twice
    const certRes2 = await testRequest
      .post('/api/certifications')
      .set('Cookie', cookieA[0])
      .send({ activity_id: setId });
    expect(certRes2.status).toBe(400);
    expect(certRes2.body.error).toMatch(/already certified/i);
  });

  // Additional tests for extensibility and error cases can be added here

  describe('Challenge Features', () => {
    let sessionIdB, exerciseIdB, setId;

    beforeEach(async () => {
      // User B creates a session and exercise
      const sessionRes = await testRequest
        .post(`/api/sessions`)
        .set('Cookie', cookieB[0])
        .send({ date: '2025-06-20' });
      sessionIdB = sessionRes.body.id;
      const uniqueExerciseName = 'Deadlifts ' + uuidv4();
      const exerciseRes = await testRequest
        .post(`/api/exercises`)
        .set('Cookie', cookieB[0])
        .send({ name: uniqueExerciseName });
      exerciseIdB = exerciseRes.body.id;
      // User B logs a set
      const setRes = await testRequest
        .post(`/api/sessions/${sessionIdB}/sets`)
        .set('Cookie', cookieB[0])
        .send({ exercise_name: uniqueExerciseName, reps: 5, weight: 150 });
      setId = setRes.body.id;
    });

    test('User A can challenge User B\'s activity', async () => {
      const challengeRes = await testRequest
        .post('/api/challenges')
        .set('Cookie', cookieA[0])
        .send({ challenged_activity_id: setId });
      expect(challengeRes.status).toBe(200);
      expect(challengeRes.body.success).toBe(true);
    });

    test('Cannot challenge own activity', async () => {
      const challengeRes = await testRequest
        .post('/api/challenges')
        .set('Cookie', cookieB[0])
        .send({ challenged_activity_id: setId });
      expect(challengeRes.status).toBe(400);
      expect(challengeRes.body.error).toMatch(/cannot challenge your own activity/i);
    });

    test('Cannot challenge without activity_id', async () => {
      const challengeRes = await testRequest
        .post('/api/challenges')
        .set('Cookie', cookieA[0])
        .send({});
      expect(challengeRes.status).toBe(400);
      expect(challengeRes.body.error).toMatch(/missing activity_id/i);
    });

    test('Cannot challenge already certified activity', async () => {
      // First certify the activity
      await testRequest
        .post('/api/certifications')
        .set('Cookie', cookieA[0])
        .send({ activity_id: setId });

      // Then try to challenge it
      const challengeRes = await testRequest
        .post('/api/challenges')
        .set('Cookie', cookieA[0])
        .send({ challenged_activity_id: setId });
      expect(challengeRes.status).toBe(400);
      expect(challengeRes.body.error).toMatch(/already certified/i);
    });

    test('Cannot challenge already challenged activity', async () => {
      // First challenge the activity
      await testRequest
        .post('/api/challenges')
        .set('Cookie', cookieA[0])
        .send({ challenged_activity_id: setId });

      // Try to challenge again
      const challengeRes = await testRequest
        .post('/api/challenges')
        .set('Cookie', cookieA[0])
        .send({ challenged_activity_id: setId });
      expect(challengeRes.status).toBe(400);
      expect(challengeRes.body.error).toMatch(/already challenged/i);
    });
  });
});
