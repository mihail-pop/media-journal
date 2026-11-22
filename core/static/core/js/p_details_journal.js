// Journal UI is loaded separately from the media galleries.
let appRatingMode = 'faces';

function rebuildCustomSelect(select) {
    const wrapper = select.parentElement;
    if (!wrapper || !wrapper.classList.contains('d-custom-select-wrapper')) return;
    
    let optionsDiv = wrapper.querySelector('.custom-options');
    if (optionsDiv) {
        optionsDiv.remove();
    }
    
    optionsDiv = document.createElement('div');
    optionsDiv.className = 'custom-options';
    
    Array.from(select.options).forEach(option => {
        const optDiv = document.createElement('div');
        optDiv.className = 'custom-option';
        optDiv.textContent = option.textContent;
        optDiv.dataset.value = option.value;
        optDiv.addEventListener('mousedown', function(e) {
            e.preventDefault();
            e.stopPropagation();
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Dynamic query to ensure we modify the *current* options div
            const currentOptions = wrapper.querySelector('.custom-options');
            if(currentOptions) currentOptions.classList.remove('open');
            
            select.blur();
        });
        optionsDiv.appendChild(optDiv);
    });
    wrapper.appendChild(optionsDiv);

    if (!select.dataset.customSelectInitialized) {
        select.dataset.customSelectInitialized = "true";
        select.addEventListener('mousedown', function(e) {
            e.preventDefault();
            const currentOptions = wrapper.querySelector('.custom-options');
            if (!currentOptions) return;
            
            const isOpen = currentOptions.classList.contains('open');
            document.querySelectorAll('.custom-options').forEach(opt => opt.classList.remove('open'));
            
            if (!isOpen && !select.disabled) {
                currentOptions.classList.add('open');
                select.focus();
            } else {
                select.blur();
            }
        });
        
        select.addEventListener('blur', function() {
            setTimeout(() => {
                const currentOptions = wrapper.querySelector('.custom-options');
                if (currentOptions) currentOptions.classList.remove('open');
            }, 150);
        });
        
        select.addEventListener('change', function() {
            select.blur();
        });
    }
}

