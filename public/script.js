async function fetchSessions() {
  const res = await fetch('/api/sessions');
  const data = await res.json();
  const tbody = document.querySelector('#sessionsTable tbody');
  tbody.innerHTML = '';
  data.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.date}</td><td>${row.activity}</td><td>${row.duration || ''}</td>`;
    tbody.appendChild(tr);
  });
}

document.getElementById('sessionForm').addEventListener('submit', async e => {
  e.preventDefault();
  const date = document.getElementById('date').value;
  const activity = document.getElementById('activity').value;
  const duration = document.getElementById('duration').value;
  await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, activity, duration })
  });
  e.target.reset();
  fetchSessions();
});

window.onload = fetchSessions;
