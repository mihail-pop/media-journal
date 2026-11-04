document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('share-favorites-form');
  if (!form) return;
  const exportButton = document.getElementById('export-favorites-btn');
  const status = document.getElementById('favorites-export-status');
  let busy = false;

  const selectedSections = () => [...form.querySelectorAll('input[name="sections"]:checked')].map(input => input.value);
  const updateButton = () => { exportButton.disabled = busy || selectedSections().length === 0; };
  const report = message => { status.hidden = false; status.textContent = message; };
  form.addEventListener('change', updateButton);
  updateButton();

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !selectedSections().length) return;
    const selected = selectedSections();
    const format = form.querySelector('input[name="format"]:checked').value;
    const showTitles = form.querySelector('input[name="show_titles"]').checked;
    const maximumItems = form.querySelector('input[name="max_items"]:checked').value;
    const controls = [...form.querySelectorAll('input, button')].map(control => [control, control.disabled]);
    busy = true;
    controls.forEach(([control]) => { control.disabled = true; });
    report('Preparing your favorites…');
    try {
      const params = new URLSearchParams({ limit: maximumItems });
      selected.forEach(section => params.append('sections', section));
      const response = await fetch(`/settings/favorites/export-data/?${params}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load favorites.');
      if (!data.sections.length) throw new Error('There are no favorites in the selected sections.');
      const style = getComputedStyle(document.body);
      const font = style.fontFamily || 'sans-serif';
      await Promise.all([document.fonts.load(`500 29px ${font}`), document.fonts.load(`700 54px ${font}`)]);
      const palette = {
        background: style.getPropertyValue('--bg-primary').trim() || '#0b1622',
        card: style.getPropertyValue('--bg-tertiary').trim() || '#151f2e',
        panel: style.getPropertyValue('--bg-secondary').trim() || '#1a2332',
        text: style.getPropertyValue('--text-secondary').trim() || '#a8b5c4',
        muted: style.getPropertyValue('--text-primary').trim() || '#8596a5',
        accent: style.getPropertyValue('--special-color').trim() || '#00bfff',
        font,
      };
      const pages = [];
      let missingCovers = 0;
      for (const section of data.sections) {
        const { canvas, missing } = await renderSection(section, showTitles, palette, report);
        missingCovers += missing;
        try {
          const blob = await canvasBlob(canvas, format === 'pdf' ? 'image/jpeg' : 'image/png');
          pages.push({ title: section.title, width: canvas.width, height: canvas.height, blob });
        } finally {
          // Release the large pixel buffer before rendering the next section.
          canvas.width = 1;
          canvas.height = 1;
        }
      }
      report('Finishing your download…');
      if (format === 'pdf') {
        downloadBlob(await buildFavoritesPdf(pages), 'Media Journal - Favorites.pdf');
      } else if (pages.length <= 3) {
        for (const page of pages) {
          downloadBlob(page.blob, `${page.title}.png`);
        }
      } else {
        const files = new FormData();
        pages.forEach(page => files.append('images', page.blob, `${page.title}.png`));
        const archiveResponse = await fetch('/settings/favorites/export-png-archive/', {
          method: 'POST',
          headers: { 'X-CSRFToken': getCookie('csrftoken') },
          body: files,
        });
        if (!archiveResponse.ok) {
          const error = await archiveResponse.json().catch(() => ({}));
          throw new Error(error.error || 'Unable to package the PNG images.');
        }
        downloadBlob(await archiveResponse.blob(), 'Media Journal - Favorites.zip');
      }
      report(`Your export is ready.${missingCovers ? ` ${missingCovers} unavailable cover${missingCovers === 1 ? ' was' : 's were'} replaced with a placeholder.` : ''}`);
    } catch (error) {
      report(error.message || 'Unable to export favorites. Please try again.');
    } finally {
      busy = false;
      controls.forEach(([control, disabled]) => { control.disabled = disabled; });
      updateButton();
    }
  });

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function canvasBlob(canvas, type) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to create the export image.')), type, 0.94);
    });
  }

  function roundedRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
  }

  function titleLines(context, title, width, maximum = 3) {
    const lines = [];
    let line = '';
    for (const word of String(title).trim().split(/\s+/u)) {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= width) {
        line = candidate;
        continue;
      }
      if (line) { lines.push(line); line = ''; }
      for (const character of Array.from(word)) {
        if (line && context.measureText(line + character).width > width) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    if (line) lines.push(line);
    if (lines.length > maximum) {
      lines.length = maximum;
      let last = lines[maximum - 1];
      while (last && context.measureText(last + '…').width > width) last = last.slice(0, -1);
      lines[maximum - 1] = last.trimEnd() + '…';
    }
    return lines;
  }

  async function loadCover(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Cover unavailable.');
      const blob = await response.blob();
      if (blob.size > 20 * 1024 * 1024) throw new Error('Cover is too large.');
      return await createImageBitmap(blob);
    } finally {
      clearTimeout(timeout);
    }
  }

  function drawCover(context, image, x, y, width, height, music) {
    context.save();
    roundedRect(context, x, y, width, height, 12);
    context.clip();
    // Match the music cards' 179% thumbnail width and centered crop.
    const imageWidth = music ? width * 1.79 : width;
    const imageX = music ? x - width * 0.395 : x;
    const scale = Math.max(imageWidth / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    context.drawImage(image, imageX + (imageWidth - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
    context.restore();
  }

  async function renderSection(section, showTitles, palette, report) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Your browser could not create the export image.');
    const columns = Math.min(5, section.items.length);
    const rows = Math.ceil(section.items.length / columns);
    const width = 1600;
    const maximumHeight = Math.floor(width * 297 / 210);
    const gridTop = 164;
    const footerSpace = 40;
    const coverRatio = section.id === 'music' ? 1 : section.id === 'game' ? 4 / 3 : 1.5;
    let columnGap = rows <= 2 ? 32 : 28;
    let rowGap = rows <= 2 ? 40 : 32;
    let panelPadding = 10;
    let coverWidth = Math.min(
      rows <= 2 ? 300 : rows === 3 ? 236 : rows === 4 ? 220 : 204,
      (width - 200 - (columns - 1) * columnGap) / columns,
    );
    let titleSize = rows <= 2 ? 25 : 23;
    let captionGap = 18;
    let titles, positions, coverHeight, lineHeight, top;

    // Scale the whole grid together when necessary, preserving cover ratios,
    // legible captions and an A4-height ceiling without adding blank rows.
    for (let attempt = 0; attempt < 4; attempt++) {
      coverHeight = coverWidth * coverRatio;
      lineHeight = titleSize * 1.3;
      const gridWidth = columns * coverWidth + (columns - 1) * columnGap;
      const left = (width - gridWidth) / 2;
      context.font = `500 ${titleSize}px ${palette.font}`;
      titles = section.items.map(item => showTitles ? titleLines(context, item.title, coverWidth - 8) : []);
      positions = [];
      top = gridTop;
      for (let row = 0; row < rows; row++) {
        const start = row * columns;
        const rowItems = section.items.slice(start, start + columns);
        const lines = Math.max(0, ...titles.slice(start, start + columns).map(title => title.length));
        const cardHeight = coverHeight + (showTitles ? captionGap + lines * lineHeight : 0);
        rowItems.forEach((item, column) => positions.push({ x: left + column * (coverWidth + columnGap), y: top, cardHeight }));
        top += cardHeight;
        if (row < rows - 1) top += rowGap;
      }
      if (Math.ceil(top + footerSpace) <= maximumHeight) break;
      const scale = (maximumHeight - gridTop - footerSpace - 2) / (top - gridTop);
      coverWidth *= scale;
      titleSize *= scale;
      columnGap *= scale;
      rowGap *= scale;
      captionGap *= scale;
      panelPadding *= scale;
    }
    canvas.width = width;
    canvas.height = Math.ceil(top + footerSpace);
    context.fillStyle = palette.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.textBaseline = 'alphabetic';
    context.textAlign = 'center';
    context.fillStyle = palette.text;
    context.font = `700 54px ${palette.font}`;
    context.fillText(section.title, width / 2, 100);

    positions.forEach(({ x, y, cardHeight }, index) => {
      context.fillStyle = palette.panel;
      roundedRect(context, x - panelPadding, y - panelPadding, coverWidth + panelPadding * 2, cardHeight + panelPadding * 2, 18);
      context.fill();
      context.fillStyle = palette.card;
      roundedRect(context, x, y, coverWidth, coverHeight, 12);
      context.fill();
      context.fillStyle = palette.muted;
      context.font = `600 58px ${palette.font}`;
      context.textAlign = 'center';
      context.fillText(Array.from(section.items[index].title.trim())[0] || '?', x + coverWidth / 2, y + coverHeight / 2 + 18);
      context.fillStyle = palette.text;
      context.font = `500 ${titleSize}px ${palette.font}`;
      titles[index].forEach((line, lineIndex) => context.fillText(line, x + coverWidth / 2, y + coverHeight + captionGap + titleSize + lineIndex * lineHeight));
    });

    let next = 0;
    let complete = 0;
    let missing = 0;
    // Decode/draw only a few covers at a time, releasing each bitmap immediately.
    async function worker() {
      while (next < section.items.length) {
        const index = next++;
        let image;
        try {
          image = await loadCover(section.items[index].image_url);
          const { x, y } = positions[index];
          drawCover(context, image, x, y, coverWidth, coverHeight, section.id === 'music');
        } catch (error) {
          missing++;
        } finally {
          image?.close();
          complete++;
          report(`Preparing ${section.title} · ${complete}/${section.items.length} covers`);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, section.items.length) }, worker));
    return { canvas, missing };
  }

  // A deliberately small image-only PDF writer: each page embeds the JPEG made
  // from its canvas. No HTML conversion, fonts or external PDF library needed.
  async function buildFavoritesPdf(pages) {
    const encoder = new TextEncoder();
    const parts = [];
    const offsets = [0];
    let position = 0;
    const append = value => {
      const bytes = typeof value === 'string' ? encoder.encode(value) : value;
      parts.push(bytes);
      position += bytes.byteLength;
    };
    const object = (id, values) => {
      offsets[id] = position;
      append(`${id} 0 obj\n`);
      values.forEach(append);
      append('\nendobj\n');
    };
    append('%PDF-1.4\n%');
    append(new Uint8Array([226, 227, 207, 211]));
    append('\n');
    const pageIds = pages.map((page, index) => 3 + index * 3);
    object(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
    object(2, [`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`]);
    for (let index = 0; index < pages.length; index++) {
      const page = pages[index];
      const id = pageIds[index];
      const width = 595.28;
      const height = Number((width * page.height / page.width).toFixed(2));
      const jpeg = new Uint8Array(await page.blob.arrayBuffer());
      object(id, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Cover ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`]);
      object(id + 1, [`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.byteLength} >>\nstream\n`, jpeg, '\nendstream']);
      const commands = encoder.encode(`q\n${width} 0 0 ${height} 0 0 cm\n/Cover Do\nQ\n`);
      object(id + 2, [`<< /Length ${commands.byteLength} >>\nstream\n`, commands, 'endstream']);
    }
    const xref = position;
    append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
    offsets.slice(1).forEach(offset => append(`${String(offset).padStart(10, '0')} 00000 n \n`));
    append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }
});
