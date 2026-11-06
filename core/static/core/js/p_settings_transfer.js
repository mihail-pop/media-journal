document.addEventListener('DOMContentLoaded', () => {
  const panel = document.getElementById('transfer');
  if (!panel) return;
  const byId = id => document.getElementById(id);
  const storage = { import: 'mj_csv_import', export: 'mj_csv_export' };
  const ids = { import: null, export: null };
  const timers = {};
  const downloadOnFinish = new Set();
  const working = new Set();
  let completedExport = null;
  let current = null;
  let mappedJob = null;
  let valuesJob = null;
  let page = 1;
  let pageHasMore = false;
  let reviewRequest = 0;
  const types = { movie: 'Movies', tv: 'TV Shows', anime: 'Anime', manga: 'Manga', game: 'Games', book: 'Books', music: 'Music' };
  const statuses = { planned: 'Planned', ongoing: 'Ongoing', completed: 'Completed', on_hold: 'Paused', dropped: 'Dropped' };

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function options(select, choices, empty) {
    select.replaceChildren();
    if (empty !== undefined) select.add(new Option(empty, ''));
    Object.entries(choices).forEach(([value, label]) => select.add(new Option(label, value)));
  }
  options(byId('transfer-media-type'), types, 'Choose / use mapped column');
  options(byId('transfer-default-status'), statuses);

  async function request(url, data) {
    const response = await fetch(url, data === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') }, body: JSON.stringify(data),
    });
    let result;
    try { result = await response.json(); } catch (_) { throw new Error('The server could not complete the request.'); }
    if (!response.ok || (result.error && !result.state)) {
      const problem = new Error(result.error || 'Transfer request failed.');
      problem.status = response.status;
      throw problem;
    }
    return result;
  }
  const endpoint = (identity, suffix) => `/settings/transfer/${encodeURIComponent(identity)}/${suffix}/`;
  const action = data => request(endpoint(ids.import, 'action'), data);
  function error(type, problem) {
    const area = byId(`transfer-${type}-progress`);
    area.hidden = false;
    area.classList.add('is-error');
    area.replaceChildren(node('p', problem.message || String(problem)));
  }
  async function guarded(button, operation, type = 'import') {
    button.disabled = true;
    try { await operation(); } catch (problem) { error(type, problem); }
    finally { button.disabled = false; syncStartButtons(); }
  }
  function syncStartButtons() {
    panel.querySelectorAll('[data-transfer-start]').forEach(element => {
      element.disabled = working.size > 0 || (element.id === 'transfer-import-matches' && !current?.counts.ready);
    });
  }
  function remember(type, identity) {
    ids[type] = identity;
    try { localStorage.setItem(storage[type], identity); } catch (_) {}
  }
  function button(text, handler, type = 'import') {
    const result = node('button', text, 'backup-btn');
    result.type = 'button';
    result.addEventListener('click', () => guarded(result, handler, type));
    return result;
  }

  function progress(type, task) {
    if (['running', 'pausing'].includes(task.state)) working.add(type);
    else working.delete(type);
    syncStartButtons();
    const area = byId(`transfer-${type}-progress`);
    area.hidden = false;
    area.classList.toggle('is-error', Boolean(task.error));
    const track = node('div', undefined, 'transfer-track');
    const bar = node('div', undefined, 'transfer-bar');
    const ratio = task.total ? Math.min(100, task.processed / task.total * 100) : 0;
    bar.style.width = `${ratio}%`;
    track.appendChild(bar);
    let detail = `${task.processed.toLocaleString()}${task.total ? ' / ' + task.total.toLocaleString() : ''} items`;
    if (task.state === 'running' || task.state === 'pausing') {
      const elapsed = Math.max(0, Math.floor(Date.now() / 1000 - (task.config.started_at || task.created)));
      detail += ` · ${Math.floor(elapsed / 60)}m ${elapsed % 60}s elapsed`;
      if (task.total && task.processed > 0 && task.processed < task.total) {
        const remaining = Math.round(elapsed * (task.total - task.processed) / task.processed);
        detail += ` · about ${Math.floor(remaining / 60)}m ${remaining % 60}s left`;
      }
    }
    area.replaceChildren(track, node('p', task.message || task.phase), node('p', detail));
    if (task.error) area.appendChild(node('p', task.error));
    const actions = byId(`transfer-${type}-actions`);
    actions.replaceChildren();
    if (task.state === 'running' || task.state === 'pausing') {
      const pause = button(task.state === 'pausing' ? 'Pausing…' : 'Pause', async () => {
        await request(endpoint(task.id, 'action'), { action: 'pause' });
        await poll(type, task.id);
      }, type);
      pause.disabled = task.state === 'pausing';
      actions.appendChild(pause);
    } else if (task.state === 'paused' || (task.state === 'error' && task.phase === 'export')) {
      actions.appendChild(button('Resume', async () => {
        await request(endpoint(task.id, 'action'), { action: 'resume' });
        if (type === 'export') downloadOnFinish.add(task.id);
        await poll(type, task.id);
      }, type));
    } else if (type === 'import' && task.state === 'error' && task.phase === 'match' && !task.counts.imported) {
      actions.appendChild(button('Change Column Mapping', async () => {
        buildMapping(task);
        byId('transfer-mapping').hidden = false;
      }));
    }
    if (type === 'export' && task.state === 'completed') {
      const download = node('a', 'Download CSV', 'backup-btn');
      download.href = endpoint(task.id, 'download');
      actions.appendChild(download);
    }
  }

  function clearExportResult() {
    clearTimeout(timers.export);
    ids.export = completedExport = null;
    working.delete('export');
    byId('transfer-export-progress').hidden = true;
    byId('transfer-export-actions').replaceChildren();
    syncStartButtons();
  }

  // Clear the result before a browser can keep this page in its back/forward cache.
  window.addEventListener('pagehide', () => {
    if (completedExport && ids.export === completedExport) clearExportResult();
  });

  async function poll(type, identity, restoring = false) {
    clearTimeout(timers[type]);
    if (ids[type] !== identity) return;
    try {
      const task = await request(endpoint(identity, 'status'));
      if (ids[type] !== identity) return;
      if (type === 'export' && task.state === 'completed') {
        completedExport = identity;
        try {
          if (localStorage.getItem(storage.export) === identity) localStorage.removeItem(storage.export);
        } catch (_) {}
        if (restoring) { clearExportResult(); return; }
      }
      progress(type, task);
      if (type === 'export' && task.state === 'completed' && downloadOnFinish.delete(identity)) {
        window.location.href = endpoint(identity, 'download');
      }
      if (type === 'import') {
        current = task;
        await renderImport(task);
      }
      if (['running', 'pausing'].includes(task.state)) timers[type] = setTimeout(() => poll(type, identity), 1000);
    } catch (problem) {
      if (ids[type] !== identity) return;
      error(type, problem);
      if ([400, 404].includes(problem.status)) {
        working.delete(type);
        syncStartButtons();
        return;
      }
      // A server restart/network interruption must not make a running transfer disappear.
      timers[type] = setTimeout(() => poll(type, identity, restoring), 5000);
    }
  }

  byId('transfer-export-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    guarded(form.querySelector('button'), async () => {
      const mediaTypes = Array.from(form.querySelectorAll('input:checked'), input => input.value);
      const result = await request('/settings/transfer/export/', { media_types: mediaTypes });
      remember('export', result.job_id);
      downloadOnFinish.add(result.job_id);
      await poll('export', result.job_id);
    }, 'export');
  });

  byId('transfer-upload-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    guarded(form.querySelector('button'), () => new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const area = byId('transfer-import-progress');
      area.hidden = false;
      area.classList.remove('is-error');
      area.replaceChildren(node('p', 'Uploading CSV…'));
      xhr.open('POST', '/settings/transfer/upload/');
      xhr.setRequestHeader('X-CSRFToken', getCookie('csrftoken'));
      xhr.upload.addEventListener('progress', upload => {
        if (upload.lengthComputable) area.firstChild.textContent = `Uploading CSV: ${Math.round(upload.loaded / upload.total * 100)}%`;
      });
      xhr.addEventListener('error', () => reject(new Error('CSV upload failed.')));
      xhr.addEventListener('load', async () => {
        try {
          const result = JSON.parse(xhr.responseText);
          if (xhr.status >= 400 || result.error) throw new Error(result.error || 'CSV upload failed.');
          remember('import', result.job_id);
          mappedJob = valuesJob = null;
          page = 1;
          await poll('import', result.job_id);
          resolve();
        } catch (problem) { reject(problem); }
      });
      xhr.send(new FormData(form));
    }));
  });

  function guessField(header, fields) {
    const clean = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    const aliases = { name: 'title', year: 'release_year', rating: 'personal_rating', score: 'personal_rating', yourrating: 'personal_rating',
      review: 'notes', comment: 'notes', comments: 'notes', watchedDate: 'date_added', watcheddate: 'date_added', artist: 'creators', author: 'creators', directors: 'creators',
      type: 'media_type', imdbid: 'imdb_id', isbn13: 'isbn', isbn10: 'isbn' };
    return Object.keys(fields).find(field => clean(field) === clean(header)) || aliases[clean(header)] || '';
  }
  function buildMapping(task) {
    const form = byId('transfer-mapping-form');
    const saved = task.config.mapping || {};
    const tbody = byId('transfer-column-rows');
    tbody.replaceChildren();
    const used = new Set();
    task.headers.forEach(header => {
      const row = node('tr');
      row.appendChild(node('td', header));
      const sample = task.samples.map(item => item[header]).find(value => value !== '') || '';
      row.appendChild(node('td', sample));
      const cell = node('td');
      const select = node('select');
      select.dataset.column = header;
      select.setAttribute('aria-label', `Import ${header} as`);
      options(select, task.fields, 'Ignore');
      const proposed = Object.hasOwn(saved, header) ? saved[header] : guessField(header, task.fields);
      select.value = used.has(proposed) ? '' : proposed;
      if (select.value) used.add(select.value);
      cell.appendChild(select);
      row.appendChild(cell);
      tbody.appendChild(row);
    });
    for (const name of ['media_type', 'status', 'score_scale', 'date_format', 'list_separator']) {
      const fallback = { media_type: '', status: 'planned', score_scale: task.headers.includes('_mj_csv_version') ? '100' : '', date_format: 'iso', list_separator: '|' }[name];
      form.elements[name].value = task.config[name] || fallback;
    }
    mappedJob = task.id;
  }
  async function buildValues(schema) {
    const container = byId('transfer-value-fields');
    container.replaceChildren();
    Object.entries(schema).forEach(([field, group]) => {
      const section = node('div', undefined, 'transfer-value-group');
      section.appendChild(node('h4', current.fields[field]));
      group.values.forEach(({ value, suggested }) => {
        const label = node('label', value, 'transfer-field');
        const select = node('select');
        select.dataset.field = field;
        select.dataset.raw = value;
        select.required = true;
        options(select, group.options, 'Choose meaning');
        select.value = current.config.value_maps?.[field]?.[value] || suggested;
        label.appendChild(select);
        section.appendChild(label);
      });
      container.appendChild(section);
    });
    if (!Object.keys(schema).length) container.appendChild(node('p', 'No category values need mapping. Continue to find matches.'));
    valuesJob = current.id;
  }
  byId('transfer-mapping-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const cancel = byId('transfer-cancel-import');
    cancel.disabled = true;
    guarded(form.querySelector('button[type="submit"]'), async () => {
      const mapping = Object.fromEntries(Array.from(byId('transfer-column-rows').querySelectorAll('select'), select => [select.dataset.column, select.value]));
      const scale = form.elements.score_scale.value;
      if (Object.values(mapping).includes('personal_rating') && !scale) throw new Error('Choose the score scale used by this CSV.');
      const config = { mapping };
      for (const name of ['media_type', 'status', 'score_scale', 'date_format', 'list_separator']) config[name] = form.elements[name].value;
      config.score_scale ||= '100';
      const result = await action({ action: 'configure', config });
      current.config = config;
      await buildValues(result.value_fields);
      await poll('import', ids.import);
    }).finally(() => { cancel.disabled = false; });
  });
  byId('transfer-cancel-import').addEventListener('click', () => {
    clearTimeout(timers.import);
    ids.import = current = mappedJob = valuesJob = null;
    page = 1;
    pageHasMore = false;
    reviewRequest++;
    working.delete('import');
    try { localStorage.removeItem(storage.import); } catch (_) {}
    for (const section of ['mapping', 'values', 'review']) byId(`transfer-${section}`).hidden = true;
    byId('transfer-import-progress').hidden = true;
    byId('transfer-import-actions').replaceChildren();
    byId('transfer-upload-form').reset();
    syncStartButtons();
  });
  byId('transfer-back-columns').addEventListener('click', () => {
    byId('transfer-values').hidden = true;
    byId('transfer-mapping').hidden = false;
  });
  byId('transfer-values-form').addEventListener('submit', event => {
    event.preventDefault();
    guarded(event.currentTarget.querySelector('button[type="submit"]'), async () => {
      const valueMaps = Object.create(null);
      byId('transfer-value-fields').querySelectorAll('select').forEach(select => {
        (valueMaps[select.dataset.field] ||= Object.create(null))[select.dataset.raw] = select.value;
      });
      await action({ action: 'match', value_maps: valueMaps });
      await poll('import', ids.import);
    });
  });

  async function renderImport(task) {
    const busy = ['running', 'pausing'].includes(task.state);
    const mapping = task.state === 'mapping';
    const values = task.state === 'values';
    const review = ['review', 'completed'].includes(task.state) || (task.state === 'paused' && ['import', 'research'].includes(task.phase));
    byId('transfer-mapping').hidden = !mapping;
    byId('transfer-values').hidden = !values;
    byId('transfer-review').hidden = !review;
    if ((mapping || values) && mappedJob !== task.id) buildMapping(task);
    if (values && valuesJob !== task.id) {
      const result = await action({ action: 'configure', config: task.config });
      if (ids.import !== task.id) return;
      await buildValues(result.value_fields);
    }
    if (review) {
      const labels = { ready: 'matched', review: 'need review', unmatched: 'unmatched', invalid: 'invalid', existing: 'already saved', imported: 'imported', skipped: 'skipped', failed: 'failed' };
      byId('transfer-summary').textContent = Object.entries(labels).filter(([key]) => task.counts[key]).map(([key, label]) => `${task.counts[key].toLocaleString()} ${label}`).join(' · ') || 'No rows to show.';
      byId('transfer-import-matches').disabled = busy || working.size > 0 || !task.counts.ready;
      byId('transfer-import-matches').hidden = !task.counts.ready;
      byId('transfer-import-matches').textContent = `Import ${task.counts.ready || 0} Matched Items`;
      byId('transfer-remap').hidden = Boolean(task.counts.imported);
      byId('transfer-report').href = endpoint(task.id, 'download');
      await loadRows();
    }
  }
  async function loadRows() {
    if (!current) return;
    const sequence = ++reviewRequest;
    const identity = ids.import;
    const result = await request(endpoint(identity, 'rows') + `?page=${page}&filter=${byId('transfer-review-filter').value}`);
    if (ids.import !== identity || sequence !== reviewRequest) return;
    page = result.page;
    const container = byId('transfer-review-rows');
    container.replaceChildren();
    result.items.forEach(row => {
      const section = node('article', undefined, 'transfer-review-row');
      section.appendChild(node('h4', `${row.number}. ${row.title}${row.year ? ' (' + row.year + ')' : ''}`));
      section.appendChild(node('p', `${types[row.media_type] || ''} · ${row.state}${row.error ? ' · ' + row.error : ''}`, 'transfer-row-meta'));
      const editable = !['imported', 'existing'].includes(row.state);
      const candidates = node('div', undefined, 'transfer-candidates');
      row.candidates.forEach((candidate, index) => {
        const card = node('div', undefined, 'transfer-candidate');
        if (/^https:\/\//.test(candidate.poster || '')) {
          const image = node('img'); image.src = candidate.poster; image.alt = ''; image.loading = 'lazy'; card.appendChild(image);
        }
        const detail = node('div');
        detail.appendChild(node('strong', `${candidate.title}${candidate.year ? ' (' + candidate.year + ')' : ''}`));
        if (candidate.creators?.length) detail.appendChild(node('p', candidate.creators.join(', '), 'transfer-row-meta'));
        detail.appendChild(node('p', `${candidate.source} · ${candidate.id}${candidate.method ? ' · ' + candidate.method : ''}`, 'transfer-row-meta'));
        if (editable) detail.appendChild(button('Use This', async () => {
          await action({ action: 'decision', number: row.number, decision: 'approve', candidate: index });
          await poll('import', ids.import);
        }));
        card.appendChild(detail); candidates.appendChild(card);
      });
      section.appendChild(candidates);
      if (editable) {
        const controls = node('div', undefined, 'transfer-search-again');
        if (row.media_type) {
          const input = node('input'); input.type = 'text'; input.value = row.title; input.maxLength = 300; input.setAttribute('aria-label', 'Search for a different match');
          controls.append(input, button('Search Again', async () => {
            await action({ action: 'research', number: row.number, query: input.value });
            await poll('import', ids.import);
          }));
        }
        controls.appendChild(button('Skip', async () => {
          await action({ action: 'decision', number: row.number, decision: 'skip' });
          await poll('import', ids.import);
        }));
        section.appendChild(controls);
      }
      container.appendChild(section);
    });
    if (!result.items.length) container.appendChild(node('p', 'No items in this view.'));
    pageHasMore = result.has_more;
    byId('transfer-page').textContent = `Page ${page} · ${result.total.toLocaleString()} rows`;
    byId('transfer-previous').disabled = page <= 1;
    byId('transfer-next').disabled = !pageHasMore;
    byId('transfer-pagination').hidden = result.total <= 20;
  }
  byId('transfer-review-filter').addEventListener('change', () => { page = 1; loadRows().catch(problem => error('import', problem)); });
  byId('transfer-previous').addEventListener('click', () => { if (page > 1) page--; loadRows().catch(problem => error('import', problem)); });
  byId('transfer-next').addEventListener('click', () => { if (pageHasMore) page++; loadRows().catch(problem => error('import', problem)); });
  byId('transfer-import-matches').addEventListener('click', event => guarded(event.currentTarget, async () => {
    await action({ action: 'import' });
    await poll('import', ids.import);
  }));
  byId('transfer-remap').addEventListener('click', () => {
    buildMapping(current);
    byId('transfer-review').hidden = true;
    byId('transfer-mapping').hidden = false;
  });

  for (const type of ['import', 'export']) {
    try {
      const identity = localStorage.getItem(storage[type]);
      if (identity && /^[a-f0-9]{32}$/.test(identity)) { ids[type] = identity; poll(type, identity, true); }
    } catch (_) {}
  }
});
