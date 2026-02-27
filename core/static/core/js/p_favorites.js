document.addEventListener('DOMContentLoaded', () => {
  // Initialize Mobile Drag and Drop Polyfill
  if (typeof MobileDragDrop !== 'undefined') {
    MobileDragDrop.polyfill({
      dragImageTranslateOverride: MobileDragDrop.scrollBehaviourDragImageTranslateOverride
    });
  }

  const containers = document.querySelectorAll('.draggable-container');
  
  // Infinite Scroll Observer
  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const sentinel = entry.target;
        const container = sentinel.closest('.draggable-container');
        const section = container.closest('.favorite-section');
        
        if (section.dataset.loading === 'true' || section.dataset.hasMore === 'false') return;
        
        loadMoreItems(section, container, sentinel);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.loading-sentinel').forEach(sentinel => {
    // Only observe if the section actually has more items
    const section = sentinel.closest('.favorite-section');
    if (section.dataset.hasMore === 'true') {
      observer.observe(sentinel);
    } else {
      sentinel.style.display = 'none';
    }
  });

  containers.forEach(container => {
    let draggedItem = null;

    // Use event delegation on the container
    container.addEventListener('dragstart', e => {
       document.body.classList.add('drag-active');
      // Disable drag on phones in portrait mode
      if (window.matchMedia('(orientation: portrait)').matches) {
        e.preventDefault();
        return;
      }

      const draggable = e.target.closest('.draggable');
      if (draggable) {
        draggedItem = draggable;
        
        // Explicitly set the drag image to the poster for better visibility
        const img = draggable.querySelector('img');
        if (img && e.dataTransfer) {
            const rect = img.getBoundingClientRect();
            e.dataTransfer.setDragImage(img, rect.width / 2, rect.height / 2);
        }

        // Use a timeout to avoid the element disappearing immediately
        setTimeout(() => {
          if (draggedItem) draggedItem.classList.add('dragging');
        }, 0);
      }
    });

    container.addEventListener('dragend', e => {
      document.body.classList.remove('drag-active');
      
      if (draggedItem) {
        draggedItem.classList.remove('dragging');
        // Save order after the drop is complete
        saveOrder(container);
        draggedItem = null;
      }
    });

    container.addEventListener('dragover', e => {
      e.preventDefault(); // Necessary to allow dropping
      const afterElement = getDragAfterElement(container, e.clientX, e.clientY);
      const currentDragged = container.querySelector('.dragging');
      if (currentDragged) {
        if (afterElement == null) {
          container.appendChild(currentDragged);
        } else {
          container.insertBefore(currentDragged, afterElement);
        }
      }
    });
  });

  function getDragAfterElement(container, x, y) {
    const draggableElements = [...container.querySelectorAll('.draggable:not(.dragging)')];

    return draggableElements.find(child => {
      const box = child.getBoundingClientRect();
      
      // If cursor is above this element's top edge, we are before it
      if (y < box.top) return true;
      
      // If cursor is below this element's bottom edge, we are after it
      if (y > box.bottom) return false;
      
      // If within vertical bounds, check horizontal center
      if (x < box.left + box.width / 2) return true;
      
      return false;
    });
  }

  function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
      const cookies = document.cookie.split(';');
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.substring(0, name.length + 1) === (name + '=')) {
          cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  }

  function saveOrder(container) {
    const section = container.closest('.favorite-section');
    if (!section) return;

    const type = section.dataset.type; // 'media' or 'person'
    const ids = [...container.querySelectorAll('.draggable')].map(el => el.dataset.id);

    const endpoint = type === 'media' 
      ? '/api/favorite-media/reorder/' 
      : '/api/favorite-persons/reorder/';

    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCookie('csrftoken'),
      },
      body: JSON.stringify({ order: ids }),
    })
    .then(response => {
      if (!response.ok) {
        console.error('Failed to save order.');
        // Optional: notify user or revert UI
      }
    })
    .catch(error => console.error('Error saving order:', error));
  }

  function loadMoreItems(section, container, sentinel) {
    section.dataset.loading = 'true';
    const category = section.dataset.category;
    const currentCount = container.querySelectorAll('.card').length;
    
    // Show loading state
    sentinel.textContent = 'Loading...';
    sentinel.style.display = 'block';

    fetch(`/api/favorites/?category=${category}&offset=${currentCount}`)
      .then(response => response.json())
      .then(data => {
        data.items.forEach(item => {
          const card = document.createElement('div');
          card.className = 'card draggable';
          card.draggable = true;
          card.dataset.id = item.id;
          card.dataset.mediaType = item.media_type;
          const type = item.type;
          const slug = section.dataset.category;
          
          card.innerHTML = `
            <a href="${item.url}" class="card-link">
              <div class="card-image"><img src="${item.cover_url}" alt="${item.title}" draggable="false"></div>
            </a>
            <div class="card-title">${item.title}</div>
            <label class="card-favorite" data-id="${item.id}" data-type="${type}" data-slug="${slug}" data-title="${item.title}" data-img="${item.cover_url}">
                <input type="checkbox" checked>
                <span class="heart"></span>
            </label>
          `;
          
          // Insert before the sentinel
          container.insertBefore(card, sentinel);
        });

        section.dataset.hasMore = data.has_more;
        section.dataset.loading = 'false';

        if (!data.has_more) {
          sentinel.style.display = 'none';
          observer.unobserve(sentinel);
        }
      })
      .catch(error => console.error('Error loading more items:', error));
  }

  // Queue for sequential execution of favorite toggles to prevent race conditions
  let favoriteQueue = Promise.resolve();

  document.addEventListener('change', function(e) {
    if (e.target.closest('.card-favorite') && e.target.type === 'checkbox') {
        const checkbox = e.target;
        const label = e.target.closest('.card-favorite');
        const card = label.closest('.card');
        const type = label.dataset.type;
        const id = label.dataset.id;
        const isChecked = checkbox.checked;

        // Only handle unfavoriting (unchecking)
        if (!isChecked) {
            // Visual removal with delay
            if (card) {
                card.style.pointerEvents = 'none'; // Prevent further clicks
                setTimeout(() => {
                    card.style.transition = 'all 0.3s ease';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.8)';
                    setTimeout(() => {
                        card.remove();
                    }, 300);
                }, 300); // Delay to show the unchecked heart state
            }

            // Queue the API request
            favoriteQueue = favoriteQueue.then(async () => {
                try {
                    if (type === 'media') {
                        await fetch(`/edit-item/${id}/`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "X-CSRFToken": getCookie("csrftoken"),
                            },
                            body: JSON.stringify({ favorite: false }),
                        });
                    } else if (type === 'person') {
                        const name = label.dataset.title;
                        const img = label.dataset.img;
                        const slug = label.dataset.slug;
                        const personType = slug === 'characters' ? 'character' : 'actor';
                        const requestData = { name: name, image_url: img, type: personType };
                        
                        await fetch("/api/toggle_favorite_person/", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              "X-CSRFToken": getCookie("csrftoken"),
                            },
                            body: JSON.stringify(requestData),
                        });
                    }
                } catch (error) {
                    console.error('Error removing favorite:', error);
                }
            });
        }
    }
  });

  // --- View Mode Switching ---
  const container = document.querySelector('.favorites-container');
  const viewBigBtn = document.getElementById('view-big');
  const viewSmallBtn = document.getElementById('view-small');
  const modeInfoText = document.getElementById('mode-info-text');
  const infoToggleBtn = document.getElementById('info-toggle-btn');

  const TEXT_BIG = "Detail View - Drag by title or image, hover to unfavorite, click on image for details page";
  const TEXT_SMALL = "Compact View - Drag by image";

  function setMode(mode) {
    if (mode === 'small') {
        container.classList.add('small-mode');
        viewSmallBtn.classList.add('active');
        viewBigBtn.classList.remove('active');
        modeInfoText.textContent = TEXT_SMALL;
    } else {
        container.classList.remove('small-mode');
        viewBigBtn.classList.add('active');
        viewSmallBtn.classList.remove('active');
        modeInfoText.textContent = TEXT_BIG;
    }
    localStorage.setItem('favoritesViewMode', mode);
  }

  if (viewBigBtn && viewSmallBtn) {
      viewBigBtn.addEventListener('click', () => setMode('big'));
      viewSmallBtn.addEventListener('click', () => setMode('small'));
  }

  // Prevent link navigation in small mode
  document.addEventListener('click', function(e) {
    if (container.classList.contains('small-mode')) {
        const link = e.target.closest('.card-link');
        if (link) {
            e.preventDefault();
        }
    }
  }, true); // Use capture to ensure we catch it before other listeners if needed

  // Restore saved mode
  const savedMode = localStorage.getItem('favoritesViewMode');
  if (savedMode) {
      setMode(savedMode);
  }

  // --- Info Cloud Toggle ---
  function setInfoVisibility(visible) {
      if (visible === 'false') {
          modeInfoText.classList.add('hidden');
      } else {
          modeInfoText.classList.remove('hidden');
      }
      localStorage.setItem('favoritesInfoVisible', visible);
  }

  const savedInfoState = localStorage.getItem('favoritesInfoVisible');
  if (savedInfoState !== null) setInfoVisibility(savedInfoState);

  if (infoToggleBtn) {
      infoToggleBtn.addEventListener('click', () => {
          const isHidden = modeInfoText.classList.contains('hidden');
          setInfoVisibility(isHidden ? 'true' : 'false');
      });
  }
});
