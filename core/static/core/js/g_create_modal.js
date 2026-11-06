document.addEventListener("DOMContentLoaded", function () {
  const modal = document.getElementById("create-modal");
  const overlay = document.getElementById("create-overlay");
  const openBtn = document.getElementById("open-create-modal-btn");
  const closeBtn = document.getElementById("create-close-btn");
  const form = document.getElementById("create-form");

  if (!openBtn || !modal) return;

  const mediaGenres = {
    movies:["Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance", "Science Fiction", "TV Movie", "Thriller", "War", "Western"],
    tvshows:["Action & Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Kids", "Mystery", "News", "Reality", "Sci-Fi & Fantasy", "Soap", "Talk", "War & Politics", "Western"],
    anime:["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mahou Shoujo", "Mecha", "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"],
    manga:["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mahou Shoujo", "Mecha", "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"],
    games:["Adventure", "Arcade", "Card & Board Game", "Fighting", "Hack and slash/Beat 'em up", "Indie", "MOBA", "Music", "Pinball", "Platform", "Point-and-click", "Puzzle", "Quiz/Trivia", "Racing", "Real Time Strategy (RTS)", "Role-playing (RPG)", "Shooter", "Simulator", "Sport", "Strategy", "Tactical", "Turn-based strategy (TBS)", "Visual Novel"],
    books:["Action & Adventure Fiction", "Biography", "Classics", "Fantasy", "Historical Fiction", "History", "Horror", "Mystery", "Non-fiction", "Poetry", "Romance", "Science Fiction", "Thriller", "Young Adult"],
    music:["Alternative", "Blues", "Classical", "Country", "Electronic", "Folk", "Hip Hop", "Indie", "Jazz", "Metal", "Pop", "Punk", "R&B", "Reggae", "Rock", "Soul"]
  };

  let createCurrentCreators =[];
  let createCreatorPlaceholder = "Add creator...";

  const creatorPlaceholdersMap = {
      movies: "Add directors...", movie: "Add directors...",
      tvshows: "Add directors...", tv: "Add directors...",
      anime: "Add studios...",
      manga: "Add authors...", books: "Add authors...", book: "Add authors...",
      games: "Add developers...", game: "Add developers...",
      music: "Add artists..."
  };

  const statusLabelsMap = {
    movie: { ongoing: "Watching", on_hold: "Paused", completed: "Completed", planned: "Planned", dropped: "Dropped" },
    tvshows: { ongoing: "Watching", on_hold: "Paused", completed: "Completed", planned: "Planned", dropped: "Dropped" },
    anime: { ongoing: "Watching", on_hold: "Paused", completed: "Completed", planned: "Planned", dropped: "Dropped" },
    manga: { ongoing: "Reading", on_hold: "Paused", completed: "Completed", planned: "Planned", dropped: "Dropped" },
    game: { ongoing: "Playing", on_hold: "Paused", completed: "Completed", planned: "Planned", dropped: "Dropped" },
    book: { ongoing: "Reading", on_hold: "Paused", completed: "Completed", planned: "Planned", dropped: "Dropped" },
    music: { ongoing: "Listening", on_hold: "Paused", completed: "Completed", planned: "Planned", dropped: "Dropped" },
  };

  const statusKeys = ['ongoing', 'completed', 'on_hold', 'planned', 'dropped'];

  function initCreateStatus(mediaType) {
      const mediaTypeKey = mediaType === 'tv' ? 'tvshows' : mediaType;
      const optionsContainer = document.getElementById('create-status-options');
      const hiddenInput = document.getElementById('create_status_hidden');
      const textSpan = document.getElementById('create-status-text');

      if (!optionsContainer) return;
      optionsContainer.innerHTML = '';

      statusKeys.forEach(key => {
          const label = statusLabelsMap[mediaTypeKey]?.[key] || key.charAt(0).toUpperCase() + key.slice(1);
          const opt = document.createElement('div');
              opt.className = 'c-status-option';
              opt.dataset.value = key;
              opt.textContent = label;
              opt.addEventListener('click', (e) => {
                  e.stopPropagation();
                  hiddenInput.value = key;
                  textSpan.textContent = label;
                  optionsContainer.classList.remove('c-open');
                  document.getElementById('create-status-wrapper').classList.remove('c-open');
                  
                  const options = optionsContainer.querySelectorAll('.c-status-option');
                  options.forEach(o => o.classList.remove('c-selected'));
                  opt.classList.add('c-selected');
              });
              optionsContainer.appendChild(opt);
          });

          // Default to 'planned'
          hiddenInput.value = 'planned';
          textSpan.textContent = statusLabelsMap[mediaTypeKey]?.['planned'] || 'Planned';
          
          const options = optionsContainer.querySelectorAll('.c-status-option');
          options.forEach(o => {
              if (o.dataset.value === 'planned') o.classList.add('c-selected');
          });
      }

  function closeCreateDropdowns(except = null) {
    modal.querySelectorAll('.custom-select-wrapper, .c-status-select-wrapper').forEach(wrapper => {
      if (wrapper === except) return;
      wrapper.classList.remove('open', 'c-open');
      wrapper.querySelector('.custom-options, .c-status-options')?.classList.remove('open', 'c-open');
      wrapper.querySelectorAll('[aria-expanded]').forEach(element => element.setAttribute('aria-expanded', 'false'));
    });
  }

  // Genres and Collections share the same selection, filtering and clear behavior.
  function setupCreateMultiSelect(name, placeholder) {
    const wrapper = document.getElementById(`create-${name}-wrapper`);
    const trigger = document.getElementById(`create-${name}-select`);
    const search = document.getElementById(`create-${name}-search`);
    const options = document.getElementById(`create-${name}-options`);
    const tags = document.getElementById(`create-${name}-tags`);
    const indicator = document.getElementById(`create-${name}-indicator`);
    let choices = new Map();
    let selected = [];
    options.setAttribute('aria-multiselectable', 'true');

    function setOpen(open) {
      if (open) closeCreateDropdowns(wrapper);
      wrapper.classList.toggle('open', open);
      options.classList.toggle('open', open);
      trigger.setAttribute('aria-expanded', String(open));
      search.setAttribute('aria-expanded', String(open));
    }

    function filter(query) {
      const normalized = query.toLowerCase();
      options.querySelectorAll('.genre-option').forEach(option => {
        option.classList.toggle('hidden', !choices.get(option.dataset.value).toLowerCase().includes(normalized));
      });
    }

    function updateUI() {
      tags.replaceChildren();
      selected.forEach(value => {
        const tag = document.createElement('div');
        tag.className = 'genre-tag';
        const label = document.createElement('span');
        label.textContent = choices.get(value);
        const remove = document.createElement('span');
        remove.className = 'remove-tag';
        remove.textContent = '✕';
        remove.addEventListener('click', event => {
          event.stopPropagation();
          toggle(value);
        });
        tag.append(label, remove);
        tags.appendChild(tag);
      });
      options.querySelectorAll('.genre-option').forEach(option => {
        const active = selected.includes(option.dataset.value);
        option.classList.toggle('selected', active);
        option.setAttribute('aria-selected', String(active));
      });
      search.placeholder = selected.length ? '' : placeholder;
      wrapper.classList.toggle('has-items', selected.length > 0);
    }

    function toggle(value) {
      selected = selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value];
      updateUI();
    }

    wrapper.addEventListener('click', () => {
      if (window.getSelection().toString().length > 0) return;
      setOpen(true);
      search.focus();
    });
    wrapper.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      } else if (event.target === trigger && ['Enter', ' '].includes(event.key)) {
        event.preventDefault();
        setOpen(true);
        search.focus();
      }
    });
    search.addEventListener('focus', () => setOpen(true));
    search.addEventListener('input', () => filter(search.value));
    search.addEventListener('keydown', event => {
      if (event.key === 'Enter') event.preventDefault();
      if (event.key === 'Backspace' && search.value === '' && selected.length) {
        toggle(selected[selected.length - 1]);
      }
    });
    indicator.addEventListener('click', event => {
      event.stopPropagation();
      if (selected.length) {
        selected = [];
        search.value = '';
        filter('');
        updateUI();
        setOpen(false);
      } else {
        setOpen(!wrapper.classList.contains('open'));
        if (wrapper.classList.contains('open')) search.focus();
      }
    });
    document.addEventListener('click', event => {
      if (!wrapper.contains(event.target)) setOpen(false);
    });

    return {
      values: () => [...selected],
      reset() {
        selected = [];
        search.value = '';
        filter('');
        updateUI();
        setOpen(false);
      },
      setOptions(items) {
        choices = new Map(items.map(item => [String(item.value), item.label]));
        options.replaceChildren();
        choices.forEach((label, value) => {
          const option = document.createElement('div');
          option.className = 'custom-option genre-option';
          option.dataset.value = value;
          option.setAttribute('role', 'option');
          const title = document.createElement('span');
          title.textContent = label;
          const check = document.createElement('span');
          check.className = 'genre-check';
          check.textContent = '✕';
          option.append(title, check);
          option.addEventListener('click', event => {
            event.stopPropagation();
            toggle(value);
            search.value = '';
            filter('');
          });
          options.appendChild(option);
        });
        updateUI();
        filter(search.value);
      },
      setMessage(message) {
        const element = document.createElement('div');
        element.className = 'custom-option';
        element.textContent = message;
        options.replaceChildren(element);
      },
    };
  }

  const createGenreSelect = setupCreateMultiSelect('genre', 'Genres');
  const createCollectionSelect = setupCreateMultiSelect('collection', 'Collections');
  let collectionLoadGeneration = 0;

  function initCreateGenres(mediaType) {
    createGenreSelect.reset();
    createGenreSelect.setOptions((mediaGenres[mediaType] || []).map(genre => ({ value: genre, label: genre })));
  }

  async function initCreateCollections() {
    const generation = ++collectionLoadGeneration;
    createCollectionSelect.reset();
    createCollectionSelect.setOptions([]);
    try {
      const response = await fetch('/api/collections/?options=true');
      if (!response.ok) throw new Error('Unable to load collections');
      const data = await response.json();
      if (generation !== collectionLoadGeneration) return;
      createCollectionSelect.setOptions(data.items.map(collection => ({ value: collection.id, label: collection.title })));
      if (!data.items.length) createCollectionSelect.setMessage('No collections yet.');
    } catch (error) {
      if (generation !== collectionLoadGeneration) return;
      console.error(error);
      createCollectionSelect.setMessage('Unable to load collections. Reopen the modal to try again.');
    }
  }

  const statusWrapper = document.getElementById('create-status-wrapper');
  statusWrapper.addEventListener('click', event => {
    event.stopPropagation();
    closeCreateDropdowns(statusWrapper);
    const open = !statusWrapper.classList.contains('c-open');
    statusWrapper.classList.toggle('c-open', open);
    document.getElementById('create-status-options').classList.toggle('c-open', open);
  });
  document.addEventListener('click', event => {
    if (!statusWrapper.contains(event.target)) {
      statusWrapper.classList.remove('c-open');
      document.getElementById('create-status-options').classList.remove('c-open');
    }
  });

  const creatorTagsContainer = document.getElementById("create-creator-tags");
  const creatorInput = document.getElementById("create-creator-input");

  function addCreator(name) {
    name = name.trim();
    if (name && !createCurrentCreators.includes(name)) {
      createCurrentCreators.push(name);
      renderCreatorTags();
    }
  }

  function removeCreator(name) {
    createCurrentCreators = createCurrentCreators.filter(c => c !== name);
    renderCreatorTags();
  }

  function renderCreatorTags() {
    if (!creatorTagsContainer) return;
    creatorTagsContainer.innerHTML = '';
    createCurrentCreators.forEach(creator => {
      const tag = document.createElement('div');
      tag.className = 'c-creator-tag';
      tag.innerHTML = `<span>${creator}</span><span class="c-remove-tag">✕</span>`;
      tag.querySelector('.c-remove-tag').addEventListener('click', () => {
        removeCreator(creator);
      });
      creatorTagsContainer.appendChild(tag);
    });
    
    if (creatorInput) {
      if (createCurrentCreators.length > 0) {
        creatorInput.placeholder = '';
      } else {
        creatorInput.placeholder = createCreatorPlaceholder;
      }
    }
  }

  if (creatorInput) {
    creatorInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addCreator(creatorInput.value);
        creatorInput.value = '';
      } else if (e.key === 'Backspace' && creatorInput.value === '' && createCurrentCreators.length > 0) {
        removeCreator(createCurrentCreators[createCurrentCreators.length - 1]);
      }
    });

    creatorInput.addEventListener('blur', () => {
      if (creatorInput.value.trim() !== '') {
        addCreator(creatorInput.value);
        creatorInput.value = '';
      }
    });
  }

  function updateCreateFieldVisibility(mediaType) {
    const mainGroup = document.getElementById("create_progress_main_group");
    const secondaryGroup = document.getElementById("create_progress_secondary_group");
    const lengthGroup = document.getElementById("create_length_group");
    
    if (mainGroup) mainGroup.style.display = "none";
    if (secondaryGroup) secondaryGroup.style.display = "none";
    if (lengthGroup) lengthGroup.style.display = "none";

    const mainLabel = document.getElementById("create_progress_main_label");
    const secondaryLabel = document.getElementById("create_progress_secondary_label");

    if (mediaType === "tv") {
      if (mainGroup) mainGroup.style.display = "flex";
      if (secondaryGroup) secondaryGroup.style.display = "flex";
      if (mainLabel) mainLabel.textContent = "Episode Progress";
      if (secondaryLabel) secondaryLabel.textContent = "Season Progress";
    } else if (mediaType === "movie") {
      if (lengthGroup) lengthGroup.style.display = "flex";
    } else if (mediaType === "anime") {
      if (mainGroup) mainGroup.style.display = "flex";
      if (mainLabel) mainLabel.textContent = "Episode Progress";
    } else if (mediaType === "game") {
      if (mainGroup) mainGroup.style.display = "flex";
      if (mainLabel) mainLabel.textContent = "Hours Played";
    } else if (mediaType === "manga") {
      if (mainGroup) mainGroup.style.display = "flex";
      if (secondaryGroup) secondaryGroup.style.display = "flex";
      if (mainLabel) mainLabel.textContent = "Chapter Progress";
      if (secondaryLabel) secondaryLabel.textContent = "Volume Progress";
    } else if (mediaType === "book") {
      if (mainGroup) mainGroup.style.display = "flex";
      if (mainLabel) mainLabel.textContent = "Pages Read";
    }
  }

  // Rating UI initialization
  function setupCreateRatingUI() {
    const ratingInput = document.getElementById('create_personal_rating');
    const ratingMode = document.body.dataset.ratingMode || 'faces';
    
    // Clear old dynamic UIs
    const existingDynamic = form.querySelector('.c-dynamic-rating-ui');
    if (existingDynamic) existingDynamic.remove();
    
    const ratingFaces = document.getElementById('create-rating-faces');
    ratingFaces.style.display = 'none';

    if (ratingMode === 'faces') {
      ratingFaces.style.display = 'flex';
      ratingFaces.querySelectorAll('.c-face').forEach(face => {
        face.onclick = () => {
          if (face.classList.contains('c-selected')) {
            ratingFaces.querySelectorAll('.c-face').forEach(f => f.classList.remove('c-selected'));
            ratingInput.value = '';
          } else {
            ratingFaces.querySelectorAll('.c-face').forEach(f => f.classList.remove('c-selected'));
            face.classList.add('c-selected');
            ratingInput.value = face.dataset.value;
          }
        };
      });
    } else if (ratingMode === 'stars_5') {
      const starDiv = document.createElement('div');
      starDiv.className = 'c-dynamic-rating-ui c-rating-stars';
      for (let i = 1; i <= 5; i++) {
        const star = document.createElement('span');
        star.className = 'c-star';
        star.textContent = '★';
        star.onclick = () => {
          const currentlySelected = starDiv.querySelectorAll('.c-star.c-selected').length;
          if (currentlySelected === i) {
            starDiv.querySelectorAll('.c-star').forEach(s => s.classList.remove('c-selected'));
            ratingInput.value = '';
          } else {
            ratingInput.value = i;
            starDiv.querySelectorAll('.c-star').forEach((s, idx) => {
              s.classList.toggle('c-selected', idx < i);
            });
          }
        };
        starDiv.appendChild(star);
      }
      ratingInput.parentNode.insertBefore(starDiv, ratingInput.nextSibling);
    } else {
      // 1-10 or 1-100 scale
      const numDiv = document.createElement('div');
      numDiv.className = 'c-dynamic-rating-ui c-rating-number';
      const input = document.createElement('input');
      input.type = 'number';
      input.min = 1;
      input.max = ratingMode === 'scale_10' ? 10 : 100;
      input.placeholder = ratingMode === 'scale_10' ? '1-10' : '1-100';
      input.oninput = () => { ratingInput.value = input.value; };
      numDiv.appendChild(input);
      ratingInput.parentNode.insertBefore(numDiv, ratingInput.nextSibling);
    }
  }

  // Open Modal
  openBtn.addEventListener("click", () => {
    form.reset();
    
    // Inject the correct media type so your CSS placeholder logic kicks in
    const mediaType = document.body.dataset.mediaType || "movies";
    createCreatorPlaceholder = creatorPlaceholdersMap[mediaType] || "Add creators...";
    const coverContainer = document.getElementById("create-cover-container");

    initCreateGenres(mediaType);
    initCreateCollections();
    createCurrentCreators =[];
    renderCreatorTags();

    let canonicalType = mediaType;
    if (mediaType === "movies") canonicalType = "movie";
    if (mediaType === "tvshows") canonicalType = "tv";
    if (mediaType === "games") canonicalType = "game";
    if (mediaType === "books") canonicalType = "book";
    updateCreateFieldVisibility(canonicalType);
    initCreateStatus(canonicalType);

    const bannerContainer = document.getElementById("create-banner-container");

    coverContainer.dataset.mediaType = mediaType;
    bannerContainer.dataset.mediaType = mediaType;
    
// Reset images to placeholder path, pass alt attribute for CSS and remove .has-image states
    const bannerPreview = document.getElementById("create-banner-preview");
    bannerPreview.src = "/static/core/img/placeholder.png";
    bannerPreview.alt = canonicalType; // <--- This passes the type so CSS can style it!

    document.getElementById("create-cover-preview").src = "/static/core/img/placeholder.png";
    coverContainer.classList.remove("c-has-image");
    bannerContainer.classList.remove("c-has-image");
    
    // Reset Rating Selection
    document.querySelectorAll('#create-rating-faces .c-face').forEach(f => f.classList.remove('c-selected'));
    document.getElementById('create_personal_rating').value = '';
    setupCreateRatingUI();

    modal.classList.remove("c-modal-hidden");
    overlay.classList.remove("c-modal-hidden");
    window.modalScrollLock.lock('create-item');
  });

  // Close Modal
  function closeModal() {
    collectionLoadGeneration++;
    closeCreateDropdowns();
    modal.classList.add("c-modal-hidden");
    overlay.classList.add("c-modal-hidden");
    window.modalScrollLock.unlock('create-item');
  }
  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", closeModal);

  // Handle Image Upload Previews
  function setupImagePreview(inputId, previewId, containerId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    const container = document.getElementById(containerId);

    input.addEventListener("change", function(e) {
      if (this.files && this.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
          // Setting a real image URL instantly removes your placeholder CSS behavior
          preview.src = e.target.result;
          // Add class so CSS knows to hide the plus button until hover
          container.classList.add("c-has-image");
        };
        reader.readAsDataURL(this.files[0]);
      }
    });
  }

  setupImagePreview("create-banner-input", "create-banner-preview", "create-banner-container");
  setupImagePreview("create-cover-input", "create-cover-preview", "create-cover-container");

  // Form Submission
  form.addEventListener("submit", function(e) {
    e.preventDefault();

    const formData = new FormData(form);
    
    // Append the media type dynamically derived from the page's body attribute
    const mediaType = document.body.dataset.mediaType || "movies";
    formData.append("media_type", mediaType);

    formData.append("genres", createGenreSelect.values().join(","));
    createCollectionSelect.values().forEach(id => formData.append("collections", id));
    formData.append("creators", createCurrentCreators.join(","));

    fetch("/create-custom-item/", {
      method: "POST",
      headers: {
        "X-CSRFToken": getCookie("csrftoken")
      },
      body: formData
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        closeModal();
        if (window.replaceItemElement) {
          window.replaceItemElement(data.item); 
        } else {
          window.location.reload();
        }
      } else {
        alert("Failed to create entry: " + data.error);
      }
    })
    .catch(err => {
      console.error(err);
      alert("Error saving custom item.");
    });
  });

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
});