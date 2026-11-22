document.addEventListener("DOMContentLoaded", () => {
    const { request, notify, orderSaver, getCookie } = window.collectionUI;

    const grid = document.getElementById("collections-grid");
    const loadingIndicator = document.getElementById("loading-indicator");
    const noItemsMsg = document.getElementById("no-items-message");
    
    const sortBtn = document.getElementById("toggle-sort-btn");
    const createBtn = document.getElementById("create-collection-btn");
    
    // Modal Elements
    const modalOverlay = document.getElementById("collection-modal-overlay");
    const modalTitle = document.getElementById("modal-title");
    const form = document.getElementById("collection-form");
    const idInput = document.getElementById("col-id");
    const titleInput = document.getElementById("col-title");
    const descInput = document.getElementById("col-desc");
    const closeBtn = document.getElementById("close-modal-btn");
    const deleteBtn = document.getElementById("delete-col-btn");
    const deletePanel = document.getElementById('collection-delete-panel');
    const cancelDelete = document.getElementById('cancel-collection-delete');
    const confirmDelete = document.getElementById('confirm-collection-delete');
    const touchPointer = window.matchMedia('(pointer: coarse)');
    let modalBusy = false;
    let loadFailed = false;
    const reorderSave = orderSaver('/api/collections/reorder/', error => {
        isSortMode = false;
        sortBtn.classList.remove('active-sort');
        updateDraggableState();
        notify(error.message);
        loadCollections(1, { preserveLoaded: true });
    });
  
    // State
    let currentPage = 1;
    let isLoading = false;
    let hasMore = true;
    let allCollections =[];
    let isSortMode = false;
    const collectionSearch = document.getElementById('collections-search');
    let currentSearch = '';
    let searchPending = false;
    let searchTimer;
    let requestRevision = 0;
    let requestController = new AbortController();

    collectionSearch.addEventListener('input', () => {
        const query = collectionSearch.value.trim();
        if (query === currentSearch && !searchPending) return;
        clearTimeout(searchTimer);
        requestController.abort();
        requestRevision++;
        isLoading = false;
        currentSearch = query;
        searchPending = true;
        isSortMode = false;
        sortBtn.disabled = true;
        sortBtn.classList.remove('active-sort');
        document.body.classList.remove('drag-active');
        if (draggedElement) draggedElement.classList.remove('dragging');
        draggedElement = null;
        updateDraggableState();
        searchTimer = setTimeout(() => loadCollections(1), 300);
    });
  
    // Fetch initial data
    loadCollections(1);
  
    // ==========================================
    // API AND RENDERING
    // ==========================================
    async function loadCollections(page = 1, { preserveLoaded = false } = {}) {
        const lastPage = preserveLoaded ? currentPage : page;
        if (page === 1) {
            clearTimeout(searchTimer);
            requestController.abort();
            requestController = new AbortController();
            requestRevision++;
        } else if (isLoading || searchPending || !hasMore) return;
        const revision = requestRevision;
        isLoading = true;
        sortBtn.disabled = true;
        
        if (page !== 1) {
            loadingIndicator.style.display = 'block';
        }
        
        try {
            await reorderSave.flush();
            if (revision !== requestRevision) return;
            const newCollections = [];
            let data;
            for (let nextPage = page; nextPage <= lastPage; nextPage++) {
                const params = new URLSearchParams({ page: nextPage, search: currentSearch });
                data = await request(`/api/collections/?${params}`, { signal: requestController.signal });
                if (revision !== requestRevision) return;
                newCollections.push(...data.items);
                if (!data.has_more) break;
            }
            
            if (page === 1) {
                allCollections = newCollections;
            } else {
                allCollections = [...allCollections, ...newCollections];
            }
            
            hasMore = data.has_more;
            currentPage = data.page;
            
            if (page === 1) {
                const cards = new Map([...grid.children].map(card => [card.dataset.id, card]));
                const retained = new Set();
                newCollections.forEach((col, index) => {
                    const existing = cards.get(String(col.id));
                    const card = existing?.dataset.signature === JSON.stringify(col) ? existing : createCard(col);
                    retained.add(card);
                    const before = grid.children[index] || null;
                    if (card !== before) grid.insertBefore(card, before);
                });
                cards.forEach(card => { if (!retained.has(card)) card.remove(); });
            } else newCollections.forEach(col => grid.appendChild(createCard(col)));
            loadFailed = false;
            
            noItemsMsg.style.display = allCollections.length === 0 ? "block" : "none";
            updateDraggableState();
            
        } catch (error) {
            if (revision !== requestRevision || error.name === 'AbortError') return;
            console.error('Error loading collections:', error);
            loadFailed = true;
            isSortMode = false;
            sortBtn.classList.remove('active-sort');
            if (draggedElement) draggedElement.classList.remove('dragging');
            draggedElement = null;
            document.body.classList.remove('drag-active');
            updateDraggableState();
            notify(error.message);
        } finally {
            if (revision === requestRevision) {
                isLoading = false;
                searchPending = false;
                sortBtn.disabled = Boolean(currentSearch) || loadFailed;
                loadingIndicator.style.display = 'none';
            }
        }
    }
  
    function createCard(col) {
        const a = document.createElement("a");
        a.href = `/collection/${col.id}/`; 
        a.className = "collection-card";
        a.dataset.id = col.id;
        a.dataset.signature = JSON.stringify(col);
        
        a.innerHTML = `
            <button class="edit-col-btn" title="Edit Collection">⋯</button>
            <div class="cover-stack"></div>
            <div class="col-info">
                <h3 class="col-title"></h3>
                <p class="col-count"></p>
            </div>
        `;
        const stack = a.querySelector('.cover-stack');
        stack.classList.add(`items-${col.covers.length}`);
        col.covers.forEach((cover, index) => {
            const layer = document.createElement('div');
            layer.className = `stack-item pos-${index}`;
            layer.dataset.mediaType = cover.media_type;
            const image = document.createElement('img');
            image.src = cover.url;
            image.alt = 'cover';
            layer.appendChild(image);
            stack.appendChild(layer);
        });
        if (!col.covers.length) {
            const placeholder = document.createElement('div');
            placeholder.className = 'stack-item pos-0 glass-card';
            stack.appendChild(placeholder);
        }
        const title = a.querySelector('.col-title');
        title.textContent = col.title;
        title.title = col.title;
        a.querySelector('.col-count').textContent = `${col.item_count} item${col.item_count !== 1 ? 's' : ''}`;
  
        // Attach Edit Button listener
        const editBtn = a.querySelector('.edit-col-btn');
        editBtn.addEventListener('click', (e) => {
            e.preventDefault(); // Stop the link from opening the detail page
            e.stopPropagation();
            openModal(col);
        });
  
        return a;
    }
  
    // Infinite Scroll
    window.addEventListener('scroll', () => {
        if (isLoading || searchPending || isSortMode || (!hasMore && !loadFailed)) return;
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
            loadCollections(loadFailed ? 1 : currentPage + 1);
        }
    });
  
    // ==========================================
    // MODAL LOGIC
    // ==========================================
    createBtn.addEventListener("click", () => openModal());
    closeBtn.addEventListener("click", closeModal);
    
    // Close modal on background click
    modalOverlay.addEventListener("click", (e) => {
        if(e.target === modalOverlay) closeModal();
    });
  
    function openModal(col = null) {
        if (modalBusy || !deletePanel.hidden) return;
        if (col) {
            modalTitle.textContent = "Edit Collection";
            idInput.value = col.id;
            titleInput.value = col.title;
            descInput.value = col.description;
            deleteBtn.style.display = "block";
        } else {
            modalTitle.textContent = "Create Collection";
            form.reset();
            idInput.value = "";
            deleteBtn.style.display = "none";
        }
        modalOverlay.classList.remove("modal-hidden");
    }
  
    function closeModal() {
        if (modalBusy || !deletePanel.hidden) return;
        modalOverlay.classList.add("modal-hidden");
        form.reset();
    }
  
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (modalBusy || !deletePanel.hidden) return;
        if (!titleInput.value.trim()) {
            titleInput.focus();
            return;
        }
        
        const payload = {
            id: idInput.value || null,
            title: titleInput.value,
            description: descInput.value,
        };
  
        setModalBusy(true);
        let saved = false;
        try {
            await reorderSave.flush();
            await request("/api/collections/save/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": getCookie("csrftoken")
                },
                body: JSON.stringify(payload)
            });
            saved = true;
        } catch (err) {
            notify(err.message);
        } finally {
            setModalBusy(false);
        }
        if (saved) {
            closeModal();
            loadCollections(1, { preserveLoaded: true });
        }
    });

    function setModalBusy(busy) {
        modalBusy = busy;
        form.querySelectorAll('input, textarea, button').forEach(control => { control.disabled = busy; });
        cancelDelete.disabled = busy;
        confirmDelete.disabled = busy;
    }

    deleteBtn.addEventListener('click', () => {
        if (modalBusy || !idInput.value) return;
        deletePanel.hidden = false;
        modalOverlay.inert = true;
        cancelDelete.focus();
    });
    function closeDeletePanel(restoreFocus = true) {
        if (modalBusy) return;
        deletePanel.hidden = true;
        modalOverlay.inert = false;
        if (restoreFocus) deleteBtn.focus();
    }
    cancelDelete.addEventListener('click', () => closeDeletePanel());
    document.addEventListener('click', event => {
        if (!deletePanel.hidden && !deletePanel.contains(event.target)) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }, true);
    document.addEventListener('keydown', event => {
        if (deletePanel.hidden) return;
        if (event.key === 'Escape') closeDeletePanel();
        if (event.key === 'Tab') {
            event.preventDefault();
            (document.activeElement === cancelDelete ? confirmDelete : cancelDelete).focus();
        }
    });
    confirmDelete.addEventListener("click", async () => {
        if (modalBusy || deletePanel.hidden) return;
        setModalBusy(true);
        let deleted = false;
        try {
            await reorderSave.flush();
            await request(`/api/collections/delete/${idInput.value}/`, {
                method: "DELETE",
                headers: {"X-CSRFToken": getCookie("csrftoken")}
            });
            deleted = true;
        } catch (err) {
            notify(err.message);
        } finally {
            setModalBusy(false);
        }
        if (deleted) {
            closeDeletePanel(false);
            closeModal();
            loadCollections(1, { preserveLoaded: true });
        }
    });
  
    // ==========================================
    // DRAG AND DROP LOGIC (NATIVE)
    // ==========================================
    sortBtn.addEventListener("click", () => {
        if (currentSearch || searchPending || isLoading || loadFailed || touchPointer.matches) return;
        isSortMode = !isSortMode;
        sortBtn.classList.toggle("active-sort", isSortMode);
        updateDraggableState();
    });
    touchPointer.addEventListener('change', () => {
        if (!touchPointer.matches) return;
        isSortMode = false;
        sortBtn.classList.remove('active-sort');
        updateDraggableState();
    });
  
    function updateDraggableState() {
        const cards = grid.querySelectorAll(".collection-card");
        cards.forEach(card => {
            if (isSortMode) {
                card.classList.add("draggable-mode");
                card.setAttribute("draggable", "true");
                // Disable links while sorting
                card.onclick = (e) => e.preventDefault(); 
            } else {
                card.classList.remove("draggable-mode");
                card.removeAttribute("draggable");
                card.onclick = null;
            }
        });
    }
  
    let draggedElement = null;

    grid.addEventListener('dragstart', (e) => {
        if (currentSearch || searchPending || isLoading || loadFailed) { e.preventDefault(); return; }
        if (!isSortMode) return;
        
        // Disable native drag on touch screens
        if (window.matchMedia('(pointer: coarse)').matches) {
            e.preventDefault();
            return;
        }

        document.body.classList.add('drag-active');
        
        draggedElement = e.target.closest('.collection-card');
        if (draggedElement) {
            if (e.dataTransfer) {
                const rect = draggedElement.getBoundingClientRect();
                e.dataTransfer.setDragImage(draggedElement, rect.width / 2, rect.height / 2);
            }
            const started = draggedElement;
            setTimeout(() => { if (draggedElement === started) started.classList.add('dragging'); }, 0);
        }
    });

    grid.addEventListener('dragend', () => {
        document.body.classList.remove('drag-active');
        if (!draggedElement) return;
        draggedElement.classList.remove('dragging');
        draggedElement = null;
        saveOrder();
    });

    grid.addEventListener('dragover', (e) => {
        if (!isSortMode || !draggedElement) return;
        e.preventDefault();
        
        const afterElement = getDragAfterElement(grid, e.clientX, e.clientY);
        if (afterElement === draggedElement.nextElementSibling) return;
        if (afterElement == null) {
            if (grid.lastElementChild !== draggedElement) grid.appendChild(draggedElement);
        } else {
            grid.insertBefore(draggedElement, afterElement);
        }
    });

    function getDragAfterElement(container, x, y) {
        const draggableElements = [...container.querySelectorAll('.collection-card:not(.dragging)')];

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
  
    function saveOrder() {
        if (!isSortMode || currentSearch || searchPending) return;
        const currentOrder = [...grid.querySelectorAll(".collection-card")].map(c => c.dataset.id);
        
        return reorderSave.save(currentOrder);
    }
});
