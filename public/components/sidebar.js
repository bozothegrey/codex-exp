class AppSidebar extends HTMLElement {
  constructor() {
    super();
  }

  async connectedCallback() {
    const resp = await fetch('components/sidebar.html');
    const html = await resp.text();
    this.innerHTML = html;
    
    // Initialize sidebar functionality
    this.setupUserSearch();    
    this.setupFollowedUsers();
    this.setupGroups();
    this.setupNotifications();
    this.setupChallenges();
  }

  // User Search Functionality
  setupUserSearch() {
    const findUserBtn = this.querySelector('#findUserBtn');
    if (findUserBtn) {
      findUserBtn.addEventListener('click', async () => {
        const username = this.querySelector('#userSearchInput').value.trim();
        const resultDiv = this.querySelector('#userSearchResult');
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
            this.querySelector('#followUserBtn').onclick = async () => {
              const followRes = await fetch(`/api/follow/${user.id}`, {
                method: 'POST'
              });
              if (followRes.ok) {
                this.addFollowedUserToList(user);
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
    }
  }

  // Followed Users Functionality
  async setupFollowedUsers() {
    await this.fetchFollowedUsers();
  }

  async fetchFollowedUsers() {
    const ul = this.querySelector('#followedUsersList');
    if (!ul) return;
    
    ul.innerHTML = '';
    try {
      const res = await fetch('/api/follows');
      if (res.ok) {
        const users = await res.json();
        users.forEach(user => this.addFollowedUserToList(user));
      }
    } catch (e) {
      // Optionally handle error
    }
  }

  addFollowedUserToList(user) {
    const ul = this.querySelector('#followedUsersList');
    if (!ul) return;
    
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

  //Groups Functionality
  setupGroups() {
    // Initialize create group button
    const createBtn = this.querySelector('#createGroupBtn');
    if (createBtn) {
      createBtn.addEventListener('click', async () => {
        try {
          await this.createGroup();
        } catch (error) {
          console.error('Error creating group:', error);
        }
      });
    }

    // Initialize groups list
    this.groupsList = this.querySelector('#groupsList');
    if (!this.groupsList) {
      this.groupsList = document.createElement('ul');
      this.groupsList.id = 'groupsList';
      this.appendChild(this.groupsList);
    }

    // Initial fetch of groups
    this.fetchGroups();

    // Set up periodic refresh (every 30 seconds)
    this.groupsRefreshInterval = setInterval(() => {
      this.fetchGroups();
    }, 30000);
  }

  // Don't forget to clear interval when component disconnects
  disconnectedCallback() {
    if (this.groupsRefreshInterval) {
      clearInterval(this.groupsRefreshInterval);
    }
  }


  async fetchGroups() {
    try {
      const res = await fetch('/api/groups');
      if (!res.ok) {
        console.error('Failed to fetch groups');
        return;
      }
      const groups = await res.json();
      const groupsList = this.querySelector('#groupsList');
      groupsList.innerHTML = '';
      
      groups.forEach(group => {
        const li = document.createElement('li');
        const memberStatus = group.is_member ? ' (Member)' : '';
        const ownerStatus = group.is_owner ? ' (Owner)' : '';
        const status = group.is_owner ? ownerStatus : (group.is_member ? memberStatus : '');
        
        li.innerHTML = `
          <strong>${group.name}</strong>${status}<br>
          <small>Owner: ${group.owner_username}</small><br>
          <small>${group.description || 'No description'}</small><br>
          <small>Created: ${new Date(group.created_at).toLocaleDateString()}</small>
        `;
        
        const actionsDiv = document.createElement('div');
        actionsDiv.style.marginTop = '5px';
        
        if (!group.is_member) {
          const joinBtn = document.createElement('button');
          joinBtn.textContent = 'Join';
          joinBtn.className = 'session-action';
          joinBtn.onclick = () => this.joinGroup(group.id);
          actionsDiv.appendChild(joinBtn);
        } else if (!group.is_owner) {
          const leaveBtn = document.createElement('button');
          leaveBtn.textContent = 'Leave';
          leaveBtn.className = 'session-action';
          leaveBtn.style.color = 'red';
          leaveBtn.onclick = () => this.leaveGroup(group.id);
          actionsDiv.appendChild(leaveBtn);
        } else {
          const deleteBtn = document.createElement('button');
          deleteBtn.textContent = 'Delete';
          deleteBtn.className = 'session-action';
          deleteBtn.style.color = 'red';
          deleteBtn.onclick = () => this.deleteGroup(group.id);
          actionsDiv.appendChild(deleteBtn);
        }
        
        const viewBtn = document.createElement('button');
        viewBtn.textContent = 'View Members';
        viewBtn.className = 'session-action';
        viewBtn.onclick = () => this.viewGroupMembers(group.id);
        actionsDiv.appendChild(viewBtn);
        
        li.appendChild(actionsDiv);
        groupsList.appendChild(li);
      });
    } catch (e) {
      console.error('Error fetching groups:', e);
    }
  }

    async createGroup() {
      const name = prompt('Enter group name:');
      if (!name) return;
      
      const description = prompt('Enter group description (optional):');
      
      try {
        const res = await fetch('/api/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description })
        });
        
        if (res.ok) {
          alert('Group created successfully!');
          this.fetchGroups();
        } else {
          const data = await res.json();
          alert('Failed to create group: ' + (data.error || 'Unknown error'));
        }
      } catch (e) {
        console.error('Error creating group:', e);
        alert('Failed to create group');
      }
    }

    async joinGroup(groupId) {
    try {
      const res = await fetch(`/api/groups/${groupId}/join`, {
        method: 'POST'
      });
      
      if (res.ok) {
        alert('Joined group successfully!');
        this.fetchGroups();
      } else {
        const data = await res.json();
        alert('Failed to join group: ' + (data.error || 'Unknown error'));
      }
    } catch (e) {
      console.error('Error joining group:', e);
      alert('Failed to join group');
    }
  }

  async leaveGroup(groupId) {
    if (!confirm('Are you sure you want to leave this group?')) return;
    
    try {
      const res = await fetch(`/api/groups/${groupId}/leave`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        alert('Left group successfully!');
        this.fetchGroups();
      } else {
        const data = await res.json();
        alert('Failed to leave group: ' + (data.error || 'Unknown error'));
      }
    } catch (e) {
      console.error('Error leaving group:', e);
      alert('Failed to leave group');
    }
  }

  async deleteGroup(groupId) {
    if (!confirm('Are you sure you want to delete this group? This action cannot be undone.')) return;
    
    try {
      const res = await fetch(`/api/groups/${groupId}`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        alert('Group deleted successfully!');
        this.fetchGroups();
      } else {
        const data = await res.json();
        alert('Failed to delete group: ' + (data.error || 'Unknown error'));
      }
    } catch (e) {
      console.error('Error deleting group:', e);
      alert('Failed to delete group');
    }
  }

  async viewGroupMembers(groupId) {
    try {
      const res = await fetch(`/api/groups/${groupId}`);
      if (!res.ok) {
        alert('Failed to load group details');
        return;
      }
      
      const group = await res.json();
      let membersList = `Group: ${group.name}\n\nMembers:\n`;
      
      group.members.forEach(member => {
        const role = member.is_owner ? ' (Owner)' : '';
        const joinedDate = new Date(member.joined_at).toLocaleDateString();
        membersList += `• ${member.username}${role} - Joined: ${joinedDate}\n`;
      });
      
      alert(membersList);
    } catch (e) {
      console.error('Error viewing group members:', e);
      alert('Failed to load group members');
    }
  }



  // Notifications Functionality
  setupNotifications() {
    this.fetchNotifications();
    setInterval(() => this.fetchNotifications(), 60000); // Poll every 1 minute
  }

  async fetchNotifications() {
    const ul = this.querySelector('#notificationsList');
    if (!ul) return;
    
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
                certifyBtn.onclick = (e) => { e.stopPropagation(); this.handleCertify(activityId, li); };
                li.appendChild(certifyBtn);
                const challengeRes = await fetch(`/api/challenges/${activityId}`);
                const data = await challengeRes.json();
                if (!data.hasOpenChallenge) {
                  const challengeBtn = document.createElement('button');
                  challengeBtn.className = 'challenge-btn icon-btn';
                  challengeBtn.title = 'Challenge this activity';
                  challengeBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="white" stroke="#D32F2F" stroke-width="2"/><path d="M11 7h2v7h-2z" fill="#D32F2F"/><path d="M11 15h2v2h-2z" fill="#D32F2F"/></svg>';
                  challengeBtn.onclick = (e) => { e.stopPropagation(); this.handleChallenge(activityId, li); };
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
          } else if (n.type === 'personal_record') {
            const data = typeof n.data === 'string' ? JSON.parse(n.data) : n.data;
            li.className = 'pr-notification';
            const date = new Date(n.created_at);
            const formattedDate = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            
            const container = document.createElement('div');
            container.className = 'pr-container';
            
            const icon = document.createElement('span');
            icon.className = 'pr-icon';
            icon.textContent = '🏆';
            
            const content = document.createElement('div');
            content.className = 'pr-content';
            content.innerHTML = `
              <strong>New Personal Record!</strong><br>
              ${data.username} achieved ${data.weight}kg x ${data.reps} reps in ${data.exercise_name}<br>
              1RM: ${data.oneRM.toFixed(2)}kg (Epley formula)<br>
              <small>${formattedDate}</small>
            `;
            
            container.appendChild(icon);
            container.appendChild(content);
            li.appendChild(container);
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

  async handleCertify(activityId, li) {
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
        alert(`Error: ${err.error || 'Failed to certify activity'}`);
      }
    } catch (e) {
      alert(`Error: ${e.message || 'Failed to certify activity'}`);
    }
  }

  async handleChallenge(activityId, li) {
    try {
      console.log('Challenging activity:', activityId);
      const res = await fetch('/api/challenges', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ activity_id: activityId })
      });
      if (res.ok) {
        li.querySelector('.challenge-btn').classList.add('done');
        li.querySelector('.challenge-btn').title = 'Challenged!';
        console.log('Successfully challenged activity:', activityId);
      } else {
        const err = await res.json();
        alert(`Error: ${err.error || 'Failed to challenge activity'}`);
      }
    } catch (e) {
      alert(`Error: ${e.message || 'Failed to challenge activity'}`);
    }
  }

  // Challenges Functionality
  setupChallenges() {
    this.setupChallengeFilters();
  }

  renderChallengeList(listElem, challenges) {
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

  async fetchChallengesReceived(status) {
    const ul = this.querySelector('#challengesReceivedList');
    if (!ul) return;
    
    ul.innerHTML = '<li>Loading...</li>';
    try {
      const res = await fetch(`/api/challenges?status=${status}`);
      if (res.ok) {
        const challenges = await res.json();
        this.renderChallengeList(ul, challenges);
      } else {
        ul.innerHTML = '<li>Error loading challenges.</li>';
      }
    } catch (e) {
      ul.innerHTML = '<li>Error loading challenges.</li>';
    }
  }

  async fetchChallengesGiven(status) {
    const ul = this.querySelector('#challengesGivenList');
    if (!ul) return;
    
    ul.innerHTML = '<li>Loading...</li>';
    try {
      const res = await fetch(`/api/challenges/given?status=${status}`);
      if (res.ok) {
        const challenges = await res.json();
        this.renderChallengeList(ul, challenges);
      } else {
        ul.innerHTML = '<li>Error loading challenges.</li>';
      }
    } catch (e) {
      ul.innerHTML = '<li>Error loading challenges.</li>';
    }
  }

  setupChallengeFilters() {
    let receivedStatus = 'open';
    let givenStatus = 'open';

    const setReceivedStatus = (status) => {
      receivedStatus = status;
      this.fetchChallengesReceived(receivedStatus);
      this.querySelectorAll('#challengesReceivedSection .challenge-filter-btn').forEach(btn => {
        btn.disabled = btn.getAttribute('data-status') === status;
      });
    };
    
    const setGivenStatus = (status) => {
      givenStatus = status;
      this.fetchChallengesGiven(givenStatus);
      this.querySelectorAll('#challengesGivenSection .challenge-filter-btn').forEach(btn => {
        btn.disabled = btn.getAttribute('data-status') === status;
      });
    };

    const receivedFilterOpen = this.querySelector('#receivedFilterOpen');
    const receivedFilterClosed = this.querySelector('#receivedFilterClosed');
    const receivedFilterBoth = this.querySelector('#receivedFilterBoth');
    const givenFilterOpen = this.querySelector('#givenFilterOpen');
    const givenFilterClosed = this.querySelector('#givenFilterClosed');
    const givenFilterBoth = this.querySelector('#givenFilterBoth');

    if (receivedFilterOpen) receivedFilterOpen.onclick = () => setReceivedStatus('open');
    if (receivedFilterClosed) receivedFilterClosed.onclick = () => setReceivedStatus('closed');
    if (receivedFilterBoth) receivedFilterBoth.onclick = () => setReceivedStatus('both');
    if (givenFilterOpen) givenFilterOpen.onclick = () => setGivenStatus('open');
    if (givenFilterClosed) givenFilterClosed.onclick = () => setGivenStatus('closed');
    if (givenFilterBoth) givenFilterBoth.onclick = () => setGivenStatus('both');

    // Initial fetch
    setReceivedStatus(receivedStatus);
    setGivenStatus(givenStatus);

    // Polling
    setInterval(() => {
      this.fetchChallengesReceived(receivedStatus);
      this.fetchChallengesGiven(givenStatus);
    }, 10000); // every 10s
  }
}

customElements.define('app-sidebar', AppSidebar); 