async function fetchSessions() {
  const res = await fetch('/api/sessions');
  if (res.status === 401) {
    window.location.href = '/login.html';
    return;
  }
  const data = await res.json();
  const tbody = document.querySelector('#sessionsTable tbody');
  tbody.innerHTML = '';
  data.forEach(row => {
    const tr = document.createElement('tr');
    const viewUrl = `session.html?id=${row.id}&readonly=1`;
    const editUrl = `session.html?id=${row.id}`;
    const actions = row.closed ?
      `<a href="${viewUrl}">View</a>` :
      `<a href="${editUrl}">Resume</a> | <a href="${viewUrl}">View</a>`;
    tr.innerHTML = `<td>${row.date}</td><td>${row.closed ? 'Closed' : 'Open'}</td><td>${actions}</td>`;
    tbody.appendChild(tr);
  });
}

document.getElementById('sessionForm').addEventListener('submit', async e => {
  e.preventDefault();
  const date = document.getElementById('date').value;
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date })
  });
  if (res.status === 401) {
    window.location.href = '/login.html';
    return;
  }
  const session = await res.json();
  window.location.href = `session.html?id=${session.id}`;
});

async function updateAuthLinks() {
  try {
    const res = await fetch('/api/me');    
    if (res.ok) {
      const user = await res.json();     
      document.getElementById('usernameDisplay').innerText = user.username;
      document.getElementById('usernameDisplay').style.display = '';
      document.getElementById('loginLink').style.display = 'none';
      document.getElementById('logoutBtn').style.display = '';
    } else {
      document.getElementById('usernameDisplay').style.display = 'none';
      document.getElementById('loginLink').style.display = '';
      document.getElementById('logoutBtn').style.display = 'none';
    }
  } catch (e) {
    console.log('Auth check error:', e);
    document.getElementById('usernameDisplay').style.display = 'none';
    document.getElementById('loginLink').style.display = '';
    document.getElementById('logoutBtn').style.display = 'none';
  }
}

window.onload = async () => {
  await updateAuthLinks();
  fetchSessions();
};

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
});