function getRatingHtml(rating) {
  if (!rating) return '';
  const rnum = Number(rating);
  if (isNaN(rnum)) return '';

  const displayRating = window.ratingToDisplay(rnum, appRatingMode);
  if (displayRating === null) return '';
  const rounded = Math.round(rnum);
  
  let color = '#f5c518';
  if (rnum <= 33) color = '#ff3b38';
  else if (rnum <= 66) color = '#f5c518';
  else color = '#4CAF50';

  if (appRatingMode === 'faces') {
    if (rounded <= 33) {
      return `<span class="card-rating" style="color: ${color};"><svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="frown" class="svg-inline--fa fa-frown fa-w-16 fa-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160-64c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32zm-80 128c-40.2 0-78 17.7-103.8 48.6-8.5 10.2-7.1 25.3 3.1 33.8 10.2 8.4 25.3 7.1 33.8-3.1 16.6-19.9 41-31.4 66.9-31.4s50.3 11.4 66.9 31.4c8.1 9.7 23.1 11.9 33.8 3.1 10.2-8.5 11.5-23.6 3.1-33.8C326 321.7 288.2 304 248 304z"></path></svg></span>`;
    } else if (rounded <= 66) {
      return `<span class="card-rating" style="color: ${color};"><svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="meh" class="svg-inline--fa fa-meh fa-w-16 fa-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160-64c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32zm8 144H160c-13.2 0-24 10.8-24 24s10.8 24 24 24h176c13.2 0 24-10.8 24-24s-10.8-24-24-24z"></path></svg></span>`;
    } else {
      return `<span class="card-rating" style="color: ${color};"><svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="smile" class="svg-inline--fa fa-smile fa-w-16 fa-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm4 72.6c-20.8 25-51.5 39.4-84 39.4s-63.2-14.3-84-39.4c-8.5-10.2-23.7-11.5-33.8-3.1-10.2 8.5-11.5 23.6-3.1 33.8 30 36 74.1 56.6 120.9 56.6s90.9-20.6 120.9-56.6c8.5-10.2 7.1-25.3-3.1-33.8-10.1-8.4-25.3-7.1-33.8 3.1z"></path></svg></span>`;
    }
  } else if (appRatingMode === 'stars_5') {
    const starsCount = displayRating;
    let starsHtml = '<span class="card-rating"><span class="star-rating">';
    for (let i = 1; i <= 5; i++) {
      if (i <= starsCount) {
        starsHtml += '<svg class="star-icon filled" viewBox="0 0 32 32" style="color:#f5c518;"><path fill="currentColor" stroke="#000" stroke-width="1.2" d="M16 2.5l4.09 8.29 9.16 1.33-6.62 6.45 1.56 9.09L16 23.13l-8.19 4.32 1.56-9.09-6.62-6.45 9.16-1.33L16 2.5z"/></svg>';
      } else {
        starsHtml += '<svg class="star-icon empty" viewBox="0 0 32 32" style="color:#444;"><path fill="currentColor" stroke="#000" stroke-width="1.2" d="M16 2.5l4.09 8.29 9.16 1.33-6.62 6.45 1.56 9.09L16 23.13l-8.19 4.32 1.56-9.09-6.62-6.45 9.16-1.33L16 2.5z"/></svg>';
      }
    }
    starsHtml += '</span></span>';
    return starsHtml;
  } else if (appRatingMode === 'scale_10') {
    const displayVal = displayRating;
    return `<span class="card-rating" style="color: ${color}; font-weight: bold;"><span class="rating-number">${displayVal}</span></span>`;
  } else if (appRatingMode === 'scale_100') {
    return `<span class="card-rating" style="color: ${color}; font-weight: bold;"><span class="rating-number">${Math.round(rnum)}</span></span>`;
  }
  return '';
}

function populateDynamicUnits() {
    const mediaType = document.body.dataset.mediaType;
    const unitSelect = document.getElementById('log-progress-unit');
    let options = [];
    
    if (mediaType === 'movie') options = ['hour', 'minute'];
    else if (mediaType === 'tv') options = document.querySelector('.journal-section')?.dataset.seasonEntry === 'true' ? ['episode'] : ['episode', 'season'];
    else if (mediaType === 'anime') options = ['episode'];
    else if (mediaType === 'manga') options = ['chapter', 'volume'];
    else if (mediaType === 'book') options = ['page'];
    else if (mediaType === 'game') options = ['hour', 'version'];
    else if (mediaType === 'music') options = ['minute'];
    else options = ['unit'];

    unitSelect.innerHTML = '';
    options.forEach(opt => {
        unitSelect.innerHTML += `<option value="${opt}">${opt.charAt(0).toUpperCase() + opt.slice(1)}</option>`;
    });

    // If there is only one option, style it to look like a static label
    if (options.length === 1) {
        unitSelect.classList.add('single-unit');
        unitSelect.disabled = true;
    } else {
        unitSelect.classList.remove('single-unit');
        unitSelect.disabled = false;
    }
    
    // Convert to styled custom select
    rebuildCustomSelect(unitSelect);
}

