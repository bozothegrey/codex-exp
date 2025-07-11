document.addEventListener('DOMContentLoaded', async () => {
  const exerciseTable = document.getElementById('exerciseTable').querySelector('tbody');
  const addForm = document.getElementById('addExerciseForm');
  const errorEl = document.getElementById('error');

  // Load and display exercises
  async function loadExercises() {
    try {
      const res = await fetch('/api/exercises', { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Please login to view exercises');
        }
        throw new Error('Failed to load exercises');
      }
      const exercises = await res.json();
      
      exerciseTable.innerHTML = '';
      exercises.forEach(exercise => {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        nameCell.textContent = exercise.name;
        row.appendChild(nameCell);

        const deleteCell = document.createElement('td');
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '×';
        deleteBtn.style.color = 'red';
        deleteBtn.style.border = 'none';
        deleteBtn.style.background = 'none';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.addEventListener('click', async () => {
          await fetch(`/api/exercises/${exercise.id}`, {
            method: 'DELETE',
            credentials: 'include'
          });
          loadExercises();
        });
        deleteCell.appendChild(deleteBtn);
        row.appendChild(deleteCell);

        exerciseTable.appendChild(row);
      });
    } catch (err) {
      errorEl.textContent = err.message;
    }
  }

  // Add new exercise
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const exerciseName = document.getElementById('exerciseName').value.trim();
    if (!exerciseName) return;

    try {
      const res = await fetch('/api/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: exerciseName }),
        credentials: 'include'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add exercise');
      }

      document.getElementById('exerciseName').value = '';
      loadExercises();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  // Initial load
  loadExercises();
});
