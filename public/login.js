const form = document.getElementById('loginForm');
form.addEventListener('submit', async (e) => {
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
    document.getElementById('error').innerText = data.error || 'Login failed';
  }
});
