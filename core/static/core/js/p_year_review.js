document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('year-review');
  if (!root) return;
  let review = {};
  try { review = JSON.parse(document.getElementById('review-data').textContent); }
  catch (error) { /* The page remains readable if export data is unavailable. */ }

  const timers = new Set();
  const requests = new Set();
  const objectUrls = new Set();
  let pageActive = true;
  const later = (callback, delay) => {
    const timer = setTimeout(() => { timers.delete(timer); callback(); }, delay);
    timers.add(timer);
    return timer;
  };
  const random = seed => {
    let value = Number(review.year) || 1;
    for (const character of String(seed)) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
    return () => { value = Math.imul(value ^ (value >>> 16), 2246822507); return (value >>> 0) / 4294967296; };
  };
  const completedGrid = document.getElementById('review-completed-grid');
  const completedScroll = document.getElementById('review-completed-scroll');
  const cardTemplate = document.getElementById('review-card-template');
  const monthButtons = [...root.querySelectorAll('[data-review-month]')];
  const showMore = document.getElementById('review-show-more');
  const completedCount = document.getElementById('review-completed-count');
  const completedEmpty = document.getElementById('review-completed-empty');
  const allCompleted = Array.isArray(review.completed) ? review.completed : [];
  let activeMonth = 'all';
  const pageSize = () => window.matchMedia('(max-width: 600px)').matches ? 6 : 12;
  let matchingCards = allCompleted;
  let renderedCount = 0;
  let expanded = false;
  let pagingFrame = 0;

  function fillCompletedScroll() {
    if (pagingFrame || !expanded || !pageActive || !completedScroll) return;
    pagingFrame = requestAnimationFrame(() => {
      pagingFrame = 0;
      if (!pageActive || renderedCount >= matchingCards.length) return;
      if (completedScroll.scrollHeight - completedScroll.scrollTop - completedScroll.clientHeight < 220) {
        appendCompletedPage();
        fillCompletedScroll();
      }
    });
  }

  function imageFallback(image) {
    const fallback = () => {
      if (image.dataset.reviewFallback || !root.dataset.placeholder) return;
      image.dataset.reviewFallback = 'true';
      image.src = root.dataset.placeholder;
    };
    image.addEventListener('error', fallback, { once: true });
    if (image.complete && !image.naturalWidth) fallback();
  }
  root.querySelectorAll('.review-card-art img, .review-hero-cover img').forEach(imageFallback);

  function createCard(card) {
    const element = cardTemplate.content.firstElementChild.cloneNode(true);
    element.classList.add(`review-card--${card.media_type}`);
    element.href = card.url || '#';
    element.dataset.id = card.id;
    element.dataset.month = card.month;
    element.title = [card.title, card.media_label, card.date_label, card.rating_label].filter(Boolean).join(' · ');
    const image = element.querySelector('img');
    image.src = card.cover_url || root.dataset.placeholder;
    image.alt = card.title;
    imageFallback(image);
    image.addEventListener('load', fillCompletedScroll, { once: true });
    element.querySelector('.review-card-title').textContent = card.title;
    if (card.highlight) {
      element.classList.add('review-card--highlight');
      const score = element.querySelector('.review-card-score');
      score.hidden = false;
      score.textContent = card.rating_label;
      score.title = `Highest rated · ${card.rating_label}`;
    }
    return element;
  }

  // Only the first page has live image elements. Opening the shelf is a single
  // action; subsequent pages are appended when its own scrollbar nears the end.
  function appendCompletedPage(amount = pageSize()) {
    if (!completedGrid || !cardTemplate) return;
    const fragment = document.createDocumentFragment();
    const end = Math.min(matchingCards.length, renderedCount + amount);
    for (; renderedCount < end; renderedCount++) fragment.appendChild(createCard(matchingCards[renderedCount]));
    completedGrid.appendChild(fragment);
    if (showMore) showMore.hidden = expanded || matchingCards.length <= renderedCount;
    completedScroll?.setAttribute('aria-label', `Completed items, ${renderedCount} of ${matchingCards.length} shown`);
  }

  function filterCompleted() {
    if (!completedGrid || !cardTemplate || !Array.isArray(review.completed)) return;
    matchingCards = allCompleted.filter(card => activeMonth === 'all' || String(card.month) === activeMonth);
    completedGrid.replaceChildren();
    renderedCount = 0;
    if (completedScroll) completedScroll.scrollTop = 0;
    appendCompletedPage(expanded ? pageSize() * 2 : pageSize());
    monthButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.reviewMonth === activeMonth)));
    if (completedCount) completedCount.textContent = `${matchingCards.length} item${matchingCards.length === 1 ? '' : 's'}`;
    if (completedEmpty) completedEmpty.hidden = matchingCards.length !== 0;
    completedGrid.classList.add('is-ready');
    fillCompletedScroll();
  }
  monthButtons.forEach(button => button.addEventListener('click', () => {
    activeMonth = button.dataset.reviewMonth;
    filterCompleted();
  }));
  showMore?.addEventListener('click', () => {
    expanded = true;
    completedScroll?.classList.add('is-expanded');
    completedScroll?.setAttribute('tabindex', '0');
    appendCompletedPage(pageSize() * 2);
    completedScroll?.focus({ preventScroll: true });
    fillCompletedScroll();
  });
  completedScroll?.addEventListener('scroll', () => {
    fillCompletedScroll();
  }, { passive: true });
  window.addEventListener('resize', fillCompletedScroll, { passive: true });
  filterCompleted();

  const disclosures = [document.getElementById('review-years'), document.getElementById('review-share')].filter(Boolean);
  document.addEventListener('click', event => {
    disclosures.forEach(details => { if (!details.contains(event.target)) details.open = false; });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') disclosures.forEach(details => { details.open = false; });
  });

  const status = document.getElementById('review-export-status');
  const exportButtons = [...root.querySelectorAll('[data-review-export]')];
  const scopeButtons = [...root.querySelectorAll('[data-review-scope]')];
  let scope = 'overview';
  let exporting = false;
  const report = text => { if (status) { status.hidden = false; status.textContent = text; } };
  scopeButtons.forEach(button => button.addEventListener('click', () => {
    scope = button.dataset.reviewScope;
    scopeButtons.forEach(option => option.setAttribute('aria-pressed', String(option === button)));
  }));
  exportButtons.forEach(button => button.addEventListener('click', async () => {
    if (exporting) return;
    exporting = true;
    const controls = [...exportButtons, ...scopeButtons].map(control => [control, control.disabled]);
    controls.forEach(([control]) => { control.disabled = true; });
    let canvas;
    try {
      report('Preparing your review…');
      if (document.fonts?.ready) await document.fonts.ready;
      const result = await renderExport(scope);
      canvas = result.canvas;
      const format = button.dataset.reviewExport;
      const blob = await canvasBlob(canvas, format === 'pdf' ? 'image/jpeg' : 'image/png');
      const output = format === 'pdf' ? await imagePdf(canvas, blob) : blob;
      if (!pageActive) throw new Error('Export cancelled.');
      const suffix = scope === 'overview' ? '' : ` - ${scope.charAt(0).toUpperCase() + scope.slice(1)}`;
      download(output, `Media Journal - ${review.year} Year in Review${suffix}.${format}`);
      report(result.missing ? `Ready. ${result.missing} unavailable cover${result.missing === 1 ? ' was' : 's were'} replaced with a placeholder.` : 'Your review is ready.');
    } catch (error) {
      report(error.message || 'Unable to create the export. Please try again.');
    } finally {
      if (canvas) { canvas.width = 1; canvas.height = 1; }
      exporting = false;
      controls.forEach(([control, disabled]) => { control.disabled = disabled; });
    }
  }));

  async function loadCover(card) {
    const controller = new AbortController();
    requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      if (!card.export_image_url) throw new Error('Cover unavailable.');
      const url = new URL(card.export_image_url, window.location.href);
      if (url.origin !== window.location.origin) throw new Error('Invalid image address.');
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Cover unavailable.');
      const blob = await response.blob();
      if (blob.size > 20 * 1024 * 1024) throw new Error('Cover too large.');
      return await createImageBitmap(blob);
    } finally {
      clearTimeout(timeout);
      requests.delete(controller);
    }
  }

  function titleLines(context, title, width, maximum = 2) {
    const lines = [];
    let line = '';
    for (const word of String(title || 'Untitled').trim().split(/\s+/u)) {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= width) { line = candidate; continue; }
      if (line) { lines.push(line); line = ''; }
      for (const character of Array.from(word)) {
        if (line && context.measureText(line + character).width > width) { lines.push(line); line = ''; }
        line += character;
      }
    }
    if (line) lines.push(line);
    if (lines.length > maximum) {
      lines.length = maximum;
      const characters = Array.from(lines[maximum - 1]);
      while (characters.length && context.measureText(characters.join('') + '…').width > width) characters.pop();
      lines[maximum - 1] = characters.join('').trimEnd() + '…';
    }
    return lines;
  }

  async function renderExport(section) {
    const exportMonth = activeMonth;
    const completed = (review.completed || []).filter(card => exportMonth === 'all' || String(card.month) === exportMonth);
    const candidates = section === 'overview' ? [...(review.favorites || []), ...(review.completed || []), ...(review.stats?.music?.top_items || []), ...(review.dropped || [])] : section === 'completed' ? completed : review[section] || [];
    const seen = new Set();
    const all = candidates.filter(card => { if (seen.has(card.id)) return false; seen.add(card.id); return true; });
    const cards = all.slice(0, section === 'overview' ? 15 : 25);
    if (!cards.length && section !== 'overview') throw new Error('There are no items in this selection.');
    const images = new Array(cards.length).fill(null);
    let cursor = 0;
    try {
      await Promise.all(Array.from({ length: Math.min(4, cards.length) }, async () => {
        while (cursor < cards.length) {
          if (!pageActive) break;
          const index = cursor++;
          try { images[index] = await loadCover(cards[index]); } catch (error) { /* Draw a placeholder. */ }
        }
      }));
      if (!pageActive) throw new Error('Export cancelled.');
      const style = getComputedStyle(root);
      const color = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
      const palette = { paper: color('--review-paper', '#182029'), surface: color('--review-surface', '#25313b'), ink: color('--review-ink', '#f3eee4'), muted: color('--review-muted', '#b8b8b3'), accent: color('--review-accent', '#e4ba76') };
      const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      const context = canvas.getContext('2d', { alpha: false });
      const padding = 68;
      const gap = 20;
      const columns = Math.max(1, Math.min(5, cards.length));
      const artRatio = (card, index) => card.media_type === 'music' ? 1 : Math.min(2.2, images[index]?.height / images[index]?.width || 1.4);
      const top = section === 'overview' ? 302 : 218;
      let cardWidth = Math.min(208, (1200 - padding * 2 - gap * (columns - 1)) / columns);
      let rows;
      let totalHeight;
      let titleSize;
      do {
        titleSize = Math.max(15, Math.min(22, cardWidth * 0.115));
        context.font = `500 ${titleSize}px ${font}`;
        rows = [];
        let y = top;
        for (let start = 0; start < cards.length; start += columns) {
          const values = cards.slice(start, start + columns);
          const artHeight = Math.max(...values.map((card, index) => (cardWidth - 20) * artRatio(card, start + index)));
          const lines = values.map(card => titleLines(context, card.title, cardWidth - 24));
          const height = 12 + artHeight + 14 + Math.max(...lines.map(value => value.length)) * titleSize * 1.25 + 18;
          rows.push({ start, y, height, artHeight, lines });
          y += height + gap;
        }
        totalHeight = Math.ceil(y - gap + 68);
        if (totalHeight > 1696) cardWidth *= 0.94;
      } while (totalHeight > 1696 && cardWidth > 80);
      canvas.height = Math.min(1696, totalHeight);
      context.fillStyle = palette.paper;
      context.fillRect(0, 0, canvas.width, canvas.height);
      const next = random(`export-${section}`);
      context.fillStyle = palette.accent;
      for (let index = 0; index < 26; index++) {
        context.globalAlpha = 0.1 + next() * 0.15;
        context.beginPath();
        context.arc(48 + next() * 1104, 26 + next() * 155, 1 + next() * 3, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      context.textAlign = 'center';
      context.fillStyle = palette.muted;
      context.font = `500 19px ${font}`;
      context.fillText('YEAR IN REVIEW', 600, 53);
      context.fillStyle = palette.accent;
      context.font = `700 91px ${font}`;
      context.fillText(String(review.year), 600, 139);
      context.fillStyle = palette.ink;
      context.font = `500 25px ${font}`;
      let heading = { overview: 'Your year in media', favorites: 'Favorited', completed: 'Completed', dropped: 'Dropped' }[section];
      if (section === 'completed' && exportMonth !== 'all') heading += ` · ${new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(2020, Number(exportMonth) - 1, 1))}`;
      context.fillText(heading, 600, 182);
      if (section === 'overview') {
        const metrics = [];
        const countMetric = (value, label) => {
          if (Number(value) > 0) metrics.push({ value: Number(value).toLocaleString('en'), label });
        };
        countMetric(review.counts?.completed, 'Completed');
        countMetric(review.counts?.favorites, 'Favorited');
        if (review.stats?.movie_minutes > 0) metrics.push({ value: review.stats.movie_hours_label, label: 'Time with movies' });
        countMetric(review.stats?.music?.plays, 'Music plays');
        countMetric(review.counts?.dropped, 'Dropped');
        for (const metric of review.stats?.tracked?.metrics || []) {
          if (metrics.length >= 3) break;
          if (Number(metric.value) > 0) metrics.push({
            value: `${Number(metric.value).toLocaleString('en')} ${metric.unit || ''}`.trim(),
            label: metric.label || 'Progress recorded',
          });
        }
        if (!metrics.length) metrics.push({ value: '0', label: 'Completed' });
        const selectedMetrics = metrics.slice(0, 3);
        selectedMetrics.forEach((metric, index) => {
          const x = 1200 * (index + 0.5) / selectedMetrics.length;
          const maximumWidth = 1200 / selectedMetrics.length - 80;
          context.fillStyle = palette.ink;
          let size = 30;
          context.font = `700 ${size}px ${font}`;
          while (size > 18 && context.measureText(metric.value).width > maximumWidth) context.font = `700 ${--size}px ${font}`;
          context.fillText(metric.value, x, 241, maximumWidth);
          context.fillStyle = palette.muted;
          context.font = `400 17px ${font}`;
          context.fillText(titleLines(context, metric.label, maximumWidth, 1)[0], x, 271, maximumWidth);
        });
      }
      const gridWidth = columns * cardWidth + (columns - 1) * gap;
      for (const row of rows) {
        const values = cards.slice(row.start, row.start + columns);
        values.forEach((card, column) => {
          const x = (1200 - gridWidth) / 2 + column * (cardWidth + gap);
          context.fillStyle = palette.surface;
          context.beginPath();context.roundRect(x, row.y, cardWidth, row.height, 12);context.fill();
          const width = cardWidth - 20;
          const height = width * artRatio(card, row.start + column);
          const y = row.y + 10 + row.artHeight - height;
          const image = images[row.start + column];
          context.save();context.beginPath();context.roundRect(x + 10, y, width, height, 7);context.clip();
          if (image) {
            const targetWidth = card.media_type === 'music' ? width * 1.79 : width;
            const offset = card.media_type === 'music' ? -width * 0.395 : 0;
            const scale = card.media_type === 'music' ? Math.max(targetWidth / image.width, height / image.height) : Math.min(width / image.width, height / image.height);
            context.drawImage(image, x + 10 + offset + (targetWidth - image.width * scale) / 2, y + (height - image.height * scale) / 2, image.width * scale, image.height * scale);
          } else {
            context.fillStyle = palette.paper;context.fillRect(x + 10, y, width, height);
            context.fillStyle = palette.muted;context.font = `500 ${Math.max(28, cardWidth * 0.22)}px ${font}`;
            context.fillText(Array.from(card.title || '?')[0].toUpperCase(), x + cardWidth / 2, y + height / 2 + 10);
          }
          context.restore();
          context.fillStyle = palette.ink;context.font = `500 ${titleSize}px ${font}`;
          const textY = row.y + 12 + row.artHeight + 14 + titleSize;
          row.lines[column].forEach((line, index) => context.fillText(line, x + cardWidth / 2, textY + index * titleSize * 1.25));
        });
      }
      if (all.length > cards.length) {
        context.fillStyle = palette.muted;context.font = `400 16px ${font}`;
        context.fillText(`${cards.length} of ${all.length} items`, 600, canvas.height - 25);
      }
      return { canvas, missing: images.filter(image => !image).length };
    } finally {
      images.forEach(image => image?.close());
    }
  }

  function canvasBlob(canvas, type) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to create the image.')), type, 0.94));
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    objectUrls.add(url);
    const link = document.createElement('a');
    link.href = url;link.download = filename;document.body.appendChild(link);link.click();link.remove();
    later(() => { URL.revokeObjectURL(url); objectUrls.delete(url); }, 60000);
  }
  // Same image-only PDF approach used by Favorites exports; no PDF dependency.
  async function imagePdf(canvas, blob) {
    const encoder = new TextEncoder();
    const parts = [];
    const offsets = [0];
    let position = 0;
    const append = value => { const bytes = typeof value === 'string' ? encoder.encode(value) : value; parts.push(bytes);position += bytes.byteLength; };
    const object = (id, values) => { offsets[id] = position;append(`${id} 0 obj\n`);values.forEach(append);append('\nendobj\n'); };
    const width = 595.28;
    const height = Number((width * canvas.height / canvas.width).toFixed(2));
    const jpeg = new Uint8Array(await blob.arrayBuffer());
    append('%PDF-1.4\n%');append(new Uint8Array([226, 227, 207, 211]));append('\n');
    object(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
    object(2, ['<< /Type /Pages /Count 1 /Kids [3 0 R] >>']);
    object(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Cover 4 0 R >> >> /Contents 5 0 R >>`]);
    object(4, [`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.byteLength} >>\nstream\n`, jpeg, '\nendstream']);
    const commands = encoder.encode(`q\n${width} 0 0 ${height} 0 0 cm\n/Cover Do\nQ\n`);
    object(5, [`<< /Length ${commands.byteLength} >>\nstream\n`, commands, 'endstream']);
    const xref = position;
    append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
    offsets.slice(1).forEach(offset => append(`${String(offset).padStart(10, '0')} 00000 n \n`));
    append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  window.addEventListener('pagehide', () => {
    pageActive = false;
    cancelAnimationFrame(pagingFrame);pagingFrame = 0;
    timers.forEach(timer => clearTimeout(timer));timers.clear();
    requests.forEach(controller => controller.abort());requests.clear();
    objectUrls.forEach(url => URL.revokeObjectURL(url));objectUrls.clear();
  });
  window.addEventListener('pageshow', () => { pageActive = true; fillCompletedScroll(); });
});
