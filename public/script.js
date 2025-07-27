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
      `<a href="${viewUrl}" class="session-action">View</a>` :
      `<a href="${editUrl}" class="session-action">Resume</a> | 
       <span class="session-action terminate-action" data-id="${row.id}">Terminate</span>`;
    const startTime = new Date(row.start_time).toLocaleString();
    const duration = row.closed && row.end_time ? 
      Math.floor((new Date(row.end_time) - new Date(row.start_time)) / 60000) + 'm' : 
      '';
    const locationName = row.location_name || 'N/A';
    tr.innerHTML = `<td>${startTime}</td><td>${locationName}</td><td>${duration}</td><td>${row.closed ? 'Closed' : 'Open'}</td><td>${actions}</td>`;
    tbody.appendChild(tr);
  });
}

async function loadLocations() {
  try {
    const response = await fetch('/api/locations');
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to load locations');
    }
    const locations = await response.json();
    const select = document.getElementById('locationSelect');

    // Clear existing options except the default
    while (select.options.length > 1) {
      select.remove(1);
    }

    // Add new options from the API. We assume the location with id=0
    // is hardcoded in the HTML and not sent by the API.
    locations.forEach(location => {
      if (location.id !== 0) { // A defensive check
        const option = document.createElement('option');
        option.value = location.id;
        option.textContent = location.name;
        select.appendChild(option);
      }
    });
  } catch (err) {
    console.error('Error loading locations:', err);
  }
}

document.getElementById('sessionForm').addEventListener('submit', async e => {
  // Only handle the submit if it's coming from the session form's submit button
  if (e.submitter && e.submitter.form === e.currentTarget) {
    e.preventDefault();
    try {
      const locationId = document.getElementById('locationSelect').value;
      if (!locationId) {
        alert("Please select a location before starting a session");
        return;
      }
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: locationId })
      });
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to start session');
      }
      
      const session = await res.json();
      window.location.href = `session.html?id=${session.id}`;
    } catch (err) {
      console.error('Session creation error:', err);
      alert('Failed to start session: ' + err.message);
    }
  }
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

// Location Management Functions
async function loadLocationsForManagement() {
  try {
    const response = await fetch('/api/locations');
    if (!response.ok) throw new Error('Failed to load locations');
    const locations = await response.json();
    const list = document.getElementById('locationsList');
    list.innerHTML = '';
    
    locations.forEach(location => {
      if (location.id !== 0) { // Skip default location
        const li = document.createElement('li');
        li.innerHTML = `
          <span>${location.name}</span>
          <button class="delete-location-btn" data-id="${location.id}">Delete</button>
        `;
        list.appendChild(li);
      }
    });
  } catch (err) {
    console.error('Error loading locations:', err);
  }
}

async function addLocation(name) {
  try {
    const response = await fetch('/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add location');
    }
    
    return await response.json();
  } catch (err) {
    console.error('Error adding location:', err);
    throw err;
  }
}

async function deleteLocation(id) {
  try {
    const response = await fetch(`/api/locations/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete location');
    }
  } catch (err) {
    console.error('Error deleting location:', err);
    throw err;
  }
}

// Initialize Location Management UI
function setupLocationManagement() {
  const modal = document.getElementById('locationsModal');
  const manageBtn = document.getElementById('manageLocationsLink');
  const addForm = document.getElementById('addLocationForm');
  const locationsList = document.getElementById('locationsList');
  
  // Only setup if required elements exist
  if (!modal || !manageBtn || !addForm || !locationsList) {
    return;
  }

  // Toggle modal visibility
  manageBtn.addEventListener('click', () => {
    modal.style.display = 'block';
    loadLocationsForManagement();
  });
  
  // Close modal when clicking outside
  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });
  
  // Handle add location form
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('locationNameInput');
    const name = input.value.trim();
    
    if (!name) return;
    
    try {
      await addLocation(name);
      input.value = '';
      await loadLocationsForManagement();
      await loadLocations(); // Refresh dropdown
    } catch (err) {
      alert(err.message);
    }
  });
  
  // Handle delete location clicks
  locationsList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('delete-location-btn')) {
      const id = e.target.dataset.id;
      if (confirm('Are you sure you want to delete this location?')) {
        try {
          await deleteLocation(id);
          await loadLocationsForManagement();
          await loadLocations(); // Refresh dropdown
        } catch (err) {
          alert(err.message);
        }
      }
    }
  });
}


window.onload = async () => {
    // Redirect to login if not authenticated (except on login and signup pages)
    if (!window.location.pathname.endsWith('login.html') && !window.location.pathname.endsWith('signup.html')) {
        try {
            const res = await fetch('/api/me');
            if (res.status === 401) {
                window.location.href = 'login.html';
                return;
            }
        } catch (e) {
            // On network error, also redirect to login
            window.location.href = 'login.html';
            return;
        }
    }
    await updateAuthLinks();
    await loadLocations();
    setupTerminateButtons();
    setupLocationManagement();    
};
