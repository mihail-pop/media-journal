document.addEventListener("DOMContentLoaded", () => {
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
  
    // State
    let currentPage = 1;
    let isLoading = false;
    let hasMore = true;
    let allCollections =[];
    let isSortMode = false;
  
    // Fetch initial data
    loadCollections(1);
  
    // ==========================================
    // API AND RENDERING
    // ==========================================
    async function loadCollections(page = 1) {
        if (isLoading || (!hasMore && page !== 1)) return;
        isLoading = true;
        
        loadingIndicator.style.display = 'block';
        
        try {
            const response = await fetch(`/api/collections/?page=${page}`);
            const data = await response.json();
            
            if (page === 1) {
                allCollections = data.items ||[];
                grid.innerHTML = '';
            } else {
                allCollections = [...allCollections, ...(data.items || [])];
            }
            
            hasMore = data.has_more;
            currentPage = data.page;
            
            data.items.forEach(col => grid.appendChild(createCard(col)));
            
            noItemsMsg.style.display = allCollections.length === 0 ? "block" : "none";
            updateDraggableState();
            
        } catch (error) {
            console.error('Error loading collections:', error);
        } finally {
            isLoading = false;
            loadingIndicator.style.display = 'none';
        }
    }
  
    function createCard(col) {
        const a = document.createElement("a");
        // We will make the detail page URL next, but for now we set it like this:
        a.href = `/collection/${col.id}/`; 
        a.className = "collection-card";
        a.dataset.id = col.id;
        
        // Generate the 3-image fan
        const coversHtml = col.covers.map((url, idx) => {
            return `<img src="${url}" class="stack-img pos-${idx}" alt="cover">`;
        }).join("");
        
        const stackClass = `cover-stack items-${col.covers.length}`;
  
        a.innerHTML = `
            <button class="edit-col-btn" title="Edit Collection">⋯</button>
            <div class="${stackClass}">
                ${coversHtml}
            </div>
            <div class="col-info">
                <h3 class="col-title" title="${col.title}">${col.title}</h3>
                <p class="col-count">${col.item_count} item${col.item_count !== 1 ? 's' : ''}</p>
            </div>
        `;
  
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
        if (isLoading || !hasMore || isSortMode) return;
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
            loadCollections(currentPage + 1);
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
        modalOverlay.classList.add("modal-hidden");
        form.reset();
    }
  
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const payload = {
            id: idInput.value || null,
            title: titleInput.value,
            description: descInput.value,
        };
  
        try {
            const res = await fetch("/api/collections/save/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": getCookie("csrftoken")
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (data.success) {
                closeModal();
                // Reload page to reflect changes instantly
                loadCollections(1);
            } else {
                alert("Error saving collection.");
            }
        } catch (err) {
            console.error(err);
        }
    });
  
    deleteBtn.addEventListener("click", async () => {
        if(!confirm("Are you sure you want to delete this collection?")) return;
        
        try {
            const res = await fetch(`/api/collections/delete/${idInput.value}/`, {
                method: "DELETE",
                headers: {"X-CSRFToken": getCookie("csrftoken")}
            });
            const data = await res.json();
            
            if (data.success) {
                closeModal();
                loadCollections(1);
            }
        } catch (err) {
            console.error(err);
        }
    });
  
    // ==========================================
    // DRAG AND DROP LOGIC (NATIVE)
    // ==========================================
    sortBtn.addEventListener("click", () => {
        isSortMode = !isSortMode;
        sortBtn.textContent = isSortMode ? "Reorder: ON" : "Reorder: OFF";
        sortBtn.classList.toggle("active-sort", isSortMode);
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
        if (!isSortMode) return;
        draggedElement = e.target.closest('.collection-card');
        setTimeout(() => draggedElement.classList.add('dragging'), 0);
    });
  
    grid.addEventListener('dragend', () => {
        if (!draggedElement) return;
        draggedElement.classList.remove('dragging');
        draggedElement = null;
        saveOrder();
    });
  
    grid.addEventListener('dragover', (e) => {
        if (!isSortMode || !draggedElement) return;
        e.preventDefault();
        
        const afterElement = getDragAfterElement(grid, e.clientX, e.clientY);
        if (afterElement == null) {
            grid.appendChild(draggedElement);
        } else {
            grid.insertBefore(draggedElement, afterElement);
        }
    });
  
    function getDragAfterElement(container, x, y) {
        const draggableElements = [...container.querySelectorAll('.collection-card:not(.dragging)')];
  
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            // A simple grid distance check
            const offsetX = x - box.left - box.width / 2;
            const offsetY = y - box.top - box.height / 2;
            const distance = Math.sqrt(offsetX*offsetX + offsetY*offsetY);
            
            // Limit bounds to avoid weird wrapping jumps
            if (offsetY < 0 && distance < closest.distance) {
                return { offset: distance, element: child, distance: distance };
            } else {
                return closest;
            }
        }, { distance: Number.POSITIVE_INFINITY }).element;
    }
  
    async function saveOrder() {
        const currentOrder = [...grid.querySelectorAll(".collection-card")].map(c => c.dataset.id);
        
        try {
            await fetch("/api/collections/reorder/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": getCookie("csrftoken")
                },
                body: JSON.stringify({ order: currentOrder })
            });
        } catch (err) {
            console.error("Failed to save reorder", err);
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