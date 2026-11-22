document.addEventListener("DOMContentLoaded", () => {
    const { request, notify, orderSaver, getCookie } = window.collectionUI;

    let currentSort = "custom";
    let currentSortOrder = "desc";
    const ratingMode = document.body.dataset.ratingMode || 'faces';

    // Pagination states for the main grid
    let currentPage = 1;
    let hasMore = true;
    let isLoading = false;
    let loadFailed = false;
    let mutationBusy = false;
    let editController = new AbortController();

    window.openEditModal = function(element) {
        if (mutationBusy || element.dataset.kind === 'person') return;
        editController.abort();
        editController = new AbortController();
        const controller = editController;
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

        request(`/get-item/${itemId}/?_t=${Date.now()}`, { signal: controller.signal })
            .then(data => {
                if (controller !== editController) return;
                if (window.populateEditForm) window.populateEditForm(form, data.item);
                modal.classList.remove("modal-hidden");
                overlay.classList.remove("modal-hidden");
            })
            .catch(err => {
                if (err.name === 'AbortError') return;
                console.error("Fetch error:", err);
                notify(err.message);
            });
    };

    window.replaceHistoryItem = function(updatedItem) {
        return loadCollectionItems(1, true, { preserveLoaded: true, updatedId: updatedItem.id });
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
    const typeFilters = document.querySelectorAll('.type-filters [data-type]');
    const pickerGroups = document.querySelectorAll('[data-picker-group]');
    const pickerPanels = document.querySelectorAll('[data-picker-types]');
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
    let searchGroup = 'media';
    let searchTimeout = null;
    const collectionSearch = document.getElementById('collection-items-search');
    let currentSearch = '';
    let searchPending = false;
    let collectionSearchTimer;
    let requestRevision = 0;
    let requestController = new AbortController();
    let addController = new AbortController();
    let addRevision = 0;
    const touchPointer = window.matchMedia('(pointer: coarse)');
    const reorderSave = orderSaver(`/api/collection/${colId}/reorder/`, error => {
        setReorderMode(false);
        notify(error.message);
        loadCollectionItems(1, true, { preserveLoaded: true });
    }, 'entry_ids');

    collectionSearch.addEventListener('input', () => {
        const query = collectionSearch.value.trim();
        if (query === currentSearch && !searchPending) return;
        clearTimeout(collectionSearchTimer);
        requestController.abort();
        requestRevision++;
        isLoading = false;
        if (isReorderMode) toggleReorderMode();
        if (isDeleteMode) toggleDeleteMode();
        if (draggedEl) draggedEl.classList.remove('dragging');
        draggedEl = null;
        document.body.classList.remove('drag-active');
        currentSearch = query;
        searchPending = true;
        reorderBtn.disabled = true;
        collectionSearchTimer = setTimeout(() => loadCollectionItems(1, true), 300);
    });

    // Load initial collection items
    loadCollectionItems(1, true);

    // Infinite scroll for main grid
    window.addEventListener('scroll', () => {
        if (isLoading || searchPending || mutationBusy || draggedEl || (!hasMore && !loadFailed)) return;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        if (scrollTop + window.innerHeight >= document.documentElement.scrollHeight - 500) {
            loadCollectionItems(loadFailed ? 1 : currentPage + 1, loadFailed);
        }
    });

    function getRatingHtml(rating) {
        if (!rating) return '';

        const rnum = Number(rating);
        if (isNaN(rnum)) return '';

        const displayRating = window.ratingToDisplay(rnum, ratingMode);
        if (displayRating === null) return '';
        const rounded = Math.round(rnum);

        if (ratingMode === 'faces') {
            if (rounded <= 33) return '<svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="frown" class="svg-inline--fa fa-frown fa-w-16 fa-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512" style="width: 1.2em; height: 1.2em; color: grey;"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160-64c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32zm-80 128c-40.2 0-78 17.7-103.8 48.6-8.5 10.2-7.1 25.3 3.1 33.8 10.2 8.4 25.3 7.1 33.8-3.1 16.6-19.9 41-31.4 66.9-31.4s50.3 11.4 66.9 31.4c8.1 9.7 23.1 11.9 33.8 3.1 10.2-8.5 11.5-23.6 3.1-33.8C326 321.7 288.2 304 248 304z"></path></svg>';
            else if (rounded <= 66) return '<svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="meh" class="svg-inline--fa fa-meh fa-w-16 fa-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512" style="width: 1.2em; height: 1.2em; color: grey;"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160-64c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32zm8 144H160c-13.2 0-24 10.8-24 24s10.8 24 24 24h176c13.2 0 24-10.8 24-24s-10.8-24-24-24z"></path></svg>';
            else return '<svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="smile" class="svg-inline--fa fa-smile fa-w-16 fa-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512" style="width: 1.2em; height: 1.2em; color: grey;"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm4 72.6c-20.8 25-51.5 39.4-84 39.4s-63.2-14.3-84-39.4c-8.5-10.2-23.7-11.5-33.8-3.1-10.2 8.5-11.5 23.6-3.1 33.8 30 36 74.1 56.6 120.9 56.6s90.9-20.6 120.9-56.6c8.5-10.2 7.1-25.3-3.1-33.8-10.1-8.4-25.3-7.1-33.8 3.1z"></path></svg>';
        } else if (ratingMode === 'stars_5') {
            const starsCount = displayRating;
            let starsHtml = '<span style="display:inline-block; height:1.1em; line-height:1;">';
            for (let i = 1; i <= 5; i++) {
                if (i <= starsCount) starsHtml += '<svg viewBox="0 0 32 32" style="color:gold; width:1.1em; height:1.1em; margin-left:-0.25em; vertical-align:middle; z-index:1; position:relative;"><path fill="currentColor" stroke="#000" stroke-width="1.2" d="M16 2.5l4.09 8.29 9.16 1.33-6.62 6.45 1.56 9.09L16 23.13l-8.19 4.32 1.56-9.09-6.62-6.45 9.16-1.33L16 2.5z"/></svg>';
                else starsHtml += '<svg viewBox="0 0 32 32" style="color:#444; opacity:0.4; width:1.1em; height:1.1em; margin-left:-0.25em; vertical-align:middle; z-index:1; position:relative;"><path fill="currentColor" stroke="#000" stroke-width="1.2" d="M16 2.5l4.09 8.29 9.16 1.33-6.62 6.45 1.56 9.09L16 23.13l-8.19 4.32 1.56-9.09-6.62-6.45 9.16-1.33L16 2.5z"/></svg>';
            }
            return starsHtml.replace('margin-left:-0.25em;', 'margin-left:0;') + '</span>';
        } else if (ratingMode === 'scale_10') {
            const displayVal = displayRating;
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
        card.dataset.kind = item.kind || 'media';
        card.dataset.key = `${card.dataset.kind}:${item.id}`;
        if (item.entry_id != null) card.dataset.entryId = item.entry_id;
        card.dataset.mediaType = item.media_type;
        card.dataset.title = item.title;
        card.dataset.coverUrl = item.cover_url;
        card.dataset.bannerUrl = item.banner_url || '';
        
        let selectCircleHtml = "";
        let editBtnHtml = "";
        
        if (isAddModal) {
            const isSelected = selectedForAdd.has(card.dataset.key);
            selectCircleHtml = `<div class="select-circle ${isSelected ? 'selected' : ''}"></div>`;
        } else if (item.kind !== 'person') {
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
            <a class="card-link" ${isAddModal ? 'draggable="false"' : ''}>
                <div class="card-image">
                    <img loading="lazy" draggable="false">
                    ${sortValueHtml}
                    ${selectCircleHtml}
                    ${editBtnHtml}
                </div>
            </a>
            <div style="display: flex; flex-direction: column; justify-content: center;">
                <div class="card-title"></div>
            </div>
        `;
        card.querySelector('.card-link').href = item.url || '#';
        const image = card.querySelector('img');
        image.src = item.cover_url;
        image.alt = item.title;
        const titleElement = card.querySelector('.card-title');
        titleElement.textContent = item.title;
        titleElement.title = item.title;

        card.addEventListener('click', (e) => {
            if (mutationBusy || (!isAddModal && (isLoading || searchPending || loadFailed) && (isDeleteMode || isReorderMode))) {
                e.preventDefault();
                return;
            }
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
                const idStr = card.dataset.key;
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
                const idStr = card.dataset.entryId;
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
        
        card.dataset.signature = JSON.stringify([item, currentSort]);
        return card;
    }

    function syncCardModes(card) {
        card.classList.toggle('draggable-mode', isReorderMode);
        if (isReorderMode) card.setAttribute('draggable', 'true');
        else card.removeAttribute('draggable');
        let circle = card.querySelector('.select-circle');
        if (isDeleteMode) {
            if (!circle) {
                circle = document.createElement('div');
                circle.className = 'select-circle';
                card.querySelector('.card-image').appendChild(circle);
            }
            circle.classList.toggle('selected', selectedForDelete.has(card.dataset.entryId));
        } else circle?.remove();
    }

    async function loadCollectionItems(page = 1, reset = false, { preserveLoaded = false, updatedId = null } = {}) {
        const lastPage = preserveLoaded ? currentPage : (reset ? 1 : page);
        if (reset) {
            clearTimeout(collectionSearchTimer);
            requestController.abort();
            requestController = new AbortController();
            requestRevision++;
        } else if (isLoading || searchPending || !hasMore) return;
        const revision = requestRevision;
        isLoading = true;
        reorderBtn.disabled = true;
        const requestedPage = reset ? 1 : page;

        try {
            await reorderSave.flush();
            if (revision !== requestRevision) return;
            const newItems = [];
            let data;
            for (let nextPage = requestedPage; nextPage <= lastPage; nextPage++) {
                const params = new URLSearchParams({ page: nextPage, sort_by: currentSort, sort_order: currentSortOrder, search: currentSearch });
                data = await request(`/api/collection/${colId}/items/?${params}`, { signal: requestController.signal });
                if (revision !== requestRevision) return;
                newItems.push(...data.items);
                if (!data.has_more) break;
            }
            
            hasMore = data.has_more;
            currentPage = data.page;
            // Anchor at render time so scrolling during a request is respected.
            const anchor = preserveLoaded ? [...grid.children].find(card =>
                !(card.dataset.kind === 'media' && card.dataset.id === String(updatedId)) && card.getBoundingClientRect().top >= 0 &&
                card.getBoundingClientRect().top < window.innerHeight) : null;
            const anchorId = anchor?.dataset.entryId;
            const anchorTop = anchor?.getBoundingClientRect().top;
            collectionItems = reset ? newItems : collectionItems.concat(newItems);
            const existingCards = new Map(reset ? [...grid.children].map(card => [card.dataset.entryId, card]) : []);
            const retained = new Set();
            
            newItems.forEach((item, index) => {
                const existing = existingCards.get(String(item.entry_id));
                const card = existing?.dataset.signature === JSON.stringify([item, currentSort]) ? existing : createCardElement(item, false);
                retained.add(card);
                syncCardModes(card);
                if (reset) {
                    const before = grid.children[index] || null;
                    if (card !== before) grid.insertBefore(card, before);
                }
                else grid.appendChild(card);
            });
            existingCards.forEach(card => { if (!retained.has(card)) card.remove(); });
            loadFailed = false;
            if (anchorId) {
                const retainedAnchor = [...grid.children].find(card => card.dataset.entryId === anchorId);
                if (retainedAnchor) window.scrollBy({ top: retainedAnchor.getBoundingClientRect().top - anchorTop, behavior: 'instant' });
            }

            noItemsMsg.textContent = currentSearch ? 'No matching items found.' : 'This collection is empty.';
            noItemsMsg.style.display = collectionItems.length === 0 ? "block" : "none";
        } catch (err) {
            if (revision !== requestRevision || err.name === 'AbortError') return;
            console.error(err);
            loadFailed = true;
            setReorderMode(false);
            notify(err.message);
        } finally {
            if (revision === requestRevision) {
                isLoading = false;
                searchPending = false;
                reorderBtn.disabled = Boolean(currentSearch) || loadFailed || mutationBusy;
            }
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
            if (mutationBusy) return;
            setReorderMode(false);
            if (isDeleteMode) toggleDeleteMode();
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
            if (mutationBusy) return;
            setReorderMode(false);
            if (isDeleteMode) toggleDeleteMode();
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
        if (mutationBusy) return;
        if (isReorderMode) toggleReorderMode();
        if (isDeleteMode) toggleDeleteMode();

        addModal.classList.remove("modal-hidden");
        selectedForAdd.clear();
        updateAddCount();
        searchInput.value = "";
        performLocalSearch();
    });

    function closeAdd() {
        if (mutationBusy) return;
        invalidateAddSearch();
        addModal.classList.add('modal-hidden');
    }
    closeAddModal.addEventListener("click", closeAdd);

    typeFilters.forEach(btn => {
        btn.addEventListener("click", (e) => {
            if (mutationBusy) return;
            const panel = btn.closest('[data-picker-types]');
            if (panel.dataset.pickerTypes !== searchGroup) return;
            panel.querySelectorAll('[data-type]').forEach(button => button.classList.toggle('active', button === btn));
            searchType = btn.dataset.type;
            performLocalSearch();
        });
    });

    pickerGroups.forEach(button => {
        button.addEventListener('click', () => {
            if (mutationBusy || searchGroup === button.dataset.pickerGroup) return;
            searchGroup = button.dataset.pickerGroup;
            searchType = 'all';
            pickerGroups.forEach(group => {
                const selected = group === button;
                group.classList.toggle('active', selected);
                group.setAttribute('aria-pressed', String(selected));
            });
            pickerPanels.forEach(panel => {
                panel.hidden = panel.dataset.pickerTypes !== searchGroup;
                panel.querySelectorAll('[data-type]').forEach(type => type.classList.toggle('active', type.dataset.type === 'all'));
            });
            performLocalSearch();
        });
    });

    searchInput.addEventListener("input", () => {
        invalidateAddSearch();
        searchTimeout = setTimeout(() => performLocalSearch(), 300);
    });

    function invalidateAddSearch() {
        clearTimeout(searchTimeout);
        addController.abort();
        addRevision++;
        addIsLoading = false;
        addGrid.inert = true;
    }

    async function performLocalSearch(page = 1) {
        if (addModal.classList.contains('modal-hidden')) return;
        if (page === 1) {
            invalidateAddSearch();
            addController = new AbortController();
        } else if (addIsLoading || addGrid.inert || !addHasMore) return;
        const revision = addRevision;
        
        addIsLoading = true;
        const query = searchInput.value;
        
        if (page === 1) {
            addGrid.replaceChildren();
            addGrid.scrollTop = 0;
            addHasMore = true;
        }
        
        try {
            const params = new URLSearchParams({ q: query, group: searchGroup, type: searchType, page });
            const data = await request(`/api/collection/${colId}/search-local/?${params}`, { signal: addController.signal });
            if (revision !== addRevision) return;
            
            addHasMore = data.has_more;
            addCurrentPage = data.page;
            
            data.items.forEach(item => {
                addGrid.appendChild(createCardElement(item, true));
            });
        } catch (err) {
            if (revision !== addRevision || err.name === 'AbortError') return;
            console.error(err);
            notify(err.message);
        } finally {
            if (revision === addRevision) {
                addIsLoading = false;
                addGrid.inert = false;
            }
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
        if (selectedForAdd.size === 0 || mutationBusy) return;
        setMutationBusy(true);
        let added = false;
        
        try {
            await reorderSave.flush();
            await request(`/api/collection/${colId}/add/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") },
                body: JSON.stringify({ entries: Array.from(selectedForAdd) })
            });
            
            added = true;
        } catch (err) {
            console.error(err);
            notify(err.message);
        } finally {
            setMutationBusy(false);
        }
        if (added) {
            closeAdd();
            loadCollectionItems(1, true, { preserveLoaded: true });
        }
    });

    function setMutationBusy(busy) {
        mutationBusy = busy;
        [addBtn, deleteBtn, confirmAddBtn, confirmDeleteBtn, cancelDeleteBtn, closeAddModal,
            searchInput, collectionSearch, sortOrderBtn, ...typeFilters, ...pickerGroups].forEach(control => { control.disabled = busy; });
        reorderBtn.disabled = busy || isLoading || searchPending || Boolean(currentSearch) || loadFailed;
    }

    // =====================================
    // DELETE MODE LOGIC
    // =====================================
    deleteBtn.addEventListener("click", toggleDeleteMode);
    cancelDeleteBtn.addEventListener("click", () => {
        if(isDeleteMode) toggleDeleteMode();
    });

    function toggleDeleteMode() {
        if (mutationBusy) return;
        setReorderMode(false);

        isDeleteMode = !isDeleteMode;
        selectedForDelete.clear();
        updateDeleteCount();

        if (isDeleteMode) {
            document.body.classList.add('delete-mode');
            deleteBtn.classList.add("active-state");
            floatingBar.classList.remove("hidden");
            
        } else {
            document.body.classList.remove('delete-mode');
            deleteBtn.classList.remove("active-state");
            floatingBar.classList.add("hidden");
            
        }
        [...grid.children].forEach(syncCardModes);
    }

    function updateDeleteCount() {
        delCountText.textContent = `${selectedForDelete.size} items selected`;
    }

    confirmDeleteBtn.addEventListener("click", async () => {
        if (selectedForDelete.size === 0 || mutationBusy) return;
        setMutationBusy(true);
        let removed = false;

        try {
            await reorderSave.flush();
            await request(`/api/collection/${colId}/remove/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") },
                body: JSON.stringify({ entry_ids: Array.from(selectedForDelete) })
            });
            
            removed = true;
        } catch(err) {
            console.error(err);
            notify(err.message);
        } finally {
            setMutationBusy(false);
        }
        if (removed) {
            toggleDeleteMode();
            loadCollectionItems(1, true, { preserveLoaded: true });
        }
    });

    // =====================================
    // REORDER LOGIC
    // =====================================
    reorderBtn.addEventListener("click", toggleReorderMode);

    async function toggleReorderMode() {
        if (mutationBusy) return;
        if (isReorderMode) {
            setReorderMode(false);
            return;
        }
        if (currentSearch || searchPending || isLoading || loadFailed || touchPointer.matches) return;
        if (isDeleteMode) toggleDeleteMode();

        let needsReload = false;
        if (currentSort !== 'custom') {
            currentSort = 'custom';
            updateSortUI();
            needsReload = true;
        }

        if (needsReload) {
            await loadCollectionItems(1, true);
        }
        if (currentSort !== 'custom' || currentSearch || searchPending || isLoading || loadFailed || touchPointer.matches) return;
        setReorderMode(true);
    }

    function setReorderMode(enabled) {
        isReorderMode = enabled;
        if (!enabled) {
            document.body.classList.remove('drag-active');
            if (draggedEl) draggedEl.classList.remove('dragging');
            draggedEl = null;
        }

        if (isReorderMode) {
            document.body.classList.add('reorder-mode');
            reorderBtn.classList.add("active-state");
        } else {
            document.body.classList.remove('reorder-mode');
            reorderBtn.classList.remove("active-state");
        }

        [...grid.children].forEach(syncCardModes);
    }
    touchPointer.addEventListener('change', () => { if (touchPointer.matches) setReorderMode(false); });

    let draggedEl = null;

    grid.addEventListener('dragstart', (e) => {
        if (currentSearch || searchPending || isLoading || loadFailed || mutationBusy) { e.preventDefault(); return; }
        if (!isReorderMode || currentSort !== 'custom') return;
        
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
            const started = draggedEl;
            setTimeout(() => { if (draggedEl === started) started.classList.add('dragging'); }, 0);
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
        if (afterEl === draggedEl.nextElementSibling) return;
        if (afterEl == null) {
            if (grid.lastElementChild !== draggedEl) grid.appendChild(draggedEl);
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

    function saveReorder() {
        if (!isReorderMode || currentSort !== 'custom' || currentSearch || searchPending) return;
        const order = [...grid.querySelectorAll(".card")].map(c => Number(c.dataset.entryId));
        
        return reorderSave.save(order);
    }
});
