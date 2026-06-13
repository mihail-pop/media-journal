function getCookie(name) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== "") {
    const cookies = document.cookie.split(";");
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, name.length + 1) === name + "=") {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

// Flags to prevent multiple concurrent requests
let isRefreshing = false;
let isUploading = false;

function showNotification(message, type, duration = null) {
  // Remove any existing notification first
  const existingNotification = document.querySelector('[data-notification="true"]');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  const notification = document.createElement("div");
  notification.textContent = message;
  notification.setAttribute('data-notification', 'true');
  const isMobile = window.matchMedia("(orientation: portrait)").matches;
  const bgColor = type === "warning" ? "#FF9800" : "#4CAF50";
  notification.style.cssText = `
    position: fixed;
    top: ${isMobile ? '5rem' : '4rem'};
    left: 50%;
    transform: translateX(-50%);
    background: ${bgColor};
    color: white;
    padding: ${isMobile ? '20px 40px' : '12px 24px'};
    border-radius: ${isMobile ? '12px' : '6px'};
    z-index: 9999;
    font-weight: 500;
    font-size: ${isMobile ? '2.5rem' : '1rem'};
    width: ${isMobile ? '90%' : 'auto'};
    max-width: ${isMobile ? '90%' : 'auto'};
    text-align: center;
    box-sizing: border-box;
  `;
  document.body.appendChild(notification);
  
  const timeoutDuration = duration !== null ? duration : (type === "warning" ? 20000 : 2000);
  if (timeoutDuration > 0) {
    setTimeout(() => notification.remove(), timeoutDuration);
  }
  return notification;
}

document.addEventListener('DOMContentLoaded', function() {
    // Check for success notifications after reload
    if (sessionStorage.getItem("personRefreshSuccess") === "1") {
        showNotification('Refresh completed successfully!', 'success');
        sessionStorage.removeItem("personRefreshSuccess");
    }
    if (sessionStorage.getItem("personUploadSuccess") === "1") {
        showNotification('Image uploaded successfully!', 'success');
        sessionStorage.removeItem("personUploadSuccess");
    }
    
    document.querySelectorAll('.overview-container').forEach(container => {
        const overview = container.querySelector('.overview');
        const btn = container.querySelector('.read-more-btn');
        
        if (!overview || !btn) return;
        
        if (overview.scrollHeight <= overview.clientHeight) {
            btn.style.display = 'none';
        } else {
            btn.style.display = 'block';
        }
        
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            overview.style.webkitLineClamp = 'unset';
            overview.style.maxHeight = 'none';
            overview.style.overflow = 'visible';
            this.style.display = 'none';
        });
    });
    
    // Check favorite status
    const favForm = document.getElementById('favorite-form');
    if (favForm) {
        const personName = favForm.dataset.personName;
        const personType = favForm.dataset.personType;
        const checkbox = favForm.querySelector('input[name="favorite"]');
        
        fetch(`/api/check_favorite_person/?name=${encodeURIComponent(personName)}&type=${personType}`)
            .then(res => res.json())
            .then(result => {
                checkbox.checked = result.is_favorited;
                updateRefreshButton();
                updateUploadButton();
                favForm.parentElement.classList.add('loaded');
            })
            .catch(() => {
                checkbox.checked = false;
                favForm.parentElement.classList.add('loaded');
            });
        
        // Toggle favorite
        checkbox.addEventListener('change', function() {
            const personImage = favForm.dataset.personImage;
            const personId = favForm.dataset.personId;
            
            const requestData = { name: personName, image_url: personImage, type: personType };
            if (personId) {
                requestData.person_id = personId;
            }
            
            fetch('/api/toggle_favorite_person/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken'),
                },
                body: JSON.stringify(requestData),
            })
            .then(res => res.json())
            .then(data => {
                if (!data.status) {
                    checkbox.checked = !checkbox.checked;
                }
            })
            .catch(() => {
                checkbox.checked = !checkbox.checked;
            });
        });
    }
    
    // Refresh person data
    const refreshBtn = document.getElementById('refresh-person-btn');
    if (refreshBtn) {
        const favForm = document.getElementById('favorite-form');
        const checkbox = favForm.querySelector('input[name="favorite"]');
        
        // Function to update refresh button visibility
        function updateRefreshButton() {
            const isCustom = favForm.dataset.personId && String(favForm.dataset.personId).startsWith('custom_');
            if (isCustom) {
                refreshBtn.style.display = 'none';
            } else {
                refreshBtn.style.display = checkbox.checked ? 'flex' : 'none';
            }
        }
        
        // Initial check after favorite status is loaded
        setTimeout(updateRefreshButton, 100);
        
        // Show/hide refresh button based on favorite status
        checkbox.addEventListener('change', updateRefreshButton);
        
        window.doPersonRefresh = function(mode) {
            // Prevent multiple concurrent refresh requests
            if (isRefreshing) return;
            isRefreshing = true;
            
            const personId = favForm.dataset.personId;
            const personType = favForm.dataset.personType;
            if (!personId || !personType) {
                isRefreshing = false;
                return;
            }
            
            refreshBtn.disabled = true;
            refreshBtn.style.opacity = '0.5';
            showNotification('Refreshing...', 'warning');
            
            fetch('/api/refresh_favorite_person/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken'),
                },
                body: JSON.stringify({ person_id: personId, person_type: personType, refresh_mode: mode }),
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    sessionStorage.setItem('personRefreshSuccess', '1');
                    location.reload();
                } else {
                    isRefreshing = false;
                    refreshBtn.disabled = false;
                    refreshBtn.style.opacity = '1';
                    showNotification('Refresh failed.', 'warning');
                }
            })
            .catch(() => {
                isRefreshing = false;
                refreshBtn.disabled = false;
                refreshBtn.style.opacity = '1';
                showNotification('Refresh failed.', 'warning');
            });
        };

        refreshBtn.addEventListener('click', function() {
            window.doPersonRefresh('data'); // Default click only refreshes data
        });
    }
    
    // Upload person image
    const uploadBtn = document.getElementById('upload-person-image-btn');
    if (uploadBtn) {
        const favForm = document.getElementById('favorite-form');
        const checkbox = favForm.querySelector('input[name="favorite"]');
        
        // Show/hide upload and edit button based on favorite status
        function updateUploadButton() {
            uploadBtn.style.display = checkbox.checked ? 'flex' : 'none';
            const editBtn = document.getElementById('edit-person-btn');
            if (editBtn) editBtn.style.display = checkbox.checked ? 'flex' : 'none';
        }
        
        setTimeout(updateUploadButton, 100);
        checkbox.addEventListener('change', updateUploadButton);
        
        uploadBtn.addEventListener('click', function() {
            // Prevent multiple concurrent upload requests
            if (isUploading) return;
            isUploading = true;
            
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.jpg,.jpeg,.png,.webp,.gif';
            input.style.display = 'none';
            
            input.onchange = () => {
                const file = input.files[0];
                if (!file) {
                    isUploading = false;
                    return;
                }
                
                const personId = favForm.dataset.personId;
                const personType = favForm.dataset.personType;
                
                uploadBtn.disabled = true;
                uploadBtn.style.opacity = '0.5';
                showNotification('Uploading image...', 'warning');
                
                const formData = new FormData();
                formData.append('image', file);
                formData.append('person_id', personId);
                formData.append('person_type', personType);
                
                fetch('/api/upload_person_image/', {
                    method: 'POST',
                    headers: {
                        'X-CSRFToken': getCookie('csrftoken'),
                    },
                    body: formData,
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        sessionStorage.setItem('personUploadSuccess', '1');
                        location.reload();
                    } else {
                        isUploading = false;
                        uploadBtn.disabled = false;
                        uploadBtn.style.opacity = '1';
                        showNotification(data.error || 'Failed to upload poster.', 'warning');
                    }
                })
                .catch(() => {
                    isUploading = false;
                    uploadBtn.disabled = false;
                    uploadBtn.style.opacity = '1';
                    showNotification('Upload failed.', 'warning');
                });
            };
            
            document.body.appendChild(input);
            input.click();
            document.body.removeChild(input);
        });
    }
    
    // Spoiler click handler
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('spoiler')) {
            e.target.classList.toggle('revealed');
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Don't trigger if user is typing in input/textarea
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        if (e.shiftKey) {
            if (e.key === 'R' || e.key === 'r') {
                e.preventDefault();
                // Refresh data - SHIFT + R
                const refreshBtn = document.getElementById('refresh-person-btn');
                if (refreshBtn && refreshBtn.style.display !== 'none' && window.doPersonRefresh) {
                    window.doPersonRefresh('data');
                }
            } else if (e.key === 'D' || e.key === 'd') {
                e.preventDefault();
                // Refresh data and image - SHIFT + D
                const refreshBtn = document.getElementById('refresh-person-btn');
                if (refreshBtn && refreshBtn.style.display !== 'none' && window.doPersonRefresh) {
                    window.doPersonRefresh('all');
                }
            } else if (e.key === 'P' || e.key === 'p') {
                e.preventDefault();
                // Upload poster - SHIFT + P
                const uploadBtn = document.getElementById('upload-person-image-btn');
                if (uploadBtn && uploadBtn.style.display !== 'none') {
                    uploadBtn.click();
                }
            }
        }
    });

    // Edit Person Modal Logic
    const editModal = document.getElementById('edit-person-modal');
    const editOverlay = document.getElementById('edit-person-overlay');
    const editBtn = document.getElementById('edit-person-btn');
    const editForm = document.getElementById('edit-person-form');
    const editCloseIcons = [
        document.getElementById('edit-person-close-icon'),
        document.getElementById('edit-person-close-btn'),
        editOverlay
    ];

    // Format dates for the calendar properly if they came as "DD Month YYYY" text format from TMDB
    const parseDateString = (inputEl) => {
        if (!inputEl || !inputEl.dataset.initValue) return;
        const parsedDate = new Date(inputEl.dataset.initValue);
        if (!isNaN(parsedDate.getTime())) {
            // Converts to YYYY-MM-DD
            inputEl.value = parsedDate.toISOString().split('T')[0];
        }
    };
    
    parseDateString(document.querySelector('input[name="birthday"]'));
    parseDateString(document.querySelector('input[name="deathday"]'));

    if (editBtn && editModal) {
        editBtn.addEventListener('click', () => {
            editModal.classList.remove('pc-modal-hidden');
            editOverlay.classList.remove('pc-modal-hidden');
            document.body.classList.add('c-modal-open');
            document.documentElement.classList.add('c-modal-open');
        });

        const closeEditModal = () => {
            editModal.classList.add('pc-modal-hidden');
            editOverlay.classList.add('pc-modal-hidden');
            document.body.classList.remove('c-modal-open');
            document.documentElement.classList.remove('c-modal-open');
        };

        editCloseIcons.forEach(icon => {
            if (icon) icon.addEventListener('click', closeEditModal);
        });

        // Handle image upload preview
        const cpInput = document.getElementById('edit-person-cover-input');
        const cpPreview = document.getElementById('edit-person-cover-preview');
        const cpContainer = document.getElementById('edit-person-cover-container');

        if (cpInput && cpPreview && cpContainer) {
            cpInput.addEventListener('change', function() {
                if (this.files && this.files[0]) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        cpPreview.src = e.target.result;
                        cpContainer.classList.add('has-image');
                    };
                    reader.readAsDataURL(this.files[0]);
                }
            });
        }

        // Form Submission
        if (editForm) {
            editForm.addEventListener('submit', function(e) {
                e.preventDefault();
                const formData = new FormData(editForm);
                
                fetch('/api/edit_custom_person/', {
                    method: 'POST',
                    headers: {
                        'X-CSRFToken': getCookie('csrftoken')
                    },
                    body: formData
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        sessionStorage.setItem('personRefreshSuccess', '1');
                        location.reload();
                    } else {
                        showNotification("Failed to edit person: " + data.error, "warning");
                    }
                })
                .catch(err => {
                    console.error(err);
                    showNotification("Error saving person.", "warning");
                });
            });
        }
    }
});