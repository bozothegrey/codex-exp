// swipe.js
(function() {
  const swipeContainer = document.getElementById('swipeContainer');
  let startX = null;
  let currentView = 'left'; // 'left' or 'right'

  function updateView() {
    if (window.innerWidth <= 600) {
      swipeContainer.classList.toggle('show-left', currentView === 'left');
      swipeContainer.classList.toggle('show-right', currentView === 'right');
    } else {
      swipeContainer.classList.remove('show-left', 'show-right');
    }
  }

  swipeContainer.addEventListener('touchstart', function(e) {
    if (e.touches.length === 1) startX = e.touches[0].clientX;
  });

  swipeContainer.addEventListener('touchend', function(e) {
    if (startX === null) return;
    const endX = e.changedTouches[0].clientX;
    const dx = endX - startX;
    if (Math.abs(dx) > 50) { // swipe threshold
      if (dx < 0 && currentView === 'left') {
        currentView = 'right';
        updateView();
      } else if (dx > 0 && currentView === 'right') {
        currentView = 'left';
        updateView();
      }
    }
    startX = null;
  });

  window.addEventListener('resize', updateView);
  updateView();
})();
