const { test, before, after } = require('node:test');
const assert = require('assert');
const http = require('http');

let app;
let server;
let baseURL;
let cookie;

before(async () => {
  process.env.DB_FILE = ':memory:';
  app = require('../server');
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  baseURL = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
});

test('redirects to login when not logged in', async () => {
  const res = await fetch(`${baseURL}/`, { redirect: 'manual' });
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.get('location'), '/login.html');
});

test('session CRUD', async () => {
  // login
  let res = await fetch(`${baseURL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'emanuele', password: 'ghisa' })
  });
  assert.strictEqual(res.status, 200);
  cookie = res.headers.get('set-cookie');

  // add session
  res = await fetch(`${baseURL}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ date: '2024-01-01' })
  });
  assert.strictEqual(res.status, 200);
  const session = await res.json();

  // list sessions
  res = await fetch(`${baseURL}/api/sessions`, { headers: { Cookie: cookie } });
  const list = await res.json();
  assert.ok(list.some(s => s.id === session.id));

  // add exercise
  res = await fetch(`${baseURL}/api/sessions/${session.id}/exercises`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'bench' })
  });
  const exercise = await res.json();
  assert.strictEqual(res.status, 200);

  // add set
  res = await fetch(`${baseURL}/api/exercises/${exercise.id}/sets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ reps: 10, weight: 100 })
  });
  const set = await res.json();
  assert.strictEqual(res.status, 200);

  // verify nested data
  res = await fetch(`${baseURL}/api/sessions/${session.id}`, { headers: { Cookie: cookie } });
  let detail = await res.json();
  assert.strictEqual(detail.exercises.length, 1);
  assert.strictEqual(detail.exercises[0].sets.length, 1);

  // remove set
  res = await fetch(`${baseURL}/api/sets/${set.id}`, {
    method: 'DELETE',
    headers: { Cookie: cookie }
  });
  assert.strictEqual(res.status, 200);

  res = await fetch(`${baseURL}/api/sessions/${session.id}`, { headers: { Cookie: cookie } });
  detail = await res.json();
  assert.strictEqual(detail.exercises[0].sets.length, 0);

  // remove exercise
  res = await fetch(`${baseURL}/api/exercises/${exercise.id}`, {
    method: 'DELETE',
    headers: { Cookie: cookie }
  });
  assert.strictEqual(res.status, 200);

  res = await fetch(`${baseURL}/api/sessions/${session.id}`, { headers: { Cookie: cookie } });
  detail = await res.json();
  assert.strictEqual(detail.exercises.length, 0);

  // remove session
  res = await fetch(`${baseURL}/api/sessions/${session.id}`, {
    method: 'DELETE',
    headers: { Cookie: cookie }
  });
  assert.strictEqual(res.status, 200);

  res = await fetch(`${baseURL}/api/sessions`, { headers: { Cookie: cookie } });
  const listAfter = await res.json();
  assert.ok(!listAfter.some(s => s.id === session.id));
});
