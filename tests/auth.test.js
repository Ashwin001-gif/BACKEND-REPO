import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/server.js';
import User from '../src/models/User.js';

describe('Auth Endpoints', () => {
  beforeAll(async () => {
    // Note: We use a test database to avoid dropping real data.
    // db.js handles process.env.NODE_ENV === 'test' by connecting to 'zk-vault-test'
    // Let's ensure the collection is empty before tests
    await User.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  let userToken;
  let adminToken;

  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'testuser',
        email: 'testuser@example.com',
        password: 'password123',
        role: 'user'
      });
    
    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.username).toEqual('testuser');
    expect(res.body.role).toEqual('user');
    userToken = res.body.token;
  });

  it('should register an admin user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'adminuser',
        email: 'admin@example.com',
        password: 'adminpassword',
        role: 'admin'
      });
    
    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.role).toEqual('admin');
    adminToken = res.body.token;
  });

  it('should fail to register with an existing email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'anotheruser',
        email: 'testuser@example.com',
        password: 'password123'
      });
    
    expect(res.statusCode).toEqual(400);
    expect(res.body.message).toEqual('User already exists');
  });

  it('should login an existing user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'testuser@example.com',
        password: 'password123'
      });
    
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('token');
  });

  it('should fail to login with incorrect password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'testuser@example.com',
        password: 'wrongpassword'
      });
    
    expect(res.statusCode).toEqual(401);
    expect(res.body.message).toEqual('Invalid email or password');
  });

  it('should fetch user profile with valid token', async () => {
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${userToken}`);
    
    expect(res.statusCode).toEqual(200);
    expect(res.body.email).toEqual('testuser@example.com');
  });

  it('should block non-admins from accessing users list', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${userToken}`);
    
    expect(res.statusCode).toEqual(403);
    expect(res.body.message).toEqual('Not authorized as an admin');
  });

  it('should allow admins to access users list', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);
    
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBeTruthy();
    expect(res.body.length).toEqual(2); // testuser and adminuser
  });
});
