document.addEventListener("DOMContentLoaded", function () {
  const modal = document.getElementById("metadata-modal");
  const overlay = document.getElementById("metadata-overlay");
  const closeBtn = document.getElementById("metadata-close-btn");
  const form = document.getElementById("metadata-form");
  let scrollY = 0;
  let currentItemId = null;

  if (!modal) return;

  const mediaGenres = {
    movie:["Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance", "Science Fiction", "TV Movie", "Thriller", "War", "Western"],
    tv:["Action & Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Kids", "Mystery", "News", "Reality", "Sci-Fi & Fantasy", "Soap", "Talk", "War & Politics", "Western"],
    anime:["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mahou Shoujo", "Mecha", "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"],
    manga:["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mahou Shoujo", "Mecha", "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"],
    game:["Adventure", "Arcade", "Card & Board Game", "Fighting", "Hack and slash/Beat 'em up", "Indie", "MOBA", "Music", "Pinball", "Platform", "Point-and-click", "Puzzle", "Quiz/Trivia", "Racing", "Real Time Strategy (RTS)", "Role-playing (RPG)", "Shooter", "Simulator", "Sport", "Strategy", "Tactical", "Turn-based strategy (TBS)", "Visual Novel"],
    book:["Action & Adventure Fiction", "Biography", "Classics", "Fantasy", "Historical Fiction", "History", "Horror", "Mystery", "Non-fiction", "Poetry", "Romance", "Science Fiction", "Thriller", "Young Adult"],
    music:["Alternative", "Blues", "Classical", "Country", "Electronic", "Folk", "Hip Hop", "Indie", "Jazz", "Metal", "Pop", "Punk", "R&B", "Reggae", "Rock", "Soul"]
  };

  let metadataCurrentGenres =[];
  let metadataCurrentCreators =[];
  let metadataCreatorPlaceholder = "Add creator...";

  const creatorPlaceholdersMap = {
      movies: "Add directors...", movie: "Add directors...",
      tvshows: "Add directors...", tv: "Add directors...",
      anime: "Add studios...",
      manga: "Add authors...", books: "Add authors...", book: "Add authors...",
      games: "Add developers...", game: "Add developers...",
      music: "Add artists..."
  };

  const genreWrapper = document.getElementById("metadata-genre-wrapper");
  const genreSearch = document.getElementById("metadata-genre-search");
  const genreOptions = document.getElementById("metadata-genre-options");
  const genreTags = document.getElementById("metadata-genre-tags");
  const genreIndicator = document.getElementById("metadata-genre-indicator");

  function initMetadataGenres(mediaType) {
    if (genreOptions) {
      genreOptions.innerHTML = "";
      updateMetadataGenreUI();

      const availableGenres = mediaGenres[mediaType] ||[];
      availableGenres.forEach(genre => {
        const option = document.createElement('div');
        option.className = 'md-custom-option md-genre-option';
        option.dataset.value = genre;
        option.innerHTML = `<span>${genre}</span><span class="md-genre-check">✕</span>`;
        
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleMetadataGenre(genre);
          if (genreSearch) {
            genreSearch.value = '';
            filterMetadataGenreOptions('');
          }
        });
        genreOptions.appendChild(option);
      });
      // Initial render for pre-filled genres
      updateMetadataGenreUI();
    }
  }

  function toggleMetadataGenre(genre) {
    if (metadataCurrentGenres.includes(genre)) {
      metadataCurrentGenres = metadataCurrentGenres.filter(g => g !== genre);
    } else {
      metadataCurrentGenres.push(genre);
    }
    updateMetadataGenreUI();
  }

  function updateMetadataGenreUI() {
    if (!genreTags) return;
    genreTags.innerHTML = '';
    metadataCurrentGenres.forEach(genre => {
      const tag = document.createElement('div');
      tag.className = 'md-genre-tag';
      tag.innerHTML = `<span>${genre}</span><span class="md-remove-tag">✕</span>`;
      tag.querySelector('.md-remove-tag').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMetadataGenre(genre);
      });
      genreTags.appendChild(tag);
    });

    if (genreOptions) {
      const options = genreOptions.querySelectorAll('.md-genre-option');
      options.forEach(opt => {
        if (metadataCurrentGenres.includes(opt.dataset.value)) {
          opt.classList.add('md-selected');
        } else {
          opt.classList.remove('md-selected');
        }
      });
    }

    if (genreSearch && genreWrapper) {
      if (metadataCurrentGenres.length > 0) {
        genreSearch.placeholder = '';
        genreWrapper.classList.add('md-has-items');
      } else {
        genreSearch.placeholder = 'Genres';
        genreWrapper.classList.remove('md-has-items');
      }
    }
  }

  if (genreWrapper) {
    genreWrapper.addEventListener('click', () => {
      if (genreOptions) genreOptions.classList.add('md-open');
      genreWrapper.classList.add('md-open');
      if (genreSearch) genreSearch.focus();
    });

    document.addEventListener('click', (e) => {
      if (!genreWrapper.contains(e.target)) {
        if (genreOptions) genreOptions.classList.remove('md-open');
        genreWrapper.classList.remove('md-open');
      }
    });

    if (genreIndicator) {
      genreIndicator.addEventListener('click', (e) => {
        e.stopPropagation();
        if (metadataCurrentGenres.length > 0) {
          metadataCurrentGenres =[];
          updateMetadataGenreUI();
          if (genreOptions) genreOptions.classList.remove('md-open');
          genreWrapper.classList.remove('md-open');
        } else {
          if (genreOptions && genreOptions.classList.contains('md-open')) {
            genreOptions.classList.remove('md-open');
            genreWrapper.classList.remove('md-open');
          } else {
            if (genreOptions) genreOptions.classList.add('md-open');
            genreWrapper.classList.add('md-open');
            if (genreSearch) genreSearch.focus();
          }
        }
      });
    }

    if (genreSearch) {
      genreSearch.addEventListener('input', (e) => {
        filterMetadataGenreOptions(e.target.value);
      });

      genreSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
        }
        if (e.key === 'Backspace' && e.target.value === '' && metadataCurrentGenres.length > 0) {
          toggleMetadataGenre(metadataCurrentGenres[metadataCurrentGenres.length - 1]);
        }
      });
    }
  }

  function filterMetadataGenreOptions(query) {
    if (!genreOptions) return;
    const q = query.toLowerCase();
    const options = genreOptions.querySelectorAll('.md-genre-option');
    options.forEach(opt => {
      if (opt.dataset.value.toLowerCase().includes(q)) {
        opt.classList.remove('md-hidden');
      } else {
        opt.classList.add('md-hidden');
      }
    });
  }

  const creatorTagsContainer = document.getElementById("metadata-creator-tags");
  const creatorInput = document.getElementById("metadata-creator-input");

  function addCreator(name) {
    name = name.trim();
    if (name && !metadataCurrentCreators.includes(name)) {
      metadataCurrentCreators.push(name);
      renderMetadataCreatorTags();
    }
  }

  function removeCreator(name) {
    metadataCurrentCreators = metadataCurrentCreators.filter(c => c !== name);
    renderMetadataCreatorTags();
  }

  function renderMetadataCreatorTags() {
    if (!creatorTagsContainer) return;
    creatorTagsContainer.innerHTML = '';
    metadataCurrentCreators.forEach(creator => {
      const tag = document.createElement('div');
      tag.className = 'md-creator-tag';
      tag.innerHTML = `<span>${creator}</span><span class="md-remove-tag">✕</span>`;
      tag.querySelector('.md-remove-tag').addEventListener('click', () => {
        removeCreator(creator);
      });
      creatorTagsContainer.appendChild(tag);
    });
    
    if (creatorInput) {
      if (metadataCurrentCreators.length > 0) {
        creatorInput.placeholder = '';
      } else {
        creatorInput.placeholder = metadataCreatorPlaceholder;
      }
    }
  }

  if (creatorInput) {
    creatorInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addCreator(creatorInput.value);
        creatorInput.value = '';
      } else if (e.key === 'Backspace' && creatorInput.value === '' && metadataCurrentCreators.length > 0) {
        removeCreator(metadataCurrentCreators[metadataCurrentCreators.length - 1]);
      }
    });

    creatorInput.addEventListener('blur', () => {
      if (creatorInput.value.trim() !== '') {
        addCreator(creatorInput.value);
        creatorInput.value = '';
      }
    });
  }

  function updateMetadataFieldVisibility(mediaType) {
    const mainGroup = document.getElementById("metadata_progress_main_group");
    const secondaryGroup = document.getElementById("metadata_progress_secondary_group");
    const progressRow2 = document.getElementById("metadata-progress-row-2");
    
    if (mainGroup) mainGroup.style.display = "none";
    if (secondaryGroup) secondaryGroup.style.display = "none";
    if (progressRow2) progressRow2.style.display = "none";

    const mainLabel = document.getElementById("metadata_progress_main_label");
    const secondaryLabel = document.getElementById("metadata_progress_secondary_label");

    if (mediaType === "tv") {
      if (mainGroup) mainGroup.style.display = "flex";
      if (secondaryGroup) secondaryGroup.style.display = "flex";
      if (progressRow2) progressRow2.style.display = "flex";
      if (mainLabel) mainLabel.textContent = "Episode Progress";
      if (secondaryLabel) secondaryLabel.textContent = "Season Progress";
    } else if (mediaType === "anime") {
      if (mainGroup) mainGroup.style.display = "flex";
      if (mainLabel) mainLabel.textContent = "Episode Progress";
    } else if (mediaType === "game") {
      if (mainGroup) mainGroup.style.display = "flex";
      if (mainLabel) mainLabel.textContent = "Hours Played";
    } else if (mediaType === "manga") {
      if (mainGroup) mainGroup.style.display = "flex";
      if (secondaryGroup) secondaryGroup.style.display = "flex";
      if (progressRow2) progressRow2.style.display = "flex";
      if (mainLabel) mainLabel.textContent = "Chapter Progress";
      if (secondaryLabel) secondaryLabel.textContent = "Volume Progress";
    } else if (mediaType === "book") {
      if (mainGroup) mainGroup.style.display = "flex";
      if (mainLabel) mainLabel.textContent = "Pages Read";
    }
  }

  window.openMetadataModal = function(itemId) {
    currentItemId = itemId;
    form.reset();
    
    // Reset file inputs visually
    const bannerPreview = document.getElementById("metadata-banner-preview");
    bannerPreview.src = "/static/core/img/placeholder.png";
    document.getElementById("metadata-cover-preview").src = "/static/core/img/placeholder.png";
    document.getElementById("metadata-banner-container").classList.remove("md-has-image");
    document.getElementById("metadata-cover-container").classList.remove("md-has-image");

    // Close settings dropdown if open
    const dropdown = document.getElementById('settingsDropdown');
    if (dropdown) dropdown.style.display = 'none';

    fetch(`/get-item/${itemId}/`)
      .then(res => res.json())
      .then(data => {
        if (!data.success) return alert("Failed to load item metadata");
        const item = data.item;

        let canonicalType = item.media_type;
        const bodyType = document.body.dataset.mediaType || "movies"; // plural form mapping for genres
        metadataCreatorPlaceholder = creatorPlaceholdersMap[bodyType] || "Add creators...";
        
        // Feed canonical type into alt element so preview positioning is accurate!
        bannerPreview.alt = canonicalType;

        document.getElementById("metadata-cover-container").dataset.mediaType = bodyType;
        document.getElementById("metadata-banner-container").dataset.mediaType = bodyType;

        // Populate fields
        document.getElementById("metadata-title-input").value = item.title || "";
        document.getElementById("metadata-overview").value = item.overview || "";
        
        // Populate date carefully
        if (item.release_date) {
            document.getElementById("metadata-release-date").value = item.release_date;
        }

        // Setup Images
        if (item.cover_url) {
            document.getElementById("metadata-cover-preview").src = item.cover_url;
            document.getElementById("metadata-cover-container").classList.add("md-has-image");
        }
        if (item.banner_url) {
            document.getElementById("metadata-banner-preview").src = item.banner_url;
            document.getElementById("metadata-banner-container").classList.add("md-has-image");
        }

        // Arrays for Genres & Creators
        metadataCurrentGenres = item.genres ||[];
        metadataCurrentCreators = item.creators ||[];
        initMetadataGenres(bodyType);
        renderMetadataCreatorTags();

        // Progress variables mapping
        updateMetadataFieldVisibility(canonicalType);
        document.getElementById("metadata_progress_main").value = item.progress_main ?? "";
        document.getElementById("metadata_total_main").value = item.total_main ?? "";
        document.getElementById("metadata_progress_secondary").value = item.progress_secondary ?? "";
        document.getElementById("metadata_total_secondary").value = item.total_secondary ?? "";

        // Show Modal
        modal.classList.remove("md-modal-hidden");
        overlay.classList.remove("md-modal-hidden");
        scrollY = window.scrollY;
        document.body.style.top = `-${scrollY}px`;
        document.body.classList.add("md-modal-open");
        document.documentElement.classList.add("md-modal-open");
      })
      .catch(err => {
        console.error(err);
        alert("Error loading item metadata.");
      });
  };

  // Close Modal
  function closeModal() {
    modal.classList.add("md-modal-hidden");
    overlay.classList.add("md-modal-hidden");
    document.body.classList.remove("md-modal-open");
    document.documentElement.classList.remove("md-modal-open");
    document.body.style.top = "";
    window.scrollTo(0, scrollY);
    currentItemId = null;
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
          preview.src = e.target.result;
          container.classList.add("md-has-image");
        };
        reader.readAsDataURL(this.files[0]);
      }
    });
  }

  setupImagePreview("metadata-banner-input", "metadata-banner-preview", "metadata-banner-container");
  setupImagePreview("metadata-cover-input", "metadata-cover-preview", "metadata-cover-container");

  // Form Submission
  form.addEventListener("submit", function(e) {
    e.preventDefault();
    if (!currentItemId) return;

    const formData = new FormData(form);
    
    // Inject genres and creators manually since they are customized components
    formData.append("genres", metadataCurrentGenres.join(","));
    formData.append("creators", metadataCurrentCreators.join(","));

    const submitBtn = form.querySelector('.md-save-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    fetch(`/edit-metadata/${currentItemId}/`, {
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
        sessionStorage.setItem("refreshSuccess", "1");
        window.location.reload();
      } else {
        alert("Failed to update metadata: " + data.error);
        submitBtn.disabled = false;
        submitBtn.textContent = "Save";
      }
    })
    .catch(err => {
      console.error(err);
      alert("Error saving metadata.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Save";
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