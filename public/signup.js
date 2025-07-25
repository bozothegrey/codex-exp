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