function setupLogRatingUI() {
  const facesContainer = document.getElementById('log-rating-faces');
  const dynamicContainer = document.getElementById('log-dynamic-rating');
  if (!facesContainer || !dynamicContainer) return;
  
  dynamicContainer.innerHTML = '';
  facesContainer.style.display = 'none';

  window.setLogRatingValue = function(val) {
    document.getElementById('log-score').value = val;
    persistJournalDraft();
  };

  if (appRatingMode === 'faces') {
    facesContainer.style.display = 'flex';
    const faces = facesContainer.querySelectorAll('.face');
    faces.forEach(face => {
      face.onclick = () => {
        if (face.classList.contains('selected')) {
          faces.forEach(f => f.classList.remove('selected'));
          setLogRatingValue('');
        } else {
          setLogRatingValue(face.dataset.value);
          faces.forEach(f => f.classList.toggle('selected', f === face));
        }
      };
    });
  } else if (appRatingMode === 'stars_5') {
    const starDiv = document.createElement('div');
    starDiv.className = 'dynamic-rating-ui rating-stars';
    for (let i = 1; i <= 5; i++) {
      const star = document.createElement('span');
      star.className = 'star';
      star.textContent = '★';
      star.title = `${i} star${i > 1 ? 's' : ''}`;
      star.dataset.value = i;
      star.onclick = () => {
        const currentlySelected = starDiv.querySelectorAll('.star.selected').length;
        if (currentlySelected === i) {
          starDiv.querySelectorAll('.star').forEach(s => s.classList.remove('selected'));
          setLogRatingValue('');
        } else {
          setLogRatingValue(i);
          starDiv.querySelectorAll('.star').forEach((s, idx) => {
            s.classList.toggle('selected', idx < i);
          });
        }
      };
      starDiv.appendChild(star);
    }
    dynamicContainer.appendChild(starDiv);
  } else if (appRatingMode === 'scale_10' || appRatingMode === 'scale_100') {
    const numDiv = document.createElement('div');
    numDiv.className = 'dynamic-rating-ui rating-number l-rating-number';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = appRatingMode === 'scale_10' ? 1 : 1;
    input.max = appRatingMode === 'scale_10' ? 10 : 100;
    input.placeholder = appRatingMode === 'scale_10' ? 'Score (1-10)' : 'Score (1-100)';
    input.id = 'log-score-input-visible';
    
    input.oninput = () => {
      let val = input.value;
      const previous = document.getElementById('log-score').value;
      if (val === '') {
        setLogRatingValue('');
        return;
      }
      let min = parseInt(input.min);
      let max = parseInt(input.max);
      let valid = false;
      if (appRatingMode === 'scale_10') {
        valid = /^\d{1,2}$/.test(val) && Number(val) >= min && Number(val) <= max;
      } else {
        valid = /^\d{1,3}$/.test(val) && Number(val) >= min && Number(val) <= max;
      }
      
      if (valid) {
        setLogRatingValue(Number(val));
      } else {
        input.value = previous;
        setLogRatingValue(previous);
      }
    };
    numDiv.appendChild(input);
    dynamicContainer.appendChild(numDiv);
  }
}

function updateLogRatingUI(internalScore) {
  const hiddenInput = document.getElementById('log-score');
  const rnum = Number(internalScore);
  const displayVal = window.ratingToDisplay(internalScore, appRatingMode);
  hiddenInput.dataset.initialRating = displayVal === null ? '' : String(displayVal);
  
  if (displayVal === null) {
    hiddenInput.value = '';
    if (appRatingMode === 'faces') {
        document.querySelectorAll('#log-rating-faces .face').forEach(f => {
            f.classList.remove('selected');
            f.style.color = '';
        });
    } else if (appRatingMode === 'stars_5') {
        document.querySelectorAll('#log-dynamic-rating .star').forEach(s => s.classList.remove('selected'));
    } else if (appRatingMode === 'scale_10' || appRatingMode === 'scale_100') {
        const inp = document.getElementById('log-score-input-visible');
        if (inp) {
            inp.value = '';
            inp.style.color = '';
            inp.style.borderColor = '';
        }
    }
    return;
  }
  
  let color = '#f5c518';
  if (rnum <= 33) color = '#ff3b38';
  else if (rnum <= 66) color = '#f5c518';
  else color = '#4CAF50';
  
  if (appRatingMode === 'faces') {
     hiddenInput.value = displayVal;
     document.querySelectorAll('#log-rating-faces .face').forEach(f => {
         const isSelected = parseInt(f.dataset.value) === displayVal;
         f.classList.toggle('selected', isSelected);
         if (isSelected) f.style.color = color;
         else f.style.color = '';
     });
  } else if (appRatingMode === 'stars_5') {
     hiddenInput.value = displayVal;
     document.querySelectorAll('#log-dynamic-rating .star').forEach((s, idx) => {
         s.classList.toggle('selected', idx < displayVal);
     });
  } else if (appRatingMode === 'scale_10') {
     hiddenInput.value = displayVal;
     const inp = document.getElementById('log-score-input-visible');
     if (inp) {
         inp.value = displayVal;
         inp.style.color = color;
         inp.style.borderColor = color;
     }
  } else if (appRatingMode === 'scale_100') {
     hiddenInput.value = displayVal;
     const inp = document.getElementById('log-score-input-visible');
     if (inp) {
         inp.value = displayVal;
         inp.style.color = color;
         inp.style.borderColor = color;
     }
  }
}

