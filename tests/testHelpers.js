const { Client } = require('pg');
const DatabaseService = require('../db/dbService');

const TEST_DB_URL = process.env.DATABASE_URL || 'postgres://postgres@localhost:5432/testdb';
const ADMIN_DB_URL = 'postgres://postgres@localhost:5432/postgres';

async function setupTestDatabase() {
  const adminClient = new Client({ connectionString: ADMIN_DB_URL });
  await adminClient.connect();
  
  try {
    await adminClient.query(`DROP DATABASE IF EXISTS testdb`);
    await adminClient.query(`CREATE DATABASE testdb`);
  } catch (err) {
    console.error('Error setting up test database:', err);
    throw err;
  } finally {
    await adminClient.end();
  }

  // Initialize schema
  process.env.DATABASE_URL = TEST_DB_URL;
  const db = new DatabaseService();
  await db.getConnection();
  await db.close();
}

async function resetTestDatabase() {
  const db = new DatabaseService();
  
  try {
    const { rows: tables } = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND table_name NOT IN ('migrations')
    `);

    if (tables.length > 0) {
      await db.query(`
        TRUNCATE ${tables.map(t => t.table_name).join(', ')} 
        RESTART IDENTITY CASCADE
      `);
    }
  } finally {
    await db.close();
  }
}

async function seedTestData() {
  const db = new DatabaseService();
  
  try {
    // Seed base users
    await db.run(`
      INSERT INTO users (username, password) 
      VALUES ($1, $2)
      RETURNING id
    `, ['testuser', 'hashed_password']);

    // Seed sessions
    await db.run(`
      INSERT INTO sessions (user_id, start_time)
      VALUES ($1, NOW())
      RETURNING id
    `, [1]);

    // Add more seed data as needed per test suite
  } finally {
    await db.close();
  }
}

module.exports = {
  setupTestDatabase,
  resetTestDatabase,
  seedTestData,
  TEST_DB_URL
};
