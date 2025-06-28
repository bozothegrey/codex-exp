async function fetchSessions() {
  const res = await fetch('/api/sessions');
// remove redirect on 410 to Login
// if (res.status === 401) {
//    window.location.href = '/login.html';
//    return;
//}
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
  // remove redirect on 410 to Login
  // if (res.status === 401) {
  //   window.location.href = '/login.html';
  //   return;
  // }
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
      document.getElementById('logoutLink').style.display = '';
    } else {
      document.getElementById('usernameDisplay').style.display = 'none';
      document.getElementById('loginLink').style.display = '';
      document.getElementById('logoutLink').style.display = 'none';
    }
  } catch (e) {
    console.log('Auth check error:', e);
    document.getElementById('usernameDisplay').style.display = 'none';
    document.getElementById('loginLink').style.display = '';
      document.getElementById('logoutLink').style.display = 'none';
  }
}

document.getElementById('findUserBtn').addEventListener('click', async () => {
  const username = document.getElementById('userSearchInput').value.trim();
  const resultDiv = document.getElementById('userSearchResult');
  resultDiv.innerHTML = '';
  if (!username) {
    resultDiv.textContent = 'Please enter a username.';
    return;
  }
  try {
    const res = await fetch(`/api/user?username=${encodeURIComponent(username)}`);
    if (res.ok) {
      const user = await res.json();
      resultDiv.innerHTML = `<span>Username: <b>${user.username}</b></span> <button id="followUserBtn" class="follow-tick" title="Follow">&#10003;</button>`;
      document.getElementById('followUserBtn').onclick = async () => {
        const followRes = await fetch(`/api/follow/${user.id}`, {
          method: 'POST'
        });
        if (followRes.ok) {
          addFollowedUserToList(user);
          resultDiv.innerHTML = '<span>Now following ' + user.username + '.</span>';
        } else {
          const err = await followRes.json();
          resultDiv.innerHTML = `<span style='color:red'>${err.error || 'Could not follow user.'}</span>`;
        }
      };
    } else {
      resultDiv.innerHTML = '<span style="color:red">User not found.</span>';
    }
  } catch (e) {
    resultDiv.innerHTML = '<span style="color:red">Error searching for user.</span>';
  }
});

async function fetchFollowedUsers() {
  const ul = document.getElementById('followedUsersList');
  ul.innerHTML = '';
  try {
    const res = await fetch('/api/follows');
    if (res.ok) {
      const users = await res.json();
      users.forEach(user => addFollowedUserToList(user));
    }
  } catch (e) {
    // Optionally handle error
  }
}

function addFollowedUserToList(user) {
  const ul = document.getElementById('followedUsersList');
  const li = document.createElement('li');
  li.textContent = user.username + ' ';
  const btn = document.createElement('button');
  btn.innerHTML = '&times;';
  btn.className = 'defollow';
  btn.title = 'Unfollow';
  btn.onclick = async () => {
    try {
      const res = await fetch(`/api/follow/${user.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        li.remove();
      } else {
        btn.textContent = 'Error';
      }
    } catch (e) {
      btn.textContent = 'Error';
    }
  };
  li.appendChild(btn);
  ul.appendChild(li);
}

async function fetchNotifications() {
  const ul = document.getElementById('notificationsList');
  ul.innerHTML = '';
  try {
    const res = await fetch('/api/notifications');
    if (res.ok) {
      const notifications = await res.json();
      notifications.forEach(n => {
        const li = document.createElement('li');
        let msg = '';
        if (n.type === 'set_logged') {
          const data = typeof n.data === 'string' ? JSON.parse(n.data) : n.data;
          msg = data.message || `${data.username || 'A user you follow'} logged a new set.`;
        } else {
          msg = n.message || n.type;
        }
        li.textContent = msg;
        ul.appendChild(li);
      });
    }
  } catch (e) {
    // Optionally handle error
  }
}

function startNotificationsPolling() {
  fetchNotifications();
  setInterval(fetchNotifications, 5000); // Poll every 5 seconds
}

window.onload = async () => {
  await updateAuthLinks();
  fetchSessions();
  fetchFollowedUsers();
  startNotificationsPolling();
};