function formatText(startTag, endTag) {
  const textarea = document.getElementById('journal-textarea');
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selectedText = text.substring(start, end);
  
  const replacement = startTag + selectedText + endTag;
  textarea.value = text.substring(0, start) + replacement + text.substring(end);
  
  textarea.dispatchEvent(new Event('input', { bubbles: true }));

  // Restore cursor position
  textarea.focus();
  if (selectedText.length > 0) {
    textarea.selectionStart = start;
    textarea.selectionEnd = start + replacement.length;
  } else {
    textarea.selectionStart = textarea.selectionEnd = start + startTag.length;
  }
}

let journalState = null;

function journalLocalDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function journalMarkup(text) {
  // Escape the source before applying our supported formatting, including entities.
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\|\|(.*?)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>')
    .replace(/\[center\]([\s\S]*?)\[\/center\]/g, '<div style="text-align:center;">$1</div>')
    .replace(/^&gt;\s?(.*?)$/gm, '<blockquote style="border-left:3px solid var(--special-color); margin:0; padding-left:10px; color:var(--text-secondary);">$1</blockquote>')
    .replace(/\n/g, '<br>');
}

function formatJournalCards() {
  const list = document.getElementById('journal-entries-list');
  list.querySelectorAll('.formatted-content:not([data-formatted])').forEach(element => {
    // The server escapes the raw text and inserts only line breaks.
    const raw = element.innerHTML.replace(/<br\s*\/?>(\r?\n)?/gi, '\n');
    const decoder = document.createElement('textarea');
    decoder.innerHTML = raw;
    element.innerHTML = journalMarkup(decoder.value.trim());
    element.dataset.formatted = 'true';
  });
  list.querySelectorAll('.entry-score:not([data-formatted])').forEach(element => {
    const score = Number(element.dataset.score);
    element.innerHTML = getRatingHtml(score);
    const pill = element.closest('.score-pill');
    if (pill) {
      const color = appRatingMode === 'stars_5' ? '#f5c518' : score <= 33 ? '#ff3b38' : score <= 66 ? '#f5c518' : '#4CAF50';
      pill.style.color = color;
      pill.style.borderColor = color;
    }
    element.dataset.formatted = 'true';
  });
  list.querySelectorAll('.unit-label').forEach(element => {
    let unit = element.dataset.unit || 'Unit';
    unit = unit.charAt(0).toUpperCase() + unit.slice(1);
    if (element.dataset.end !== '' && !unit.endsWith('s')) unit += 's';
    element.textContent = unit;
  });
}

function journalError(message = '') {
  const element = document.getElementById('journal-error');
  element.textContent = message;
  element.hidden = !message;
}

function journalNewLog() {
  return { id: null, title: '', content: '', date: journalLocalDate(), score: null,
    progress_unit: '', progress_start: '', progress_end: '', is_spoiler: false };
}

