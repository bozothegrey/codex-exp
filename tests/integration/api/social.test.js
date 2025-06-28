const request = require('supertest');
const { initializeTestApp, loginTestUser } = require('../../testHelpers');

let testRequest;
let testServer;
let testDb;

beforeAll(async () => {
  jest.setTimeout(20000);
  
  try {
    // Properly await database initialization
    const { server, address, db } = await initializeTestApp();
    testServer = server;
    testRequest = request(address);
    testDb = db;
    
    // Verify database is initialized
    const tables = await db.query("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('Initialized tables:', tables.map(t => t.name));
  } catch (err) {
    console.error('Test setup failed:', err);
    throw err; // Fail the test setup
  }
});

afterAll(async () => {
  if (testServer) {
    await new Promise(resolve => testServer.close(resolve));
  }
  if (testDb) {
    await testDb.close();
  }
});

describe('Social Features API', () => {  
  let userA, userB, cookieA, cookieB, userAId, userBId, sessionId;

  beforeEach(async () => {
    userA = { username: `userA_${Date.now()}`, password: 'passA' };
    userB = { username: `userB_${Date.now()}`, password: 'passB' };
    
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
    console.log('User A following:', JSON.stringify(followingRes.body, null, 2));
    expect(followingRes.body.some(u => u.id === userBId)).toBe(true);
    // User B creates a session and exercise
    const sessionRes = await testRequest
        .post(`/api/sessions`)
        .set(`Cookie`, cookieB[0])
        .send({ date: '2025-06-19' });
    sessionId = sessionRes.body.id;
    const exerciseRes = await testRequest
        .post(`/api/sessions/${sessionId}/exercises`)
        .set(`Cookie`, cookieB[0])
        .send({ sessionId, name: 'Push Ups' });
    const exerciseId = exerciseRes.body.id;
    // User B logs a set
    await testRequest
        .post(`/api/exercises/${exerciseId}/sets`)
        .set('Cookie', cookieB[0])
        .send({ reps: 10, weight: 50 });
    // User A checks notifications
    const notifResA = await testRequest.get('/api/notifications').set('Cookie', cookieA[0]);
    console.log('User A notifications:', JSON.stringify(notifResA.body, null, 2));
    // User B checks notifications
    const notifResB = await testRequest.get('/api/notifications').set('Cookie', cookieB[0]);
    console.log('User B notifications:', JSON.stringify(notifResB.body, null, 2));
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
    const exerciseRes = await testRequest
      .post(`/api/sessions/${sessionIdB}/exercises`)
      .set('Cookie', cookieB[0])
      .send({ name: 'Squats' });
    const exerciseIdB = exerciseRes.body.id;
    // User B logs a set
    const setRes = await testRequest
      .post(`/api/exercises/${exerciseIdB}/sets`)
      .set('Cookie', cookieB[0])
      .send({ reps: 8, weight: 100 });
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
});
