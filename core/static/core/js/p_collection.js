document.addEventListener("DOMContentLoaded", () => {

    let currentSort = "custom";
    let currentSortOrder = "desc";
    const ratingMode = document.body.dataset.ratingMode || 'faces';

    // Pagination states for the main grid
    let currentPage = 1;
    let hasMore = true;
    let isLoading = false;

    window.openEditModal = function(element) {
        const itemId = element.dataset.id;
        const coverUrl = element.dataset.coverUrl;
        const bannerUrl = element.dataset.bannerUrl;
        const mediaType = element.dataset.mediaType; 
        const title = element.dataset.title;

        const modal = document.getElementById('edit-modal');
        const cover = modal.querySelector('.modal-cover img');
        const titleElement = modal.querySelector('.modal-title');
        const overlay = document.getElementById('edit-overlay');

        if (titleElement && title) titleElement.textContent = title;
        
        if (cover && coverUrl) {
            cover.src = coverUrl;
            cover.setAttribute('data-media-type', mediaType || '');
        }

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

    window.replaceHistoryItem = function(updatedItem) {
        loadCollectionItems(1, true); // Refresh from start
    };

    const colId = window.COLLECTION_ID;
    const grid = document.getElementById("card-view");
    const noItemsMsg = document.getElementById("no-items-message");

    const reorderBtn = document.getElementById("toggle-reorder-btn");
    const deleteBtn = document.getElementById("toggle-delete-btn");
    const addBtn = document.getElementById("add-items-btn");

    const floatingBar = document.getElementById("floating-delete-bar");
    const delCountText = document.getElementById("delete-count-text");
    const confirmDeleteBtn = document.getElementById("confirm-delete-btn");
    const cancelDeleteBtn = document.getElementById("cancel-delete-btn");

    const addModal = document.getElementById("add-modal-overlay");
    const closeAddModal = document.querySelector(".close-add-modal");
    const searchInput = document.getElementById("add-search-input");
    const typeFilters = document.querySelectorAll(".type-filters .filter-btn");
    const addGrid = document.getElementById("add-search-results");
    const addCountText = document.getElementById("add-count-text");
    const confirmAddBtn = document.getElementById("confirm-add-btn");

    let collectionItems = [];
    let isReorderMode = false;
    let isDeleteMode = false;
    
    let addCurrentPage = 1;
    let addHasMore = true;
    let addIsLoading = false;
    
    let selectedForAdd = new Set();
    let selectedForDelete = new Set();
    
    let searchType = "all";
    let searchTimeout = null;

    // Load initial collection items
    loadCollectionItems(1, true);

    // Infinite scroll for main grid
    window.addEventListener('scroll', () => {
        if (isLoading || !hasMore) return;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        if (scrollTop + window.innerHeight >= document.documentElement.scrollHeight - 500) {
            loadCollectionItems(currentPage + 1);
        }
    });

    function getRatingHtml(rating) {
        if (!rating) return '';

        const rnum = Number(rating);
        if (isNaN(rnum)) return '';

        let normalized = rnum;
        if (ratingMode === 'stars_5') {
            normalized = (rnum > 0 && rnum <= 5) ? (rnum * 20) : rnum;
        } else if (ratingMode === 'scale_10') {
            normalized = rnum;
        }

        const rounded = Math.round(normalized);

        if (ratingMode === 'faces') {
            if (rounded <= 33) return '<svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="frown" class="svg-inline--fa fa-frown fa-w-16 fa-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512" style="width: 1.2em; height: 1.2em; color: grey;"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160-64c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32zm-80 128c-40.2 0-78 17.7-103.8 48.6-8.5 10.2-7.1 25.3 3.1 33.8 10.2 8.4 25.3 7.1 33.8-3.1 16.6-19.9 41-31.4 66.9-31.4s50.3 11.4 66.9 31.4c8.1 9.7 23.1 11.9 33.8 3.1 10.2-8.5 11.5-23.6 3.1-33.8C326 321.7 288.2 304 248 304z"></path></svg>';
            else if (rounded <= 66) return '<svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="meh" class="svg-inline--fa fa-meh fa-w-16 fa-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512" style="width: 1.2em; height: 1.2em; color: grey;"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160-64c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32zm8 144H160c-13.2 0-24 10.8-24 24s10.8 24 24 24h176c13.2 0 24-10.8 24-24s-10.8-24-24-24z"></path></svg>';
            else return '<svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="smile" class="svg-inline--fa fa-smile fa-w-16 fa-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512" style="width: 1.2em; height: 1.2em; color: grey;"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm4 72.6c-20.8 25-51.5 39.4-84 39.4s-63.2-14.3-84-39.4c-8.5-10.2-23.7-11.5-33.8-3.1-10.2 8.5-11.5 23.6-3.1 33.8 30 36 74.1 56.6 120.9 56.6s90.9-20.6 120.9-56.6c8.5-10.2 7.1-25.3-3.1-33.8-10.1-8.4-25.3-7.1-33.8 3.1z"></path></svg>';
        } else if (ratingMode === 'stars_5') {
            let starsCount = (rnum > 0 && rnum <= 5) ? Math.round(rnum) : Math.round(normalized / 20);
            let starsHtml = '<span style="display:inline-block; height:1.1em; line-height:1;">';
            for (let i = 1; i <= 5; i++) {
                if (i <= starsCount) starsHtml += '<svg viewBox="0 0 32 32" style="color:gold; width:1.1em; height:1.1em; margin-left:-0.25em; vertical-align:middle; z-index:1; position:relative;"><path fill="currentColor" stroke="#000" stroke-width="1.2" d="M16 2.5l4.09 8.29 9.16 1.33-6.62 6.45 1.56 9.09L16 23.13l-8.19 4.32 1.56-9.09-6.62-6.45 9.16-1.33L16 2.5z"/></svg>';
                else starsHtml += '<svg viewBox="0 0 32 32" style="color:#444; opacity:0.4; width:1.1em; height:1.1em; margin-left:-0.25em; vertical-align:middle; z-index:1; position:relative;"><path fill="currentColor" stroke="#000" stroke-width="1.2" d="M16 2.5l4.09 8.29 9.16 1.33-6.62 6.45 1.56 9.09L16 23.13l-8.19 4.32 1.56-9.09-6.62-6.45 9.16-1.33L16 2.5z"/></svg>';
            }
            return starsHtml.replace('margin-left:-0.25em;', 'margin-left:0;') + '</span>';
        } else if (ratingMode === 'scale_10') {
            let displayVal = rnum;
            if (rnum > 10) displayVal = Math.round(rnum / 10);
            else displayVal = 1;
            return `<span style="font-size: 0.95rem; font-weight:bold;">${displayVal}</span>`;
        } else if (ratingMode === 'scale_100') {
            return `<span style="font-size: 0.95rem; font-weight:bold;">${Math.round(rnum)}</span>`;
        }
        return '';
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

        // --- Handle sort value display ---
        let sortValueHtml = "";
        if (!isAddModal && currentSort !== 'custom' && currentSort !== 'title') {
            let displayContent = "";
            if (currentSort === 'rating') {
                displayContent = getRatingHtml(item.personal_rating);
            } else if (currentSort === 'activity_date') {
                if (item.date_added) {
                    const dateObj = new Date(item.date_added);
                    displayContent = dateObj.getFullYear();
                }
            } else if (currentSort === 'release_date') {
                if (item.release_date) {
                    const dateObj = new Date(item.release_date);
                    displayContent = dateObj.getFullYear();
                }
            }
            if (displayContent) {
                sortValueHtml = `<div class="card-sort-value">${displayContent}</div>`;
            }
        }

        card.innerHTML = `
            <a href="${item.url || '#'}" class="card-link" ${isAddModal ? 'draggable="false"' : ''}>
                <div class="card-image">
                    <img src="${item.cover_url}" alt="${item.title}" loading="lazy" draggable="false">
                    ${sortValueHtml}
                    ${selectCircleHtml}
                    ${editBtnHtml}
                </div>
            </a>
            <div style="display: flex; flex-direction: column; justify-content: center;">
                <div class="card-title" title="${item.title}">${item.title}</div>
            </div>
        `;

        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('edit-card-btn')) {
                e.preventDefault();
                e.stopPropagation();
                if(window.openEditModal) window.openEditModal(card);
                return;
            }

            if (isAddModal || isDeleteMode || isReorderMode || e.target.classList.contains('select-circle')) {
                e.preventDefault();
            } else return;

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
            } else if (isDeleteMode) {
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

    async function loadCollectionItems(page = 1, reset = false) {
        if (isLoading || (!hasMore && !reset)) return;
        isLoading = true;

        if (reset) {
            currentPage = 1;
            hasMore = true;
            collectionItems = [];
            grid.innerHTML = "";
        } else {
            currentPage = page;
        }

        try {
            const res = await fetch(`/api/collection/${colId}/items/?page=${currentPage}&sort_by=${currentSort}&sort_order=${currentSortOrder}`);
            const data = await res.json();
            
            hasMore = data.has_more;
            const newItems = data.items || [];
            collectionItems = collectionItems.concat(newItems);
            
            newItems.forEach(item => {
                const card = createCardElement(item, false);
                
                if (isReorderMode) {
                    card.classList.add("draggable-mode");
                    card.setAttribute("draggable", "true");
                }
                
                if (isDeleteMode) {
                    const circle = document.createElement("div");
                    circle.className = "select-circle";
                    const imgContainer = card.querySelector('.card-image');
                    if (imgContainer) {
                        imgContainer.appendChild(circle);
                    } else {
                        card.prepend(circle);
                    }
                }
                
                grid.appendChild(card);
            });

            noItemsMsg.style.display = collectionItems.length === 0 ? "block" : "none";
        } catch (err) {
            console.error(err);
        } finally {
            isLoading = false;
        }
    }


    // =====================================
    // SORTING DROPDOWN LOGIC
    // =====================================
    const sortSelect = document.getElementById("sort-select");
    const sortOptions = document.querySelectorAll(".sort-option");
    const sortOrderBtn = document.getElementById("sort-order-btn");

    function updateSortUI() {
        const activeOption = document.querySelector(`.sort-option[data-sort="${currentSort}"]`);
        if (activeOption) {
            sortSelect.textContent = activeOption.textContent;
            sortSelect.dataset.value = currentSort;
        }

        sortOptions.forEach(opt => opt.classList.toggle('active', opt.dataset.sort === currentSort));

        if (currentSort === 'custom') {
            sortOrderBtn.style.display = 'none';
        } else {
            sortOrderBtn.style.display = 'block';
            sortOrderBtn.dataset.order = currentSortOrder;
            
            const label = currentSortOrder === 'asc' ? 'Sort ascending' : 'Sort descending';
            sortOrderBtn.setAttribute('aria-label', label);
            sortOrderBtn.title = label;
        }
    }

    if (sortSelect) {
        sortSelect.addEventListener("click", (e) => {
            e.stopPropagation();
            const optionsList = sortSelect.closest('.custom-select-wrapper')?.querySelector('.custom-options');
            const isOpen = optionsList?.classList.contains('open');
            optionsList.classList.toggle('open', !isOpen);
            sortSelect.setAttribute('aria-expanded', !isOpen ? 'true' : 'false');
        });
    }

    sortOptions.forEach(option => {
        option.addEventListener("click", (e) => {
            e.stopPropagation();
            const selectedSort = option.dataset.sort;
            
            if (currentSort === selectedSort) {
                if (currentSort !== 'custom') {
                    currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
                }
            } else {
                currentSort = selectedSort;
                if (currentSort === 'title') {
                    currentSortOrder = 'asc';
                } else if (currentSort !== 'custom') {
                    currentSortOrder = 'desc'; 
                }
            }

            const optionsList = sortSelect.closest('.custom-select-wrapper')?.querySelector('.custom-options');
            optionsList.classList.remove('open');
            sortSelect.setAttribute('aria-expanded', 'false');

            updateSortUI();
            loadCollectionItems(1, true);
        });
    });

    if (sortOrderBtn) {
        sortOrderBtn.addEventListener("click", () => {
            currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
            updateSortUI();
            loadCollectionItems(1, true);
        });
    }

    document.addEventListener("click", (e) => {
        if (!e.target.closest || !e.target.closest('.sort-controls')) {
            const optionsList = document.querySelector('.custom-select-wrapper .custom-options');
            if (optionsList) {
                optionsList.classList.remove('open');
                document.getElementById("sort-select")?.setAttribute('aria-expanded', 'false');
            }
        }
    });

    // =====================================
    // ADD ITEMS (MODAL & SEARCH) LOGIC
    // =====================================
    addBtn.addEventListener("click", () => {
        if (isReorderMode) toggleReorderMode();
        if (isDeleteMode) toggleDeleteMode();

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

    async function performLocalSearch(page = 1) {
        if (addIsLoading || (!addHasMore && page !== 1)) return;
        
        addIsLoading = true;
        addCurrentPage = page;
        const query = searchInput.value;
        
        if (page === 1) {
            addGrid.innerHTML = "";
            addHasMore = true;
        }
        
        try {
            const res = await fetch(`/api/collection/${colId}/search-local/?q=${encodeURIComponent(query)}&type=${searchType}&page=${page}`);
            const data = await res.json();
            
            addHasMore = data.has_more;
            
            data.items.forEach(item => {
                addGrid.appendChild(createCardElement(item, true));
            });
        } catch (err) {
            console.error(err);
        } finally {
            addIsLoading = false;
        }
    }

    addGrid.addEventListener('scroll', () => {
        if (addIsLoading || !addHasMore) return;
        if (addGrid.scrollTop + addGrid.clientHeight >= addGrid.scrollHeight - 200) {
            performLocalSearch(addCurrentPage + 1);
        }
    });

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
            loadCollectionItems(1, true); 
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
        if (isReorderMode) toggleReorderMode();

        isDeleteMode = !isDeleteMode;
        selectedForDelete.clear();
        updateDeleteCount();

        if (isDeleteMode) {
            document.body.classList.add('delete-mode');
            deleteBtn.classList.add("active-state");
            floatingBar.classList.remove("hidden");
            
            document.querySelectorAll("#card-view .card").forEach(card => {
                const circle = document.createElement("div");
                circle.className = "select-circle";
                const imgContainer = card.querySelector('.card-image');
                
                if (imgContainer) {
                    imgContainer.appendChild(circle);
                } else {
                    card.prepend(circle);
                }
            });
        } else {
            document.body.classList.remove('delete-mode');
            deleteBtn.classList.remove("active-state");
            floatingBar.classList.add("hidden");
            
            document.querySelectorAll("#card-view .select-circle").forEach(el => el.remove());
        }
    }

    function updateDeleteCount() {
        delCountText.textContent = `${selectedForDelete.size} items selected`;
    }

    confirmDeleteBtn.addEventListener("click", async () => {
        if (selectedForDelete.size === 0) return;

        try {
            await fetch(`/api/collection/${colId}/remove/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") },
                body: JSON.stringify({ item_ids: Array.from(selectedForDelete) })
            });
            
            toggleDeleteMode();
            loadCollectionItems(1, true);
        } catch(err) {
            console.error(err);
        }
    });

    // =====================================
    // REORDER LOGIC
    // =====================================
    reorderBtn.addEventListener("click", toggleReorderMode);

    async function toggleReorderMode() {
        if (isDeleteMode) toggleDeleteMode();

        let needsReload = false;
        if (!isReorderMode && currentSort !== 'custom') {
            currentSort = 'custom';
            updateSortUI();
            needsReload = true;
        }

        isReorderMode = !isReorderMode;
        
        if (needsReload) {
            await loadCollectionItems(1, true);
        }

        if (isReorderMode) {
            document.body.classList.add('reorder-mode');
            reorderBtn.classList.add("active-state");
        } else {
            document.body.classList.remove('reorder-mode');
            reorderBtn.classList.remove("active-state");
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
        
        // Disable native drag on touch screens
        if (window.matchMedia('(pointer: coarse)').matches) {
            e.preventDefault();
            return;
        }

        document.body.classList.add('drag-active');
        
        draggedEl = e.target.closest('.card');
        if (draggedEl) {
            if (e.dataTransfer) {
                const rect = draggedEl.getBoundingClientRect();
                e.dataTransfer.setDragImage(draggedEl, rect.width / 2, rect.height / 2);
            }
            setTimeout(() => draggedEl.classList.add('dragging'), 0);
        }
    });

    grid.addEventListener('dragend', () => {
        document.body.classList.remove('drag-active');
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

        return draggables.find(child => {
            const box = child.getBoundingClientRect();
            if (y < box.top) return true;
            if (y > box.bottom) return false;
            if (x < box.left + box.width / 2) return true;
            
            return false;
        });
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