function storeJournalDraft() {
  try {
    if (journalState.drafts.notes || journalState.drafts.logs) {
      localStorage.setItem(journalState.draftKey, JSON.stringify(journalState.drafts));
    } else {
      localStorage.removeItem(journalState.draftKey);
    }
  } catch (_) { /* Writing still works if browser storage is unavailable. */ }
}

function persistJournalDraft() {
  if (!journalState || journalState.restoring || journalState.saving || !document.getElementById('journal-composer').classList.contains('expanded')) return;
  const mode = journalState.mode;
  const content = document.getElementById('journal-textarea').value;
  journalState.drafts.mode = mode;
  if (mode === 'notes') {
    journalState.drafts.notes = { content };
  } else {
    const score = document.getElementById('log-score');
    journalState.drafts.logs = {
      id: journalState.editingId, content,
      title: document.getElementById('log-title').value,
      date: document.getElementById('log-date').value,
      // Preserve the original normalized score if its displayed value is unchanged.
      score: score.value === score.dataset.initialRating ? journalState.originalScore : journalScoreToInternal(score.value),
      original_score: journalState.originalScore,
      progress_unit: document.getElementById('log-progress-unit').value,
      progress_start: document.getElementById('log-progress-start').value,
      progress_end: document.getElementById('log-progress-end').value,
      is_spoiler: document.getElementById('log-spoiler').checked,
    };
  }
  storeJournalDraft();
}

function journalScoreToInternal(value) {
  if (value === '') return null;
  const score = Number(value);
  return appRatingMode === 'scale_10' ? score * 10 : appRatingMode === 'stars_5' ? score * 20 : score;
}

function restoreJournalLog(data) {
  journalState.restoring = true;
  journalState.editingId = data.id || null;
  journalState.originalScore = data.id ? (Object.hasOwn(data, 'original_score') ? data.original_score : data.score) : null;
  document.getElementById('log-title').value = data.title ?? '';
  document.getElementById('log-date').value = data.date ?? journalLocalDate();
  populateDynamicUnits();
  const unit = document.getElementById('log-progress-unit');
  if (data.progress_unit && !Array.from(unit.options).some(option => option.value === data.progress_unit)) {
    // Existing journals may use an older unit name. Keep it when editing.
    unit.add(new Option(data.progress_unit, data.progress_unit));
    unit.disabled = false;
    unit.classList.remove('single-unit');
    rebuildCustomSelect(unit);
  }
  if (data.progress_unit) unit.value = data.progress_unit;
  document.getElementById('log-progress-start').value = data.progress_start ?? '';
  document.getElementById('log-progress-end').value = data.progress_end ?? '';
  document.getElementById('log-spoiler').checked = !!data.is_spoiler;
  updateLogRatingUI(data.score ?? '');
  const initialScore = window.ratingToDisplay(journalState.originalScore, appRatingMode);
  document.getElementById('log-score').dataset.initialRating = initialScore === null ? '' : String(initialScore);
  document.getElementById('journal-textarea').value = data.content ?? '';
  const editing = document.getElementById('journal-editing');
  editing.hidden = !journalState.editingId;
  document.getElementById('journal-editing-label').textContent = journalState.editingId ? `Editing ${data.title || 'log'}` : '';
  journalState.restoring = false;
}

function expandComposer() {
  if (!journalState) return;
  const composer = document.getElementById('journal-composer');
  if (composer.classList.contains('expanded')) return;
  composer.classList.replace('collapsed', 'expanded');
  const drafts = journalState.drafts;
  const mode = ['notes', 'logs'].includes(drafts.mode) ? drafts.mode
    : drafts.logs ? 'logs' : drafts.notes ? 'notes' : journalState.notes ? 'logs' : 'notes';
  setComposerMode(mode, false);
  setComposerTab('write');
}

