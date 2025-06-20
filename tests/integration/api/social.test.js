const request = require('supertest');
const { initializeTestApp } = require('../../testHelpers');

let testRequest;
let testServer;

beforeAll(async () => {
  jest.setTimeout(5000);
  const { server, address, db } = await initializeTestApp();
  testServer = server;
  testRequest = request(address);
});

afterAll(async () => {
  if (testServer) {
    testServer.close();
  }
});

describe('Social Features API', () => {
  jest.setTimeout(10000);
  let userA, userB, cookieA, cookieB, userAId, userBId, sessionId;

  beforeEach(async () => {
    userA = { username: `userA_${Date.now()}`, password: 'passA' };
    userB = { username: `userB_${Date.now()}`, password: 'passB' };
    await testRequest.post('/api/register').send(userA);
    await testRequest.post('/api/register').send(userB);
    const loginA = await testRequest.post('/api/login').send(userA);
    const loginB = await testRequest.post('/api/login').send(userB);
    cookieA = loginA.headers['set-cookie'][0];
    cookieB = loginB.headers['set-cookie'][0];
    // Get user IDs
    const meA = await testRequest.get('/api/me').set('Cookie', cookieA);
    const meB = await testRequest.get('/api/me').set('Cookie', cookieB);
    userAId = meA.body.id;
    userBId = meB.body.id;
  });

  test('User A can follow and unfollow User B', async () => {
    // Follow
    const followRes = await testRequest.post(`/api/follow/${userBId}`).set('Cookie', cookieA);
    expect(followRes.status).toBe(200);
    expect(followRes.body.success).toBe(true);
    // Unfollow
    const unfollowRes = await testRequest.delete(`/api/follow/${userBId}`).set('Cookie', cookieA);
    expect(unfollowRes.status).toBe(200);
    expect(unfollowRes.body.success).toBe(true);
  });

  test('User A receives notification when User B logs a set', async () => {
    // User A follows User B
    await testRequest.post(`/api/follow/${userBId}`).set('Cookie', cookieA);
    // Verify follow relationship
    const followingRes = await testRequest.get('/api/following').set('Cookie', cookieA);
    console.log('User A following:', JSON.stringify(followingRes.body, null, 2));
    expect(followingRes.body.some(u => u.id === userBId)).toBe(true);
    // User B creates a session and exercise
    const sessionRes = await testRequest
        .post(`/api/sessions`)
        .set(`Cookie`, cookieB)
        .send({ date: '2025-06-19' });
    sessionId = sessionRes.body.id;
    const exerciseRes = await testRequest
        .post(`/api/sessions/${sessionId}/exercises`)
        .set(`Cookie`, cookieB)
        .send({ sessionId, name: 'Push Ups' });
    const exerciseId = exerciseRes.body.id;
    // User B logs a set
    await testRequest
        .post(`/api/exercises/${exerciseId}/sets`)
        .set('Cookie', cookieB)
        .send({ reps: 10, weight: 50 });
    // User A checks notifications
    const notifResA = await testRequest.get('/api/notifications').set('Cookie', cookieA);
    console.log('User A notifications:', JSON.stringify(notifResA.body, null, 2));
    // User B checks notifications
    const notifResB = await testRequest.get('/api/notifications').set('Cookie', cookieB);
    console.log('User B notifications:', JSON.stringify(notifResB.body, null, 2));
    expect(notifResA.status).toBe(200);
    expect(Array.isArray(notifResA.body)).toBe(true);
    expect(notifResA.body.some(n => n.type === 'set_logged')).toBe(true);
  });

  test('User deletion is possible even when followed', async () => {
    // User A follows User B
    await testRequest.post(`/api/follow/${userBId}`).set('Cookie', cookieA);
    // Delete User B
    const deleteRes = await testRequest.delete('/api/user').set('Cookie', cookieB);
    expect(deleteRes.status).toBe(200);
    // User A should not see User B in following list
    const followingRes = await testRequest.get('/api/following').set('Cookie', cookieA);
    expect(followingRes.status).toBe(200);
    expect(followingRes.body.some(u => u.id === userBId)).toBe(false);
  });

  // Additional tests for extensibility and error cases can be added here
});
