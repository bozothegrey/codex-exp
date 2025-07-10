// Handle login form
const loginForm = document.getElementById('loginForm');
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    credentials: 'include'
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

// Handle registration form
const signupForm = document.getElementById('signupForm');
signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(signupForm);
  const username = formData.get('username');
  const password = formData.get('password');
  
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  
  if (res.ok) {
    // After successful registration, automatically log the user in
    const loginRes = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'include'
    });
    
    if (loginRes.ok) {
      // Redirect to home page after successful registration and login
      window.location.href = '/';
    } else {
      let loginData;
      try {
        loginData = await loginRes.json();
      } catch {
        loginData = { error: 'Registration successful but login failed' };
      }
      document.getElementById('error').innerText = loginData.error || 'Registration successful but login failed';
    }
  } else {
    let data;
    try {
      data = await res.json();
    } catch {
      data = { error: 'Registration failed' };
    }
    document.getElementById('error').innerText = data.error || 'Registration failed';
  }
});