function collapseComposer() {
  if (journalState.saving) return;
  delete journalState.drafts[journalState.mode];
  delete journalState.drafts.mode;
  storeJournalDraft();
  const composer = document.getElementById('journal-composer');
  composer.classList.replace('expanded', 'collapsed');
  journalError();
  journalState.editingId = null;
  document.getElementById('log-date').value = journalLocalDate();
  document.querySelector('.composer-placeholder span').textContent = journalState.drafts.notes || journalState.drafts.logs ? 'Resume writing...' : 'Start writing...';
}

function setComposerMode(mode, capture = true) {
  if (!journalState || journalState.saving || !['notes', 'logs'].includes(mode)) return;
  if (capture) persistJournalDraft();
  journalState.mode = mode;
  journalState.drafts.mode = mode;
  document.querySelectorAll('.j-tab-btn[data-mode]').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
  document.getElementById('log-extra-fields').style.display = mode === 'logs' ? 'flex' : 'none';
  document.getElementById('journal-editing').hidden = true;
  if (mode === 'notes') {
    document.getElementById('journal-textarea').value = journalState.drafts.notes?.content ?? journalState.notes;
  } else {
    restoreJournalLog(journalState.drafts.logs || journalNewLog());
  }
  journalError();
  if (document.querySelector('.j-tab-btn[data-tab="preview"]').classList.contains('active')) setComposerTab('preview');
}

