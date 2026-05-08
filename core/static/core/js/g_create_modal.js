document.addEventListener("DOMContentLoaded", function () {
  const modal = document.getElementById("create-modal");
  const overlay = document.getElementById("create-overlay");
  const openBtn = document.getElementById("open-create-modal-btn");
  const closeBtn = document.getElementById("create-close-btn");
  const form = document.getElementById("create-form");
  let scrollY = 0;

  if (!openBtn || !modal) return;

  // Rating UI initialization
  function setupCreateRatingUI() {
    const ratingInput = document.getElementById('create_personal_rating');
    const ratingMode = document.body.dataset.ratingMode || 'faces';
    
    // Clear old dynamic UIs
    const existingDynamic = form.querySelector('.dynamic-rating-ui');
    if (existingDynamic) existingDynamic.remove();
    
    const ratingFaces = document.getElementById('create-rating-faces');
    ratingFaces.style.display = 'none';

    if (ratingMode === 'faces') {
      ratingFaces.style.display = 'flex';
      ratingFaces.querySelectorAll('.face').forEach(face => {
        face.onclick = () => {
          if (face.classList.contains('selected')) {
            ratingFaces.querySelectorAll('.face').forEach(f => f.classList.remove('selected'));
            ratingInput.value = '';
          } else {
            ratingFaces.querySelectorAll('.face').forEach(f => f.classList.remove('selected'));
            face.classList.add('selected');
            ratingInput.value = face.dataset.value;
          }
        };
      });
    } else if (ratingMode === 'stars_5') {
      const starDiv = document.createElement('div');
      starDiv.className = 'dynamic-rating-ui rating-stars';
      for (let i = 1; i <= 5; i++) {
        const star = document.createElement('span');
        star.className = 'star';
        star.textContent = '★';
        star.onclick = () => {
          const currentlySelected = starDiv.querySelectorAll('.star.selected').length;
          if (currentlySelected === i) {
            starDiv.querySelectorAll('.star').forEach(s => s.classList.remove('selected'));
            ratingInput.value = '';
          } else {
            ratingInput.value = i;
            starDiv.querySelectorAll('.star').forEach((s, idx) => {
              s.classList.toggle('selected', idx < i);
            });
          }
        };
        starDiv.appendChild(star);
      }
      ratingInput.parentNode.insertBefore(starDiv, ratingInput.nextSibling);
    } else {
      // 1-10 or 1-100 scale
      const numDiv = document.createElement('div');
      numDiv.className = 'dynamic-rating-ui rating-number';
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
    const coverContainer = document.getElementById("create-cover-container");
    const bannerContainer = document.getElementById("create-banner-container");

    coverContainer.dataset.mediaType = mediaType;
    bannerContainer.dataset.mediaType = mediaType;
    
    // Reset images to placeholder path and remove .has-image states
    document.getElementById("create-banner-preview").src = "/static/core/img/placeholder.png";
    document.getElementById("create-cover-preview").src = "/static/core/img/placeholder.png";
    coverContainer.classList.remove("has-image");
    bannerContainer.classList.remove("has-image");
    
    // Reset Rating Selection
    document.querySelectorAll('#create-rating-faces .face').forEach(f => f.classList.remove('selected'));
    document.getElementById('create_personal_rating').value = '';
    setupCreateRatingUI();

    modal.classList.remove("modal-hidden");
    overlay.classList.remove("modal-hidden");
    scrollY = window.scrollY;
    document.body.style.top = `-${scrollY}px`;
    document.body.classList.add("modal-open");
    document.documentElement.classList.add("modal-open");
  });

  // Close Modal
  function closeModal() {
    modal.classList.add("modal-hidden");
    overlay.classList.add("modal-hidden");
    document.body.classList.remove("modal-open");
    document.documentElement.classList.remove("modal-open");
    document.body.style.top = "";
    window.scrollTo(0, scrollY);
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
          container.classList.add("has-image");
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