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
      `<a href="${viewUrl}" class="session-action">View</a> | 
       <span class="session-action delete-action" data-id="${row.id}" style="color:red">Delete</span>` :
      `<a href="${editUrl}" class="session-action">Resume</a> | 
       <span class="session-action terminate-action" data-id="${row.id}">Terminate</span>`;
    const startTime = new Date(row.start_time).toLocaleString();
    const duration = row.closed && row.end_time ? 
      Math.floor((new Date(row.end_time) - new Date(row.start_time)) / 60000) + 'm' : 
      '';
    tr.innerHTML = `<td>${startTime}</td><td>${duration}</td><td>${row.closed ? 'Closed' : 'Open'}</td><td>${actions}</td>`;
    tbody.appendChild(tr);
  });
}

document.getElementById('sessionForm').addEventListener('submit', async e => {
  e.preventDefault();
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
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
    console.log('Certifying activity:', activityId);
    const res = await fetch('/api/certifications', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ activity_id: activityId })
    });
    if (res.ok) {
      li.querySelector('.certify-btn').classList.add('done');
      li.querySelector('.certify-btn').title = 'Certified!';
      console.log('Successfully certified activity:', activityId);
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
    console.log('Challenging activity:', activityId);
    const res = await fetch('/api/challenges', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ 
        challenged_activity_id: activityId
      })
    });
    
    if (res.ok) {
      li.querySelector('.challenge-btn').classList.add('done');
      li.querySelector('.challenge-btn').title = 'Challenged!';
      return;
    }

    // Enhanced error handling
    const err = await res.json();
    console.error('Challenge error:', {
      status: res.status,
      error: err,
      activityId
    });

    let errorMsg = 'Could not challenge. ';
    if (res.status === 400) {
      errorMsg += err.error || 'Invalid request';
    } else if (res.status === 401) {
      errorMsg += 'Please login again';
    } else if (res.status === 404) {
      errorMsg += 'Activity not found';
    } else {
      errorMsg += 'Server error';
    }

    alert(errorMsg);
  } catch (e) {
    console.error('Challenge exception:', e);
    alert(`Error: ${e.message || 'Failed to challenge activity'}`);
  }
}

async function fetchNotifications() {
  const ul = document.getElementById('notificationsList');
  ul.innerHTML = '';
  try {
    const res = await fetch('/api/notifications');
    if (res.ok) {
      const notifications = await res.json();
      for (const n of notifications) {
        const li = document.createElement('li');
        li.dataset.notification = JSON.stringify({
          id: n.id,
          type: n.type,
          user_id: n.user_id,          
          username: n.username,
          data: n.data
        });
        let msg = '';
        let activityId = n.activity_id;
        if (n.type === 'set_logged') {
          const data = typeof n.data === 'string' ? JSON.parse(n.data) : n.data;
          msg = `${data.username || 'A user you follow'} performed ${data.reps} reps of ${data.exercise_name || 'an exercise'} at ${ data.weight ? data.weight + 'kg' : 'body'} weight`;          
          li.appendChild(document.createTextNode(msg));
            try {
            const certRes = await fetch(`/api/certifications/${activityId}`);
            const certData = await certRes.json();
            if (certData.certified) {
              // Activity is certified - add tag and skip buttons
              const certTag = document.createElement('span');
              certTag.className = 'certified-tag';
              certTag.textContent = ' #certified';
              certTag.style.color = '#1ca21c';
              certTag.style.marginLeft = '5px';
              li.appendChild(certTag);
            } else {
              // Activity not certified - add buttons
              const certifyBtn = document.createElement('button');
              certifyBtn.className = 'certify-btn icon-btn';
              certifyBtn.title = 'Certify this activity';
              certifyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="7" stroke="#1ca21c" stroke-width="2"/><path d="M5 8L7 10L11 6" stroke="#1ca21c" stroke-width="2" stroke-linecap="round"/></svg>';
              certifyBtn.onclick = (e) => { e.stopPropagation(); handleCertify(activityId, li); };
              li.appendChild(certifyBtn);
              const challengeRes = await fetch(`/api/challenges/${activityId}`);
              const data = await challengeRes.json();
              if (!data.hasOpenChallenge) {
                const challengeBtn = document.createElement('button');
                challengeBtn.className = 'challenge-btn icon-btn';
                challengeBtn.title = 'Challenge this activity';
                challengeBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="white" stroke="#D32F2F" stroke-width="2"/><path d="M11 7h2v7h-2z" fill="#D32F2F"/><path d="M11 15h2v2h-2z" fill="#D32F2F"/></svg>';
                challengeBtn.onclick = (e) => { e.stopPropagation(); handleChallenge(activityId, li); };
                li.appendChild(challengeBtn);
              } else {
                const challengeTag = document.createElement('span');
                challengeTag.className = 'challenged-tag';
                challengeTag.textContent = ' #challenged';
                challengeTag.style.color = '#ff0000';
                challengeTag.style.marginLeft = '5px';
                li.appendChild(challengeTag);              
              }
            }
          } catch (e) {
            console.error('Error checking certification status:', e);
          }
        } else if (n.type === 'session_started') {
          const data = typeof n.data === 'string' ? JSON.parse(n.data) : n.data;
          const date = new Date(n.created_at);
          const formattedDate = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
          msg = `Session started by ${data.username} at ${formattedDate}`;
          li.appendChild(document.createTextNode(msg));
        } else if (n.type === 'session_ended') {
          const data = typeof n.data === 'string' ? JSON.parse(n.data) : n.data;
          const date = new Date(n.created_at);
          const formattedDate = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
          const durationMinutes = Math.floor((data.duration || 0) / 60000);
          msg = `Session ended by ${data.username} at ${formattedDate} (Duration: ${durationMinutes}m)`;
          li.appendChild(document.createTextNode(msg));
        } else {
          msg = n.message || n.type;
          li.appendChild(document.createTextNode(msg));
        }
        ul.appendChild(li);
        
        
      }
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

function setupTerminateButtons() {
  document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('terminate-action')) {
      const sessionId = e.target.dataset.id;
      if (confirm('Are you sure you want to terminate this session?')) {
        await fetch(`/api/sessions/${sessionId}/close`, { 
          method: 'POST' 
        });
        fetchSessions(); // Refresh the list
      }
    } else if (e.target.classList.contains('delete-action')) {
      const sessionId = e.target.dataset.id;
      if (confirm('Are you sure you want to delete this session? This cannot be undone.')) {
        const res = await fetch(`/api/sessions/${sessionId}`, {
          method: 'DELETE'
        });
        if (res.ok) {
          fetchSessions(); // Refresh the list
        } else {
          alert('Failed to delete session');
        }
      }
    }
  });
}

window.onload = async () => {
  await updateAuthLinks();
  fetchSessions();
  fetchFollowedUsers();
  startNotificationsPolling();
  setupChallengeFilters();
  setupTerminateButtons();
};
