document.addEventListener("DOMContentLoaded", () => {

window.openEditModal = function(element) {
        const itemId = element.dataset.id;
        const coverUrl = element.dataset.coverUrl;
        const bannerUrl = element.dataset.bannerUrl;
        const mediaType = element.dataset.mediaType; // Grab media type for styling
        const title = element.dataset.title;

        const modal = document.getElementById('edit-modal');
        const cover = modal.querySelector('.modal-cover img');
        const titleElement = modal.querySelector('.modal-title');
        const overlay = document.getElementById('edit-overlay');

        if (titleElement && title) titleElement.textContent = title;
        
        if (cover && coverUrl) {
            cover.src = coverUrl;
            // Pass the media type to the cover image for specific CSS cropping
            cover.setAttribute('data-media-type', mediaType || '');
        }

        // Call your global banner builder from g_edit_modal.js!
        // This instantly fixes the alt attribute, adds the overlay, and applies the CSS classes.
        if (window.setModalBanner) {
            window.setModalBanner(bannerUrl, mediaType);
        }

        const form = document.getElementById("edit-form");
        if (!form) return console.error("Edit form not found");

        fetch(`/get-item/${itemId}/?_t=${Date.now()}`)
            .then(res => res.json())
            .then(data => {
                if (!data.success) return alert("Failed to load item");
                if (window.populateEditForm) window.populateEditForm(form, data.item);
                modal.classList.remove("modal-hidden");
                overlay.classList.remove("modal-hidden");
            })
            .catch(err => {
                console.error("Fetch error:", err);
                alert("Failed to load item");
            });
    };

    // Fired by g_edit_modal.js after a successful save
    window.replaceHistoryItem = function(updatedItem) {
        loadCollectionItems(); // Simply refresh the grid
    };

    const colId = window.COLLECTION_ID;
    const grid = document.getElementById("card-view");
    const loadingInd = document.getElementById("loading-indicator");
    const noItemsMsg = document.getElementById("no-items-message");

    // Top Buttons
    const reorderBtn = document.getElementById("toggle-reorder-btn");
    const deleteBtn = document.getElementById("toggle-delete-btn");
    const addBtn = document.getElementById("add-items-btn");

    // Floating Delete Bar
    const floatingBar = document.getElementById("floating-delete-bar");
    const delCountText = document.getElementById("delete-count-text");
    const confirmDeleteBtn = document.getElementById("confirm-delete-btn");
    const cancelDeleteBtn = document.getElementById("cancel-delete-btn");

    // Add Modal Elements
    const addModal = document.getElementById("add-modal-overlay");
    const closeAddModal = document.querySelector(".close-add-modal");
    const searchInput = document.getElementById("add-search-input");
    const typeFilters = document.querySelectorAll(".type-filters .filter-btn");
    const addGrid = document.getElementById("add-search-results");
    const addCountText = document.getElementById("add-count-text");
    const confirmAddBtn = document.getElementById("confirm-add-btn");

    // States
    let collectionItems =[];
    let isReorderMode = false;
    let isDeleteMode = false;
    
    // Sets to keep track of multi-selection across searches
    let selectedForAdd = new Set();
    let selectedForDelete = new Set();
    
    let searchType = "all";
    let searchTimeout = null;

    // Load initial collection items
    loadCollectionItems();

    async function loadCollectionItems() {
        loadingInd.style.display = "block";
        grid.innerHTML = "";
        
        try {
            const res = await fetch(`/api/collection/${colId}/items/`);
            const data = await res.json();
            collectionItems = data.items ||[];
            
            collectionItems.forEach(item => {
                grid.appendChild(createCardElement(item, false));
            });

            noItemsMsg.style.display = collectionItems.length === 0 ? "block" : "none";
        } catch (err) {
            console.error(err);
        } finally {
            loadingInd.style.display = "none";
        }
    }

function createCardElement(item, isAddModal = false) {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.id = item.id;
        card.dataset.mediaType = item.media_type;
        card.dataset.title = item.title;
        card.dataset.coverUrl = item.cover_url;
        card.dataset.bannerUrl = item.banner_url || '';
        
        let selectCircleHtml = "";
        let editBtnHtml = "";
        
        if (isAddModal) {
            const isSelected = selectedForAdd.has(String(item.id));
            selectCircleHtml = `<div class="select-circle ${isSelected ? 'selected' : ''}"></div>`;
        } else {
            editBtnHtml = `<button class="edit-card-btn">⋯</button>`;
        }

        // We wrap the image/title in an <a> tag using display: contents to maintain the grid styling
        card.innerHTML = `
            ${selectCircleHtml}
            <a href="${item.url || '#'}" class="card-link" style="display: contents; color: inherit; text-decoration: none;">
                <div class="card-image">
                    <img src="${item.cover_url}" alt="${item.title}" loading="lazy">
                </div>
                <div class="card-title-overlay">
                    <span class="card-title">${item.title}</span>
                </div>
            </a>
            ${editBtnHtml}
        `;

        // Card Click Logic
        card.addEventListener('click', (e) => {
            // 1. Edit button bypasses everything
            if (e.target.classList.contains('edit-card-btn')) {
                e.preventDefault();
                e.stopPropagation();
                if(window.openEditModal) window.openEditModal(card);
                return;
            }

            // 2. Prevent navigation if we are selecting items or reordering
            if (isAddModal || isDeleteMode || isReorderMode || e.target.classList.contains('select-circle')) {
                e.preventDefault();
            } else {
                // Allow the <a> tag to act like a normal link!
                return;
            }

            // Logic for Add Modal Selection
            if (isAddModal) {
                const idStr = String(item.id);
                const circle = card.querySelector('.select-circle');
                if (selectedForAdd.has(idStr)) {
                    selectedForAdd.delete(idStr);
                    circle.classList.remove('selected');
                } else {
                    selectedForAdd.add(idStr);
                    circle.classList.add('selected');
                }
                updateAddCount();
            } 
            // Logic for Delete Mode Selection
            else if (isDeleteMode) {
                const idStr = String(item.id);
                const circle = card.querySelector('.select-circle');
                if (selectedForDelete.has(idStr)) {
                    selectedForDelete.delete(idStr);
                    circle.classList.remove('selected');
                } else {
                    selectedForDelete.add(idStr);
                    circle.classList.add('selected');
                }
                updateDeleteCount();
            }
        });
        
        return card;
    }

    // =====================================
    // ADD ITEMS (MODAL & SEARCH) LOGIC
    // =====================================
    addBtn.addEventListener("click", () => {
        addModal.classList.remove("modal-hidden");
        selectedForAdd.clear();
        updateAddCount();
        searchInput.value = "";
        performLocalSearch();
    });

    closeAddModal.addEventListener("click", () => addModal.classList.add("modal-hidden"));

    typeFilters.forEach(btn => {
        btn.addEventListener("click", (e) => {
            typeFilters.forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            searchType = e.target.dataset.type;
            performLocalSearch();
        });
    });

    searchInput.addEventListener("input", () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(performLocalSearch, 300);
    });

    async function performLocalSearch() {
        const query = searchInput.value;
        addGrid.innerHTML = "";
        document.getElementById("add-loading").style.display = "block";
        
        try {
            const res = await fetch(`/api/collection/${colId}/search-local/?q=${encodeURIComponent(query)}&type=${searchType}`);
            const data = await res.json();
            
            addGrid.innerHTML = "";
            data.items.forEach(item => {
                addGrid.appendChild(createCardElement(item, true));
            });
        } catch (err) {
            console.error(err);
        } finally {
            document.getElementById("add-loading").style.display = "none";
        }
    }

    function updateAddCount() {
        addCountText.textContent = `${selectedForAdd.size} selected`;
    }

    confirmAddBtn.addEventListener("click", async () => {
        if (selectedForAdd.size === 0) return;
        
        try {
            await fetch(`/api/collection/${colId}/add/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") },
                body: JSON.stringify({ item_ids: Array.from(selectedForAdd) })
            });
            
            addModal.classList.add("modal-hidden");
            loadCollectionItems(); // refresh main grid
        } catch (err) {
            console.error(err);
        }
    });

    // =====================================
    // DELETE MODE LOGIC
    // =====================================
    deleteBtn.addEventListener("click", toggleDeleteMode);
    cancelDeleteBtn.addEventListener("click", () => {
        if(isDeleteMode) toggleDeleteMode();
    });

    function toggleDeleteMode() {
        if (isReorderMode) toggleReorderMode(); // mutually exclusive

        isDeleteMode = !isDeleteMode;
        selectedForDelete.clear();
        updateDeleteCount();

        if (isDeleteMode) {
            document.body.classList.add('delete-mode');
            deleteBtn.classList.add("active-state");
            floatingBar.classList.remove("hidden");
            
            // Add circles to all main grid cards
            document.querySelectorAll("#card-view .card").forEach(card => {
                const circle = document.createElement("div");
                circle.className = "select-circle";
                card.prepend(circle);
            });
        } else {
            document.body.classList.remove('delete-mode');
            deleteBtn.classList.remove("active-state");
            floatingBar.classList.add("hidden");
            
            // Remove circles
            document.querySelectorAll("#card-view .select-circle").forEach(el => el.remove());
        }
    }

    function updateDeleteCount() {
        delCountText.textContent = `${selectedForDelete.size} items selected`;
    }

    confirmDeleteBtn.addEventListener("click", async () => {
        if (selectedForDelete.size === 0) return;
        if (!confirm(`Remove ${selectedForDelete.size} items from this collection?`)) return;

        try {
            await fetch(`/api/collection/${colId}/remove/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") },
                body: JSON.stringify({ item_ids: Array.from(selectedForDelete) })
            });
            
            toggleDeleteMode();
            loadCollectionItems();
        } catch(err) {
            console.error(err);
        }
    });

    // =====================================
    // REORDER LOGIC
    // =====================================
    reorderBtn.addEventListener("click", toggleReorderMode);

    function toggleReorderMode() {
        if (isDeleteMode) toggleDeleteMode();

        isReorderMode = !isReorderMode;
        if (isReorderMode) {
            document.body.classList.add('reorder-mode');
            reorderBtn.classList.add("active-state");
            reorderBtn.textContent = "Reorder: ON";
        } else {
            document.body.classList.remove('reorder-mode');
            reorderBtn.classList.remove("active-state");
            reorderBtn.textContent = "Reorder";
        }

        document.querySelectorAll("#card-view .card").forEach(card => {
            if (isReorderMode) {
                card.classList.add("draggable-mode");
                card.setAttribute("draggable", "true");
            } else {
                card.classList.remove("draggable-mode");
                card.removeAttribute("draggable");
            }
        });
    }

    let draggedEl = null;

    grid.addEventListener('dragstart', (e) => {
        if (!isReorderMode) return;
        draggedEl = e.target.closest('.card');
        setTimeout(() => draggedEl.classList.add('dragging'), 0);
    });

    grid.addEventListener('dragend', () => {
        if (!draggedEl) return;
        draggedEl.classList.remove('dragging');
        draggedEl = null;
        saveReorder();
    });

    grid.addEventListener('dragover', (e) => {
        if (!isReorderMode || !draggedEl) return;
        e.preventDefault();
        
        const afterEl = getDragAfterElement(grid, e.clientX, e.clientY);
        if (afterEl == null) {
            grid.appendChild(draggedEl);
        } else {
            grid.insertBefore(draggedEl, afterEl);
        }
    });

    function getDragAfterElement(container, x, y) {
        const draggables = [...container.querySelectorAll('.card:not(.dragging)')];
        return draggables.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offsetX = x - box.left - box.width / 2;
            const offsetY = y - box.top - box.height / 2;
            const dist = Math.sqrt(offsetX*offsetX + offsetY*offsetY);
            
            if (offsetY < 0 && dist < closest.distance) {
                return { offset: dist, element: child, distance: dist };
            } else {
                return closest;
            }
        }, { distance: Number.POSITIVE_INFINITY }).element;
    }

    async function saveReorder() {
        const order = [...grid.querySelectorAll(".card")].map(c => parseInt(c.dataset.id));
        
        try {
            await fetch(`/api/collection/${colId}/reorder/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") },
                body: JSON.stringify({ order })
            });
        } catch (err) {
            console.error(err);
        }
    }

    // Utility for CSRF token
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
});