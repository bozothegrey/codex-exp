const supertest = require('supertest');
const bcrypt = require('bcrypt');
const createApp = require('../../../server');
const { initializeDatabase, clearDatabase } = require('../../../db/init');
const DatabaseService = require('../../../db/dbService');

describe('Personal Record Features', () => {
  let app;
  let dbService;
  let userA;
  let userB;

  beforeAll(async () => {
    dbService = new DatabaseService(':memory:');
    await initializeDatabase(dbService, true, true);
    app = createApp({}, dbService);
  });

  beforeEach(async () => {
    await clearDatabase(dbService);
    await initializeDatabase(dbService, true, true);
    
    // Create users directly in the database for tests
    const hashA = await bcrypt.hash('passwordA', 10);
    const userAResult = await dbService.run('INSERT INTO users (username, password) VALUES (?, ?)', ['userA', hashA]);
    userA = { id: userAResult.lastID, agent: supertest.agent(app) };
    await userA.agent.post('/api/login').send({ username: 'userA', password: 'passwordA' });

    const hashB = await bcrypt.hash('passwordB', 10);
    const userBResult = await dbService.run('INSERT INTO users (username, password) VALUES (?, ?)', ['userB', hashB]);
    userB = { id: userBResult.lastID, agent: supertest.agent(app) };
    await userB.agent.post('/api/login').send({ username: 'userB', password: 'passwordB' });

    // User A follows User B
    await userA.agent.post(`/api/follow/${userB.id}`);
  });

  afterEach(async () => {
    await clearDatabase(dbService);
  });

  afterAll(async () => {
    await dbService.close();
  });

  test('Should generate a personal_record notification for followers', async () => {
    // User B logs a session and a set
    const sessionRes = await userB.agent.post('/api/sessions').send({ location_id: 0 });
    const sessionId = sessionRes.body.id;

    const exercisesRes = await userA.agent.get('/api/exercises');
    const exercises = exercisesRes.body;
    const benchPress = exercises.find(e => e.name === 'Bench Press');

    // First set
    await userB.agent.post(`/api/sessions/${sessionId}/sets`).send({
      exercise_id: benchPress.id,
      reps: 5,
      weight: 100,
    });  

    // Check notifications for User A
    const notificationsRes = await userA.agent.get('/api/notifications');
    const notifications = notificationsRes.body;
    const prNotification = notifications.find(n => n.type === 'personal_record');
    
    expect(prNotification).toBeDefined();
    expect(prNotification.type).toBe('personal_record');
    const data = JSON.parse(prNotification.data);
    expect(data.exercise_name).toBe('Bench Press');
    expect(data.oneRM).toBeCloseTo(100 * (1 + 5.0 / 30.0));

    // Second set - a new PR
    await userB.agent.post(`/api/sessions/${sessionId}/sets`).send({
      exercise_id: benchPress.id,
      reps: 5,
      weight: 110,
    });

    // Add small delay to ensure proper ordering
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check notifications for User A after second set
    console.log('Checking notifications after second set');
    const notificationsRes2 = await userA.agent.get('/api/notifications');
    const allNotifications = notificationsRes2.body;
    
    // Get all PR notifications (should be 2 - one for each set)
    const prNotifications = allNotifications.filter(n => n.type === 'personal_record');
    console.log('PR notifications:', prNotifications.map(n => ({
      id: n.id,
      created_at: n.created_at,
      weight: JSON.parse(n.data).weight
    })));
    expect(prNotifications.length).toBe(2);
    
    // Verify first PR is the 100kg set
    const firstPR = prNotifications[0];
    const firstData = JSON.parse(firstPR.data);
    expect(firstData.weight).toBe(100);

    // Verify latest PR is the 110kg set
    const latestPR = prNotifications[1];
    expect(latestPR.type).toBe('personal_record');
    const latestData = JSON.parse(latestPR.data);
    expect(latestData.exercise_name).toBe('Bench Press');
    expect(latestData.weight).toBe(110);
    expect(latestData.oneRM).toBeCloseTo(110 * (1 + 5.0 / 30.0));
    
    


  });
});
