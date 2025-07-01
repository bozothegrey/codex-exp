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

async function handleCertify(activityId, li) {
  try {
    const res = await fetch('/api/certifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity_id: activityId })
    });
    if (res.ok) {
      li.querySelector('.certify-btn').classList.add('done');
      li.querySelector('.certify-btn').title = 'Certified!';
    } else {
      const err = await res.json();
      alert(err.error || 'Could not certify.');
    }
  } catch (e) {
    alert('Error certifying activity.');
  }
}

async function handleChallenge(activityId, li) {
  try {
    const res = await fetch('/api/challenges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenged_activity_id: activityId })
    });
    if (res.ok) {
      li.querySelector('.challenge-btn').classList.add('done');
      li.querySelector('.challenge-btn').title = 'Challenged!';
    } else {
      const err = await res.json();
      alert(err.error || 'Could not challenge.');
    }
  } catch (e) {
    alert('Error challenging activity.');
  }
}

async function fetchNotifications() {
  const ul = document.getElementById('notificationsList');
  ul.innerHTML = '';
  try {
    const res = await fetch('/api/notifications');
    console.log('Notifications API response:', res.status, res.ok);
    if (res.ok) {
      const notifications = await res.json();
      console.log('Received notifications:', notifications);
      notifications.forEach(n => {
        const li = document.createElement('li');
        let msg = '';
        let activityId = null;
        if (n.type === 'set_logged') {
          const data = typeof n.data === 'string' ? JSON.parse(n.data) : n.data;
          msg = data.message || `${data.username || 'A user you follow'} logged a new set.`;
          activityId = data.setId || data.set_id || data.activity_id;
        } else {
          msg = n.message || n.type;
        }
        li.appendChild(document.createTextNode(msg));
        if (activityId) {
          // Add certify (checkmark) icon
          const certifyBtn = document.createElement('button');
          certifyBtn.className = 'certify-btn icon-btn';
          certifyBtn.title = 'Certify this activity';
          certifyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="7" stroke="#1ca21c" stroke-width="2"/><path d="M5 8L7 10L11 6" stroke="#1ca21c" stroke-width="2" stroke-linecap="round"/></svg>';
          certifyBtn.onclick = (e) => { e.stopPropagation(); handleCertify(activityId, li); };
          li.appendChild(certifyBtn);

          // Add challenge (dumbbell) icon
          const challengeBtn = document.createElement('button');
          challengeBtn.className = 'challenge-btn icon-btn';
          challengeBtn.title = 'Challenge this activity';
          challengeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="7" width="12" height="2" rx="1" fill="#ff6600"/><rect x="1" y="5" width="2" height="6" rx="1" fill="#888"/><rect x="13" y="5" width="2" height="6" rx="1" fill="#888"/></svg>';
          challengeBtn.onclick = (e) => { e.stopPropagation(); handleChallenge(activityId, li); };
          li.appendChild(challengeBtn);
        }
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

// --- Challenges Section ---

function renderChallengeList(listElem, challenges) {
  listElem.innerHTML = '';
  if (!challenges.length) {
    const li = document.createElement('li');
    li.textContent = 'No challenges.';
    listElem.appendChild(li);
    return;
  }
  challenges.forEach(ch => {
    const li = document.createElement('li');
    li.className = 'challenge-item';
    li.innerHTML = `
      <div><b>Status:</b> <span class="challenge-status ${ch.status}">${ch.status}</span></div>
      <div><b>Expires:</b> ${ch.expires_at ? new Date(ch.expires_at).toLocaleString() : 'N/A'}</div>
      <div><b>Activity:</b> Set #${ch.challenged_activity_id || ch.activity_id || ch.id}</div>
    `;
    listElem.appendChild(li);
  });
}

async function fetchChallengesReceived(status) {
  const ul = document.getElementById('challengesReceivedList');
  ul.innerHTML = '<li>Loading...</li>';
  try {
    const res = await fetch(`/api/challenges?status=${status}`);
    if (res.ok) {
      const challenges = await res.json();
      renderChallengeList(ul, challenges);
    } else {
      ul.innerHTML = '<li>Error loading challenges.</li>';
    }
  } catch (e) {
    ul.innerHTML = '<li>Error loading challenges.</li>';
  }
}

async function fetchChallengesGiven(status) {
  const ul = document.getElementById('challengesGivenList');
  ul.innerHTML = '<li>Loading...</li>';
  try {
    const res = await fetch(`/api/challenges/given?status=${status}`);
    if (res.ok) {
      const challenges = await res.json();
      renderChallengeList(ul, challenges);
    } else {
      ul.innerHTML = '<li>Error loading challenges.</li>';
    }
  } catch (e) {
    ul.innerHTML = '<li>Error loading challenges.</li>';
  }
}

function setupChallengeFilters() {
  let receivedStatus = 'open';
  let givenStatus = 'open';

  function setReceivedStatus(status) {
    receivedStatus = status;
    fetchChallengesReceived(receivedStatus);
    document.querySelectorAll('#challengesReceivedSection .challenge-filter-btn').forEach(btn => {
      btn.disabled = btn.getAttribute('data-status') === status;
    });
  }
  function setGivenStatus(status) {
    givenStatus = status;
    fetchChallengesGiven(givenStatus);
    document.querySelectorAll('#challengesGivenSection .challenge-filter-btn').forEach(btn => {
      btn.disabled = btn.getAttribute('data-status') === status;
    });
  }

  document.getElementById('receivedFilterOpen').onclick = () => setReceivedStatus('open');
  document.getElementById('receivedFilterClosed').onclick = () => setReceivedStatus('closed');
  document.getElementById('receivedFilterBoth').onclick = () => setReceivedStatus('both');
  document.getElementById('givenFilterOpen').onclick = () => setGivenStatus('open');
  document.getElementById('givenFilterClosed').onclick = () => setGivenStatus('closed');
  document.getElementById('givenFilterBoth').onclick = () => setGivenStatus('both');

  // Initial fetch
  setReceivedStatus(receivedStatus);
  setGivenStatus(givenStatus);

  // Polling
  setInterval(() => {
    fetchChallengesReceived(receivedStatus);
    fetchChallengesGiven(givenStatus);
  }, 10000); // every 10s
}

window.onload = async () => {
  await updateAuthLinks();
  fetchSessions();
  fetchFollowedUsers();
  startNotificationsPolling();
  setupChallengeFilters();
};
