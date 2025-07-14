const loginForm = document.getElementById('loginForm');
const loginMessageEl = document.getElementById('loginMessage');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    credentials: 'include' // Ensure cookies are sent/received
  });
  if (res.ok) {
    window.location.href = '/';
  } else {
    let data;
    try {
      data = await res.json();
    } catch {
      data = { error: 'Login failed' };
    }
    loginMessageEl.textContent = data.error || 'Login failed';
    loginMessageEl.classList.add('error');
    loginMessageEl.classList.remove('success');
  }
});

const signupForm = document.getElementById('signupForm');
const signupMessageEl = document.getElementById('signupMessage');

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('signupUsername').value;
  const password = document.getElementById('signupPassword').value;

  signupMessageEl.textContent = '';
  signupMessageEl.classList.remove('error', 'success');

  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();

  if (res.ok) {
    signupMessageEl.textContent = 'Registration successful! You can now log in.';
    signupMessageEl.classList.add('success');
    signupForm.reset();
  } else {
    signupMessageEl.textContent = data.error || 'Registration failed.';
    signupMessageEl.classList.add('error');
  }
});