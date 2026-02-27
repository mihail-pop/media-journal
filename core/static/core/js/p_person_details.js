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

document.addEventListener('DOMContentLoaded', function() {
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
            refreshBtn.style.display = checkbox.checked ? 'flex' : 'none';
        }
        
        // Initial check after favorite status is loaded
        setTimeout(updateRefreshButton, 100);
        
        // Show/hide refresh button based on favorite status
        checkbox.addEventListener('change', updateRefreshButton);
        
        refreshBtn.addEventListener('click', function() {
            const personId = favForm.dataset.personId;
            const personType = favForm.dataset.personType;
            if (!personId || !personType) return;
            
            refreshBtn.disabled = true;
            refreshBtn.style.opacity = '0.5';
            
            fetch('/api/refresh_favorite_person/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken'),
                },
                body: JSON.stringify({ person_id: personId, person_type: personType }),
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    location.reload();
                } else {
                    refreshBtn.disabled = false;
                    refreshBtn.style.opacity = '1';
                }
            })
            .catch(() => {
                refreshBtn.disabled = false;
                refreshBtn.style.opacity = '1';
            });
        });
    }
    
    // Upload person image
    const uploadBtn = document.getElementById('upload-person-image-btn');
    if (uploadBtn) {
        const favForm = document.getElementById('favorite-form');
        const checkbox = favForm.querySelector('input[name="favorite"]');
        
        // Show/hide upload button based on favorite status
        function updateUploadButton() {
            uploadBtn.style.display = checkbox.checked ? 'flex' : 'none';
        }
        
        setTimeout(updateUploadButton, 100);
        checkbox.addEventListener('change', updateUploadButton);
        
        uploadBtn.addEventListener('click', function() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.jpg,.jpeg,.png,.webp,.gif';
            input.style.display = 'none';
            
            input.onchange = () => {
                const file = input.files[0];
                if (!file) return;
                
                const personId = favForm.dataset.personId;
                const personType = favForm.dataset.personType;
                
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
                        location.reload();
                    } else {
                        alert(data.error || 'Failed to upload image.');
                    }
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
});