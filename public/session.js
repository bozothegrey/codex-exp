const params = new URLSearchParams(window.location.search);
const sessionId = params.get('id');
const readonly = params.get('readonly') === '1' || params.get('readonly') === 'true';
let allExercises = [];
let lastSet = {
  exerciseName: '',
  reps: '',
  weight: ''
};

async function loadExercises() {
  const res = await fetch('/api/exercises');
  allExercises = await res.json();
  const datalist = document.getElementById('exerciseSuggestions');
  datalist.innerHTML = '';
  allExercises.forEach(ex => {
    const option = document.createElement('option');
    option.value = ex.name;
    datalist.appendChild(option);
  });
}

async function loadLocations() {
  try {
    const response = await fetch('/api/locations');
    if (!response.ok) throw new Error('Failed to load locations');
    const locations = await response.json();
    const select = document.getElementById('locationSelect');
    
    // Clear existing options except the default
    while (select.options.length > 1) {
      select.remove(1);
    }
    
    // Add new options
    locations.forEach(location => {
      if (location.id !== 0) { // Skip default as it's already there
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

async function loadSession() {
  try {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to load session:', {
        status: res.status,
        statusText: res.statusText,
        error: errorText,
        url: res.url
      });
      document.getElementById('setList').innerHTML = 
        `<li class="error">Failed to load session (${res.status})</li>`;
      return;
    }
    const data = await res.json();
    console.log('Session API Response:', data); // Detailed debug log
    if (!data) {
      console.error('Empty session data received');
      return;
    }
    const locationText = data.location_name ? ` at ${data.location_name}` : '';
    document.getElementById('sessionTitle').textContent = 
      `Session${locationText} started at ${new Date(data.start_time).toLocaleString()}`;

    const list = document.getElementById('setList');
    list.innerHTML = '';
    if (!data.sets || data.sets.length === 0) {
      list.innerHTML = '<li>Enter your first set for this session</li>';
      return;
    }

    data.sets.forEach(set => {
      const li = document.createElement('li');
      li.textContent = `${set.exercise.name}: ${set.reps} reps @ ${set.weight || 0}`;
      if (!readonly && !data.closed) {
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '×';
        deleteBtn.style.marginLeft = '10px';
        deleteBtn.style.color = 'red';
        deleteBtn.style.border = 'none';
        deleteBtn.style.background = 'none';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.addEventListener('click', async () => {
          await fetch(`/api/sets/${set.id}`, { method: 'DELETE' });
          loadSession();
        });
        li.appendChild(deleteBtn);
      }
      list.appendChild(li);
    });

    if (readonly || data.closed) {
      document.getElementById('setForm').style.display = 'none';
      document.getElementById('closeButton').style.display = 'none';
    }

    // Prefill the form with last set's data
    document.getElementById('setExerciseName').value = lastSet.exerciseName;
    document.getElementById('setReps').value = lastSet.reps;
    document.getElementById('setWeight').value = lastSet.weight;
  } catch (error) {
    console.error('Error loading session:', error);
  }
}

if (sessionId) {
  const manageExercisesLink = document.querySelector('a[href="exercises.html"]');
  if (manageExercisesLink) {
    manageExercisesLink.href = `exercises.html?sessionId=${sessionId}`;
  }

  loadExercises();
  loadSession();
  
  // Add input filtering
  const exerciseInput = document.getElementById('setExerciseName');
  exerciseInput.addEventListener('input', () => {
    const value = exerciseInput.value.toLowerCase();
    const datalist = document.getElementById('exerciseSuggestions');
    datalist.innerHTML = '';
    allExercises
      .filter(ex => ex.name.toLowerCase().includes(value))
      .forEach(ex => {
        const option = document.createElement('option');
        option.value = ex.name;
        datalist.appendChild(option);
      });

    // If user changes exercise, clear reps/weight if different from last set
    if (exerciseInput.value !== lastSet.exerciseName) {
      document.getElementById('setReps').value = '';
      document.getElementById('setWeight').value = '';
    }
  });
}

const setForm = document.getElementById('setForm');
if (setForm) {
  setForm.addEventListener('submit', async e => {
    e.preventDefault();
    const exerciseInput = document.getElementById('setExerciseName');
    const selectedExercise = allExercises.find(ex => ex.name === exerciseInput.value);
    if (!selectedExercise) {
      alert('Please select a valid exercise from the list');
      return;
    }

    // Convert values to numbers
    const reps = parseInt(document.getElementById('setReps').value, 10);
    const weight = parseFloat(document.getElementById('setWeight').value);

    // Basic validation
    if (isNaN(reps) || reps <= 0) {
      alert('Please enter a valid number of reps.');
      return;
    }
    if (isNaN(weight) || weight < 0) {
      alert('Please enter a valid weight.');
      return;
    }

    try {
      const response = await fetch(`/api/sessions/${sessionId}/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exercise_id: selectedExercise.id,
          reps,
          weight
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add set');
      }

      // Store the successful set's data
      lastSet.exerciseName = selectedExercise.name;
      lastSet.reps = reps;
      lastSet.weight = weight;

      // Clear only the exercise input (keep reps/weight for same exercise)
      exerciseInput.value = '';
      loadSession();

    } catch (error) {
      console.error('Error adding set:', error);
      alert(`Error: ${error.message}`);
    }
  });
}

// Show delete button for all sessions
document.getElementById('deleteSession').style.display = '';

// Hide terminate button for readonly/closed sessions
if (readonly) {
  document.getElementById('terminateSession').style.display = 'none';
}

const terminateSession = document.getElementById('terminateSession');
if (terminateSession) {
  terminateSession.addEventListener('click', async () => {
    if (confirm('Are you sure you want to terminate this session?')) {
      await fetch(`/api/sessions/${sessionId}/close`, { method: 'POST' });
      window.location.href = 'index.html';
    }
  });
}

const deleteSession = document.getElementById('deleteSession');
if (deleteSession) {
  deleteSession.addEventListener('click', async () => {
    if (confirm('Are you sure you want to permanently delete this session? This cannot be undone.')) {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (res.ok) {
        window.location.href = 'index.html';
      } else {
        alert('Failed to delete session');
      }
    }
  });
}
