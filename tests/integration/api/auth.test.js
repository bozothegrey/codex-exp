const request = require('supertest');
const { initializeTestApp } = require('../../testHelpers');

let testRequest;
let testServer;

beforeAll(async () => {
  jest.setTimeout(5000);
  
  // Initialize test database and app
  const { server, address, db } = await initializeTestApp();
  testServer = server;
  testRequest = request(address);
});

afterAll(async () => {
  if (testServer) {    
    testServer.close();
  }
});

describe('Authentication API', () => {
  jest.setTimeout(10000);
  let testUser;
  let sessionCookie;

  beforeEach(async () => {
    // Create unique test user via API
    testUser = {
      username: `testuser_${Date.now()}`,
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

  describe('POST /api/login', () => {
    it('should authenticate with valid credentials', async () => {
      const response = await testRequest
        .post('/api/login')
        .send({ username: testUser.username, password: testUser.password });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject invalid credentials', async () => {
      const response = await testRequest
        .post('/api/login')
        .send({ username: 'wronguser', password: 'wrongpass' });
      
      expect(response.statusCode).toBe(401);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/logout', () => {
    it('should successfully logout', async () => {
      // First login to get session
      const loginResponse = await testRequest
        .post('/api/login')
        .send({ username: testUser.username, password: testUser.password });

      // Verify login was successful first
      expect(loginResponse.statusCode).toBe(200);
      
      // Get session cookie
      const cookie = loginResponse.headers['set-cookie'][0];
      
      // Make logout request with session cookie
      const logoutResponse = await testRequest
        .post('/api/logout')
        .set('Cookie', cookie);
      
      expect(logoutResponse.statusCode).toBe(200);
      expect(logoutResponse.body.success).toBe(true);
    });
  });

  describe('User Management', () => {
    describe('POST /api/register', () => {
      it('should register a new user', async () => {
        const newUser = {
          username: `newuser_${Date.now()}`,
          password: 'newpassword123'
        };

        const response = await testRequest
          .post('/api/register')
          .send(newUser);

        expect(response.statusCode).toBe(201);
        expect(response.body.success).toBe(true);

        // Clean up via API
        const loginResponse = await testRequest
          .post('/api/login')
          .send({ username: newUser.username, password: newUser.password });
        const newSession = loginResponse.headers['set-cookie'][0];
        await testRequest
          .delete('/api/user')
          .set('Cookie', newSession);
      });

      it('should reject duplicate username', async () => {
        const response = await testRequest
          .post('/api/register')
          .send({ username: testUser.username, password: 'anypassword' });

        expect(response.statusCode).toBe(400);
        expect(response.body.error).toMatch(/already exists/i);
      });

      it('should require both username and password', async () => {
        const response1 = await testRequest
          .post('/api/register')
          .send({ username: 'missingpassword' });
        
        const response2 = await testRequest
          .post('/api/register')
          .send({ password: 'missingusername' });

        expect(response1.statusCode).toBe(400);
        expect(response2.statusCode).toBe(400);
      });
    });

    describe('PUT /api/user/password', () => {
      it('should change password with valid credentials', async () => {
        const response = await testRequest
          .put('/api/user/password')
          .set('Cookie', sessionCookie)
          .send({
            oldPassword: testUser.password,
            newPassword: 'newpassword123',
            confirmNewPassword: 'newpassword123'
          });

        expect(response.statusCode).toBe(200);
        expect(response.body.success).toBe(true);
      });

      it('should reject incorrect old password', async () => {
        const response = await testRequest
          .put('/api/user/password')
          .set('Cookie', sessionCookie)
          .send({
            oldPassword: 'wrongpassword',
            newPassword: 'newpassword123',
            confirmNewPassword: 'newpassword123'
          });

        expect(response.statusCode).toBe(401);
        expect(response.body.error).toMatch(/incorrect/i);
      });

      it('should reject mismatched new passwords', async () => {
        const response = await testRequest
          .put('/api/user/password')
          .set('Cookie', sessionCookie)
          .send({
            oldPassword: testUser.password,
            newPassword: 'newpassword123',
            confirmNewPassword: 'differentpassword'
          });

        expect(response.statusCode).toBe(400);
        expect(response.body.error).toMatch(/match/i);
      });

      it('should require all fields', async () => {
        const response = await testRequest
          .put('/api/user/password')
          .set('Cookie', sessionCookie)
          .send({
            oldPassword: testUser.password,
            newPassword: 'newpassword123'
            // Missing confirmNewPassword
          });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('DELETE /api/user', () => {
      it('should delete the user and associated data', async () => {
        const response = await testRequest
          .delete('/api/user')
          .set('Cookie', sessionCookie);

        expect(response.statusCode).toBe(200);
        expect(response.body.success).toBe(true);

        // Verify user is deleted by attempting login
        const loginResponse = await testRequest
          .post('/api/login')
          .send({ username: testUser.username, password: testUser.password });
        expect(loginResponse.statusCode).toBe(401);
      });

      it('should require authentication', async () => {
        const response = await testRequest
          .delete('/api/user');
          // No session cookie

        expect(response.statusCode).toBe(401);
      });
    });
  });
});
