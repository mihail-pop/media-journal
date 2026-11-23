(() => {
  const initialized = new WeakSet();
  function initialize(container) {
    if (!container || initialized.has(container)) return;
    const overview = container.querySelector('.overview');
    const button = container.querySelector('.read-more-btn');
    if (!overview || !button || !overview.clientWidth) return;
    initialized.add(container);

    // Retain the original nodes for expansion, including links and rich formatting.
    const originalNodes = [...overview.childNodes];
    const template = overview.cloneNode(true);
    const walker = document.createTreeWalker(template, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let length = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      textNodes.push({ node, start: length });
      length += node.textContent.length;
    }
    const text = template.textContent;
    const tail = document.createElement('span');
    tail.className = 'overview-more-tail';
    tail.append(document.createTextNode('… '), button);
    let expanded = false;
    let lastWidth = 0;
    let frame = 0;

    function cutAt(offset) {
      const range = document.createRange();
      range.selectNodeContents(template);
      const part = textNodes.find(entry => offset <= entry.start + entry.node.textContent.length);
      if (part) range.setEnd(part.node, Math.max(0, offset - part.start));
      else range.collapse(true);
      overview.replaceChildren(range.cloneContents(), tail);
    }

    function fit() {
      if (expanded || !overview.clientWidth) return;
      lastWidth = overview.clientWidth;
      overview.classList.add('details-inline-overview');
      overview.classList.remove('details-overview-truncated');
      overview.replaceChildren(...originalNodes);
      const lineHeight = parseFloat(getComputedStyle(overview).lineHeight);
      const limit = lineHeight * 5 + 0.5;
      if (!length || overview.getBoundingClientRect().height <= limit) return;
      // Keep the same five-line space as the initial native clamp. Paragraph
      // breaks can otherwise make the fitted excerpt one or two lines shorter.
      overview.classList.add('details-overview-truncated');

      // Measure the suffix together with the text so it fits on the fifth line.
      let low = 0;
      let high = length;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        cutAt(middle);
        if (overview.getBoundingClientRect().height <= limit) low = middle;
        else high = middle - 1;
      }
      let end = low;
      const space = text.lastIndexOf(' ', end);
      if (space > end - 30 && space > 0) end = space;
      // Avoid splitting a surrogate pair when a title/description contains emoji.
      if (end && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
      while (end && /[\s.…]/.test(text[end - 1])) end--;
      cutAt(end);
    }

    button.addEventListener('click', event => {
      event.preventDefault();
      expanded = true;
      overview.classList.remove('details-overview-truncated');
      overview.replaceChildren(...originalNodes);
      observer.disconnect();
      cancelAnimationFrame(frame);
    });
    const observer = new ResizeObserver(() => {
      if (expanded || Math.abs(overview.clientWidth - lastWidth) < 1) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    // Measuring forces the browser to request the chosen font. Keep the native
    // clamp until that font is available, rather than expose the full text in
    // a fallback font and shorten it again after the first paint.
    const style = getComputedStyle(overview);
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const ready = () => { if (!expanded) fit(); observer.observe(overview); };
    if (document.fonts.status === 'loaded' && document.fonts.check(font, text)) ready();
    else document.fonts.load(font, text).catch(() => {}).then(() => document.fonts.ready).then(ready, ready);
  }
  // Each description calls this as soon as its markup is parsed, before the
  // remaining page/scripts can delay the initial five-line layout.
  window.initializeDetailsOverview = initialize;
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.text-info .overview-container').forEach(initialize);
  });
})();
