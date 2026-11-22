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
    
    // Resolve favorite state before allowing any destructive action.
    const favForm = document.getElementById('favorite-form');
    let favoriteStatusReady = false;
    let favoriteSaving = false;

    function updateFavoriteControls() {
        updateAssignmentVisibility();
        if (typeof updateRefreshButton === 'function') updateRefreshButton();
        if (typeof updateUploadButton === 'function') updateUploadButton();
        const refresh = document.getElementById('refresh-person-btn');
        const upload = document.getElementById('upload-person-image-btn');
        const edit = document.getElementById('edit-person-btn');
        if (refresh) refresh.disabled = favoriteSaving || isRefreshing;
        if (upload) upload.disabled = favoriteSaving || isUploading;
        if (edit) edit.disabled = favoriteSaving;
    }

    if (favForm) {
        const personName = favForm.dataset.personName;
        const personType = favForm.dataset.personType;
        const checkbox = favForm.querySelector('input[name="favorite"]');
        checkbox.disabled = true;
        fetch(`/api/check_favorite_person/?name=${encodeURIComponent(personName)}&type=${personType}&person_id=${encodeURIComponent(favForm.dataset.personId || '')}&source=${encodeURIComponent(favForm.dataset.personSource)}`)
            .then(async response => {
                const result = await response.json();
                if (!response.ok || typeof result.is_favorited !== 'boolean') throw new Error('Unable to check favorite status. Reload the page to try again.');
                checkbox.checked = result.is_favorited;
                favoriteStatusReady = true;
                checkbox.disabled = false;
                updateFavoriteControls();
                favForm.parentElement.classList.add('loaded');
            })
            .catch(error => {
                favoriteStatusReady = false;
                updateFavoriteControls();
                favForm.parentElement.classList.add('loaded');
                showNotification(error.message, 'warning');
            });

        async function saveFavorite(enabled) {
            const response = await fetch('/api/toggle_favorite_person/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
                body: JSON.stringify({
                    name: personName, image_url: favForm.dataset.personImage, type: personType,
                    source: favForm.dataset.personSource, person_id: favForm.dataset.personId,
                    favorite: enabled,
                }),
            });
            const data = await response.json();
            if (!response.ok || data.status !== (enabled ? 'added' : 'removed')) throw new Error(data.error || 'Unable to update this favorite. Please try again.');
            checkbox.checked = data.status === 'added';
            favoriteStatusReady = true;
        }

        checkbox.addEventListener('change', async () => {
            if (!favoriteStatusReady || favoriteSaving) return;
            const enabled = checkbox.checked;
            // Keep the heart selected until deletion is explicitly confirmed and succeeds.
            checkbox.checked = !enabled;
            favoriteSaving = true;
            checkbox.disabled = true;
            updateFavoriteControls();
            try {
                if (enabled) {
                    await saveFavorite(true);
                } else if (await window.confirmPersonRemoval(personType, () => saveFavorite(false))) {
                    if (favForm.dataset.personSource === 'custom' || String(favForm.dataset.personId).startsWith('custom_')) {
                        window.location.assign(`/favorites/?section=${personType === 'character' ? 'Characters' : 'People'}`);
                    } else {
                        // Clear the deleted local assignments while keeping the API person open.
                        location.reload();
                    }
                }
            } catch (error) {
                showNotification(error.message || 'Unable to update this favorite.', 'warning');
            } finally {
                favoriteSaving = false;
                checkbox.disabled = !favoriteStatusReady;
                updateFavoriteControls();
            }
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
                body: JSON.stringify({ person_id: personId, person_type: personType, source: favForm.dataset.personSource, refresh_mode: mode }),
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
                formData.append('source', favForm.dataset.personSource);
                
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
            window.modalScrollLock.lock('edit-person');
        });

        const closeEditModal = () => {
            editModal.classList.add('pc-modal-hidden');
            editOverlay.classList.add('pc-modal-hidden');
            window.modalScrollLock.unlock('edit-person');
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

    // -----------------------------------------
    // Assign Media & Edit Role Logic
    // -----------------------------------------
    
    const firstSectionHeader = document.querySelector('.main-colored-section .section-title-wrapper');
    const assignContainer = document.getElementById('assign-media-container');
    const assignWrapper = document.getElementById('assign-search-wrapper');
    const showAssignBtn = document.getElementById('show-assign-search-btn');
    const assignInput = document.getElementById('assign-search-input');
    const assignDropdown = document.getElementById('assign-dropdown');
    const assignTagsContainer = document.getElementById('assign-tags');
    const confirmAssignBtn = document.getElementById('confirm-assign-btn');
    const cancelAssignBtn = document.getElementById('cancel-assign-btn');
    const selectedMediaIds = new Map();
    let searchTimeout = null;
    let searchController = null;
    let assignmentOpen = false;
    let assignmentSaving = false;

    if (firstSectionHeader && assignContainer) firstSectionHeader.appendChild(assignContainer);

    function canAssignMedia() {
        return favoriteStatusReady && !favoriteSaving && !!favForm?.querySelector('input[name="favorite"]')?.checked;
    }

    function cancelAssignmentSearch() {
        clearTimeout(searchTimeout);
        searchController?.abort();
        searchController = null;
        assignDropdown.style.display = 'none';
    }

    function updateAssignmentVisibility() {
        if (!assignContainer || !assignWrapper || !showAssignBtn) return;
        const available = canAssignMedia();
        assignContainer.style.display = available ? 'flex' : 'none';
        assignWrapper.style.display = available && assignmentOpen ? 'flex' : 'none';
        showAssignBtn.style.display = available && !assignmentOpen ? 'flex' : 'none';
        showAssignBtn.disabled = assignmentSaving;
        assignInput.disabled = assignmentSaving;
        cancelAssignBtn.disabled = assignmentSaving;
        confirmAssignBtn.disabled = assignmentSaving || selectedMediaIds.size === 0;
        if (!available) cancelAssignmentSearch();
    }
    updateAssignmentVisibility();

    function renderAssignTags() {
        assignTagsContainer.replaceChildren();
        selectedMediaIds.forEach((title, id) => {
            const tag = document.createElement('div');
            tag.className = 'assign-tag';
            tag.appendChild(document.createTextNode(title));
            const remove = document.createElement('span');
            remove.textContent = '✕';
            remove.title = 'Remove selection';
            remove.addEventListener('click', event => {
                event.stopPropagation();
                if (assignmentSaving) return;
                selectedMediaIds.delete(id);
                renderAssignTags();
                const result = assignDropdown.querySelector(`[data-item-id="${id}"]`);
                result?.classList.remove('selected');
                result?.querySelector('.selected-x')?.remove();
            });
            tag.appendChild(remove);
            assignTagsContainer.appendChild(tag);
        });
        confirmAssignBtn.disabled = assignmentSaving || selectedMediaIds.size === 0;
    }

    if (showAssignBtn) {
        showAssignBtn.addEventListener('click', () => {
            if (!canAssignMedia() || assignmentSaving) return;
            assignmentOpen = true;
            updateAssignmentVisibility();
            assignInput.focus();
        });
        cancelAssignBtn.addEventListener('click', () => {
            if (assignmentSaving) return;
            assignmentOpen = false;
            cancelAssignmentSearch();
            assignInput.value = '';
            selectedMediaIds.clear();
            renderAssignTags();
            updateAssignmentVisibility();
            showAssignBtn.focus({ preventScroll: true });
        });

        assignInput.addEventListener('input', () => {
            cancelAssignmentSearch();
            const query = assignInput.value.trim();
            if (!query || !canAssignMedia() || !assignmentOpen) return;
            const controller = new AbortController();
            searchController = controller;
            searchTimeout = setTimeout(async () => {
                try {
                    const params = new URLSearchParams({ q: query, person_id: favForm.dataset.personId,
                        person_type: favForm.dataset.personType, source: favForm.dataset.personSource });
                    const response = await fetch(`/api/person/search_media/?${params}`, { signal: controller.signal });
                    const data = await response.json();
                    if (!response.ok || !Array.isArray(data.results)) throw new Error(data.error || 'Unable to search your library.');
                    if (searchController !== controller || !assignmentOpen || !canAssignMedia()) return;
                    assignDropdown.replaceChildren();
                    if (!data.results.length) {
                        const empty = document.createElement('div');
                        empty.className = 'assign-search-item';
                        empty.style.justifyContent = 'center';
                        empty.style.cursor = 'default';
                        empty.textContent = 'No results found in library.';
                        assignDropdown.appendChild(empty);
                    }
                    data.results.forEach(item => {
                        const result = document.createElement('div');
                        result.dataset.itemId = item.id;
                        result.dataset.mediaType = item.media_type;
                        const coverFrame = document.createElement('span');
                        coverFrame.className = 'assign-search-cover';
                        const cover = document.createElement('img');
                        cover.src = item.cover;
                        cover.alt = 'Cover';
                        coverFrame.appendChild(cover);
                        const text = document.createElement('div');
                        text.style.flex = '1';
                        const title = document.createElement('div');
                        title.style.fontWeight = '600';
                        title.textContent = item.title;
                        const subtitle = document.createElement('div');
                        subtitle.style.fontSize = '0.8em';
                        subtitle.style.color = 'var(--text-secondary)';
                        subtitle.textContent = `${item.type}${item.year ? ' • ' + item.year : ''}`;
                        text.append(title, subtitle);
                        result.append(coverFrame, text);
                        function updateSelection() {
                            result.className = `assign-search-item${selectedMediaIds.has(item.id) ? ' selected' : ''}`;
                            result.querySelector('.selected-x')?.remove();
                            if (selectedMediaIds.has(item.id)) {
                                const selected = document.createElement('span');
                                selected.className = 'selected-x';
                                selected.textContent = '✕';
                                result.appendChild(selected);
                            }
                        }
                        updateSelection();
                        result.addEventListener('click', event => {
                            event.stopPropagation();
                            if (assignmentSaving) return;
                            if (selectedMediaIds.has(item.id)) selectedMediaIds.delete(item.id);
                            else selectedMediaIds.set(item.id, item.title);
                            renderAssignTags();
                            updateSelection();
                            assignInput.focus();
                        });
                        assignDropdown.appendChild(result);
                    });
                    assignDropdown.style.display = 'block';
                } catch (error) {
                    if (error.name !== 'AbortError' && searchController === controller) showNotification(error.message, 'warning');
                }
            }, 300);
        });
        assignInput.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                cancelAssignBtn.click();
            } else if (event.key === 'Enter' && selectedMediaIds.size) {
                event.preventDefault();
                confirmAssignBtn.click();
            }
        });
        document.addEventListener('click', event => {
            if (!assignWrapper.contains(event.target)) cancelAssignmentSearch();
        });

        confirmAssignBtn.addEventListener('click', async () => {
            if (!canAssignMedia() || !selectedMediaIds.size || assignmentSaving) return;
            assignmentSaving = true;
            cancelAssignmentSearch();
            updateAssignmentVisibility();
            let saved = false;
            try {
                const response = await fetch('/api/person/assign_media/', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
                    body: JSON.stringify({ person_id: favForm.dataset.personId, person_type: favForm.dataset.personType,
                        source: favForm.dataset.personSource, media_ids: Array.from(selectedMediaIds.keys()) }),
                });
                const data = await response.json();
                if (!response.ok || !data.success) throw new Error(data.error || 'Unable to assign media. Please try again.');
                saved = true;
                location.reload();
            } catch (error) {
                showNotification(error.message, 'warning');
            } finally {
                if (!saved) {
                    assignmentSaving = false;
                    updateAssignmentVisibility();
                }
            }
        });
    }

    // Handle Remove Action
    document.querySelectorAll('.remove-assign-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const linkId = btn.dataset.linkId;
            fetch('/api/person/remove_media/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
                body: JSON.stringify({ link_id: linkId })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) location.reload();
            });
        });
    });

    // Edit Role Modal Logic
    const roleModal = document.getElementById('edit-role-modal');
    const roleOverlay = document.getElementById('edit-role-overlay');
    const roleInput = document.getElementById('edit-role-input');
    const roleLinkIdInput = document.getElementById('edit-role-link-id');
    const saveRoleBtn = document.getElementById('save-role-btn');
    const closeRoleIcon = document.getElementById('close-role-modal-icon');

    function closeRoleModal() {
        roleModal.classList.add('pc-modal-hidden');
        roleOverlay.classList.add('pc-modal-hidden');
        window.modalScrollLock.unlock('edit-role');
    }

    document.querySelectorAll('.edit-role-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            roleLinkIdInput.value = btn.dataset.linkId;
            roleInput.value = btn.dataset.role;
            
            roleModal.classList.remove('pc-modal-hidden');
            roleOverlay.classList.remove('pc-modal-hidden');
            window.modalScrollLock.lock('edit-role');
            roleInput.focus();
        });
    });

    [closeRoleIcon, roleOverlay].forEach(el => {
        if(el) el.addEventListener('click', closeRoleModal);
    });

    if (saveRoleBtn) {
        saveRoleBtn.addEventListener('click', () => {
            fetch('/api/person/update_role/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
                body: JSON.stringify({ link_id: roleLinkIdInput.value, role: roleInput.value })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    sessionStorage.setItem('personRefreshSuccess', '1');
                    location.reload();
                } else {
                    showNotification(data.error, "warning");
                }
            });
        });
    }

});