function setComposerTab(tab) {
  const preview = tab === 'preview';
  document.querySelectorAll('.j-tab-btn[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  const textarea = document.getElementById('journal-textarea');
  textarea.style.display = preview ? 'none' : 'block';
  document.getElementById('composer-toolbar').style.display = preview ? 'none' : 'flex';
  const area = document.getElementById('journal-preview');
  area.style.display = preview ? 'block' : 'none';
  if (preview) area.innerHTML = journalMarkup(textarea.value) || '<span style="color:var(--text-overview)">Nothing to preview.</span>';
  else textarea.focus();
}

async function editJournalEntry(type, id = null) {
  if (journalState.saving) return;
  try {
    let log;
    if (type === 'logs') {
      log = journalState.logs.get(Number(id));
      if (!log) {
        const response = await fetch(`/api/journal/${journalState.itemId}/?log_id=${encodeURIComponent(id)}`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Unable to open this log.');
        log = data.log;
      }
    }
    persistJournalDraft();
    if (type === 'notes') journalState.drafts.notes ??= { content: journalState.notes };
    else if (Number(journalState.drafts.logs?.id) !== Number(id)) journalState.drafts.logs = { ...log };
    document.getElementById('journal-composer').classList.replace('collapsed', 'expanded');
    setComposerMode(type, false);
    setComposerTab('write');
    persistJournalDraft();
    document.getElementById('journal-composer').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    alert(error.message);
  }
}

function startNewJournalLog() {
  if (journalState.saving) return;
  journalState.drafts.logs = journalNewLog();
  setComposerMode('logs', false);
  setComposerTab('write');
  persistJournalDraft();
}

async function saveJournalEntry() {
  if (journalState.saving) return;
  persistJournalDraft();
  const mode = journalState.mode;
  const draft = journalState.drafts[mode];
  const content = document.getElementById('journal-textarea').value;
  const payload = mode === 'notes' ? { notes: content } : {
    action: 'save', item_id: journalState.itemId, log_id: draft.id, content,
    title: draft.title.trim(), activity_date: draft.date,
    score: document.getElementById('log-score').value,
    progress_unit: draft.progress_unit, progress_start: draft.progress_start,
    progress_end: draft.progress_end, is_spoiler: draft.is_spoiler,
  };
  const score = document.getElementById('log-score');
  if (mode === 'logs' && draft.id && score.value === score.dataset.initialRating) delete payload.score;
  journalState.saving = true;
  const button = document.getElementById('j-btn-save');
  button.disabled = true;
  button.textContent = 'Saving...';
  document.getElementById('journal-composer').classList.add('journal-saving');
  const fields = Array.from(document.querySelectorAll('#journal-composer input, #journal-composer textarea, #journal-composer select, #journal-composer button'));
  const disabledFields = fields.map(field => field.disabled);
  fields.forEach(field => { field.disabled = true; });
  journalError();
  try {
    const url = mode === 'notes' ? `/edit-item/${journalState.itemId}/` : '/api/manage-journal-log/';
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') }, body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save this journal entry.');
    delete journalState.drafts[mode];
    delete journalState.drafts.mode;
    storeJournalDraft();
    sessionStorage.setItem('refreshSuccess', '1');
    location.reload();
  } catch (error) {
    journalError(error.message);
    journalState.saving = false;
    fields.forEach((field, index) => { field.disabled = disabledFields[index]; });
    button.disabled = false;
    button.textContent = 'Save';
    document.getElementById('journal-composer').classList.remove('journal-saving');
  }
}

function openDeleteLogModal(id) {
  if (journalState.saving || journalState.deletingId) return;
  journalState.deletingId = id;
  journalState.deleteFocus = document.activeElement;
  const panel = document.getElementById('delete-log-modal');
  document.body.appendChild(panel);
  window.modalScrollLock.lock('journal-delete');
  panel.hidden = false;
  panel.querySelector('button').focus({ preventScroll: true });
}

function closeDeleteLogModal() {
  if (journalState.deleting) return;
  journalState.deletingId = null;
  document.getElementById('delete-log-modal').hidden = true;
  window.modalScrollLock.unlock('journal-delete');
  journalState.deleteFocus?.focus({ preventScroll: true });
  journalState.deleteFocus = null;
}

function journalMoreButton() {
  const wrapper = document.getElementById('j-show-more-wrapper');
  wrapper.style.display = journalState.hasMore || journalState.page > 1 ? '' : 'none';
  document.getElementById('j-show-more-btn').textContent = journalState.hasMore ? `Show More (${journalState.remaining})` : 'Show Less';
}

async function loadJournalPage(append = false) {
  journalState.request?.abort();
  const controller = new AbortController();
  journalState.request = controller;
  const params = new URLSearchParams({
    search: document.getElementById('j-search').value.trim(),
    sort: document.getElementById('j-sort-select').value,
    direction: document.getElementById('j-order-toggle').dataset.order,
    page: append ? journalState.page + 1 : 1,
  });
  const button = document.getElementById('j-show-more-btn');
  button.disabled = true;
  try {
    const response = await fetch(`/api/journal/${journalState.itemId}/?${params}`, { signal: controller.signal });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load journal entries.');
    if (journalState.request !== controller) return;
    const list = document.getElementById('journal-entries-list');
    if (append) list.insertAdjacentHTML('beforeend', data.html);
    else {
      list.innerHTML = data.html;
      journalState.logs.clear();
    }
    data.logs.forEach(log => journalState.logs.set(log.id, log));
    journalState.page = data.page;
    journalState.hasMore = data.has_more;
    journalState.remaining = data.remaining;
    formatJournalCards();
    journalMoreButton();
  } catch (error) {
    if (error.name !== 'AbortError') alert(error.message);
  } finally {
    if (journalState.request === controller) {
      journalState.request = null;
      button.disabled = false;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('.journal-section');
  if (!root) return;
  appRatingMode = root.dataset.ratingMode || 'faces';
  const wrapper = document.getElementById('j-show-more-wrapper');
  journalState = {
    itemId: document.body.dataset.dbId, notes: JSON.parse(document.getElementById('raw-notes-data').textContent),
    logs: new Map(JSON.parse(document.getElementById('journal-log-data').textContent).map(log => [log.id, log])),
    page: 1, hasMore: wrapper.dataset.hasMore === 'true', remaining: Number(wrapper.dataset.remaining),
    mode: null, editingId: null, originalScore: null, drafts: { version: 1 },
    saving: false, restoring: false, request: null, deletingId: null, deleting: false, deleteFocus: null,
  };
  journalState.draftKey = `journalDraft:${journalState.itemId}`;
  try {
    const saved = JSON.parse(localStorage.getItem(journalState.draftKey));
    if (saved?.version === 1) journalState.drafts = saved;
  } catch (_) { /* A missing or invalid draft should not prevent editing. */ }
  if (journalState.drafts.notes || journalState.drafts.logs) document.querySelector('.composer-placeholder span').textContent = 'Resume writing...';
  setupLogRatingUI();
  document.querySelectorAll('.d-custom-select-wrapper select').forEach(rebuildCustomSelect);
  formatJournalCards();
  journalMoreButton();

  const list = document.getElementById('journal-entries-list');
  const viewButton = document.getElementById('j-view-toggle');
  function updateViewButton() {
    const grid = list.classList.contains('grid-view');
    viewButton.title = grid ? 'List View' : 'Grid View';
    viewButton.innerHTML = grid
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';
  }
  updateViewButton();
  viewButton.addEventListener('click', () => {
    list.classList.toggle('grid-view');
    try { localStorage.setItem('journalView', list.classList.contains('grid-view') ? 'grid' : 'list'); } catch (_) {}
    updateViewButton();
  });
  let searchTimer;
  document.getElementById('j-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    journalState.request?.abort();
    journalState.request = null;
    document.getElementById('j-show-more-btn').disabled = true;
    searchTimer = setTimeout(() => loadJournalPage(), 220);
  });
  document.getElementById('j-sort-select').addEventListener('change', () => {
    clearTimeout(searchTimer);
    loadJournalPage();
  });
  document.getElementById('j-order-toggle').addEventListener('click', event => {
    clearTimeout(searchTimer);
    const button = event.currentTarget;
    button.dataset.order = button.dataset.order === 'desc' ? 'asc' : 'desc';
    button.title = button.dataset.order === 'asc' ? 'Sort ascending' : 'Sort descending';
    button.setAttribute('aria-label', button.title);
    loadJournalPage();
  });
  document.getElementById('j-show-more-btn').addEventListener('click', () => loadJournalPage(journalState.hasMore));
  const composer = document.getElementById('journal-composer');
  composer.addEventListener('input', persistJournalDraft);
  composer.addEventListener('change', persistJournalDraft);
  window.addEventListener('pagehide', persistJournalDraft);
  const deletePanel = document.getElementById('delete-log-modal');
  document.addEventListener('keydown', event => {
    if (deletePanel.hidden) return;
    event.stopImmediatePropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDeleteLogModal();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const buttons = Array.from(deletePanel.querySelectorAll('button:not(:disabled)'));
      if (buttons.length) {
        const current = buttons.indexOf(document.activeElement);
        const next = (current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next].focus();
      }
    }
  }, true);
  document.getElementById('confirm-delete-log-btn').addEventListener('click', async event => {
    const id = journalState.deletingId;
    if (!id || journalState.deleting) return;
    journalState.deleting = true;
    const button = event.currentTarget;
    deletePanel.querySelectorAll('button').forEach(control => { control.disabled = true; });
    button.textContent = 'Deleting...';
    persistJournalDraft();
    try {
      const response = await fetch('/api/manage-journal-log/', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
        body: JSON.stringify({ action: 'delete', item_id: journalState.itemId, log_id: id }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to delete this log.');
      if (Number(journalState.drafts.logs?.id) === Number(id)) {
        // Keep unsaved text from a deleted log as a new draft, rather than lose it.
        journalState.drafts.logs.id = null;
        storeJournalDraft();
      }
      journalState.saving = true;
      sessionStorage.setItem('refreshSuccess', '1');
      location.reload();
    } catch (error) {
      showNotification(error.message, 'warning');
      journalState.deleting = false;
      deletePanel.querySelectorAll('button').forEach(control => { control.disabled = false; });
      button.textContent = 'Delete';
      closeDeleteLogModal();
    }
  });
});

