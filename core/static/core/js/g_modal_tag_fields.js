// Shared compact selections and floating pills for the media-item modals.
(() => {
  if (window.ModalTagFields || !document.querySelector('#edit-modal, #create-modal, #metadata-modal')) return;
  const fields = new WeakMap();
  let active = null;
  let positionFrame = 0;
  const hiddenModals = '.modal-hidden, .c-modal-hidden, .md-modal-hidden, [hidden]';
  const removeSelector = '.remove-tag, .c-remove-tag, .md-remove-tag';

  function schedulePosition() {
    if (!active || positionFrame) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = 0;
      active?.position();
    });
  }

  class TagField {
    constructor({ control, input, tags, wrapper = control, options = null,
      openClass = 'open', placeholder, onClose }) {
      Object.assign(this, { control, input, tags, wrapper, options, openClass, placeholder, onClose });
      this.modal = control.closest('#edit-modal, #create-modal, #metadata-modal');
      this.pane = document.createElement('div');
      this.pane.className = 'modal-tag-popover';
      this.pane.hidden = true;
      this.pane.setAttribute('role', 'group');
      this.pane.setAttribute('aria-label', 'Selected items');
      this.pane.appendChild(tags);
      tags.classList.add('modal-tag-list');
      document.body.appendChild(this.pane);

      this.summary = document.createElement('span');
      this.summary.className = 'modal-tag-summary';
      this.summary.id = `${input.id}-selection-summary`;
      this.summary.setAttribute('aria-hidden', 'true');
      input.setAttribute('aria-describedby', this.summary.id);
      this.first = document.createElement('span');
      this.first.className = 'modal-tag-first';
      this.more = document.createElement('span');
      this.more.className = 'modal-tag-more';
      this.summary.append(this.first, this.more);
      control.insertBefore(this.summary, input);
      control.classList.add('modal-tag-field');
      control.classList.toggle('modal-tag-creator-field', !options);

      if (options) {
        this.menu = document.createElement('div');
        this.menu.className = 'modal-tag-options-portal';
        this.menu.hidden = true;
        options.classList.add('modal-tag-options');
        this.menu.appendChild(options);
        document.body.appendChild(this.menu);
      }

      for (const popup of [this.pane, this.menu].filter(Boolean)) {
        // Popups are outside the modal so its rounded/scrolling boxes cannot clip them.
        popup.addEventListener('click', event => event.stopPropagation());
        popup.addEventListener('pointerdown', event => {
          this.pointerInPopup = true;
          if (event.pointerType === 'mouse' && event.target.closest('.modal-tag-pill')) event.preventDefault();
        });
        popup.addEventListener('pointercancel', () => { this.pointerInPopup = false; });
        popup.addEventListener('click', () => {
          this.pointerInPopup = false;
          queueMicrotask(() => {
            if (active === this && this.visible()) input.focus({ preventScroll: true });
          });
        }, true);
      }
      this.pane.addEventListener('keydown', event => {
        const remove = event.target.closest(removeSelector);
        if (remove && ['Enter', ' '].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          remove.click();
        }
      });

      control.addEventListener('pointerdown', event => {
        // Keep arrow clicks from focusing the parent and opening it before its
        // click handler decides whether to open the dropdown or clear choices.
        if (event.target.closest('.collection-indicator, .genre-indicator, .md-genre-indicator')) event.preventDefault();
        else this.open();
      });
      control.addEventListener('focusin', () => this.open());
      input.addEventListener('input', () => this.open());
      const checkFocus = () => queueMicrotask(() => {
        if (active === this && !this.pointerInPopup && !this.contains(document.activeElement)) this.close();
      });
      control.addEventListener('focusout', checkFocus);
      this.pane.addEventListener('focusout', checkFocus);
      this.menu?.addEventListener('focusout', checkFocus);
      input.form?.addEventListener('submit', () => {
        if (active === this) this.close();
      }, true);

      // Observe only these controls, not the page or the whole modal subtree.
      this.tagObserver = new MutationObserver(() => this.refresh());
      this.tagObserver.observe(tags, { childList: true });
      if (options) {
        this.openObserver = new MutationObserver(() => {
          if (wrapper.classList.contains(openClass)) {
            if (active !== this) this.open();
            else schedulePosition();
          } else if (active === this) this.close();
        });
        this.openObserver.observe(wrapper, { attributes: true, attributeFilter: ['class'] });
        this.optionObserver = new MutationObserver(schedulePosition);
        this.optionObserver.observe(options, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
      }
      this.modalObserver = new MutationObserver(() => {
        if (active === this && !this.visible()) this.close(false);
      });
      this.modalObserver.observe(this.modal, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
      this.resizeObserver = new ResizeObserver(schedulePosition);
      this.resizeObserver.observe(control);
      this.refresh();
    }

    visible() {
      return this.control.isConnected && !this.modal.matches(hiddenModals) && this.control.getClientRects().length > 0;
    }

    contains(node) {
      return !!node && (this.wrapper.contains(node) || this.pane.contains(node) || !!this.menu?.contains(node));
    }

    refresh() {
      const pills = [...this.tags.children];
      for (const pill of pills) {
        pill.classList.add('modal-tag-pill');
        const label = pill.firstElementChild;
        label?.classList.add('modal-tag-label');
        const remove = pill.querySelector(removeSelector);
        if (remove) {
          remove.classList.add('modal-tag-remove');
          remove.setAttribute('role', 'button');
          remove.tabIndex = 0;
          remove.setAttribute('aria-label', `Remove ${label?.textContent || 'item'}`);
        }
      }
      this.count = pills.length;
      this.first.textContent = pills[0]?.firstElementChild?.textContent || '';
      this.more.textContent = pills.length > 1 ? `+${pills.length - 1}` : '';
      this.more.hidden = pills.length < 2;
      this.summary.hidden = !pills.length;
      this.control.classList.toggle('modal-tag-has-items', pills.length > 0);
      this.input.placeholder = typeof this.placeholder === 'function' ? this.placeholder() : this.placeholder;
      this.pane.hidden = active !== this || !pills.length;
      if (active === this) schedulePosition();
    }

    open() {
      if (!this.visible()) return;
      if (active && active !== this) active.close();
      active = this;
      this.control.classList.add('modal-tag-active');
      if (this.options) {
        this.wrapper.classList.add(this.openClass);
        this.options.classList.add(this.openClass);
        this.input.setAttribute('aria-expanded', 'true');
      }
      const style = getComputedStyle(this.control);
      for (const popup of [this.pane, this.menu].filter(Boolean)) {
        for (const name of ['--bg-primary', '--bg-tertiary', '--bg-quaternary', '--text-primary', '--text-secondary', '--text-tertiary', '--border-color']) {
          popup.style.setProperty(name, style.getPropertyValue(name));
        }
        popup.style.fontFamily = getComputedStyle(this.input).fontFamily;
      }
      if (this.menu) this.menu.hidden = false;
      this.refresh();
    }

    close(commit = true) {
      if (active !== this) return;
      active = null;
      this.pointerInPopup = false;
      this.control.classList.remove('modal-tag-active');
      this.pane.hidden = true;
      this.pane.style.visibility = 'hidden';
      if (this.options) {
        this.wrapper.classList.remove(this.openClass);
        this.options.classList.remove(this.openClass);
        this.input.setAttribute('aria-expanded', 'false');
        this.menu.hidden = true;
        this.menu.style.visibility = 'hidden';
      }
      if (commit) this.onClose?.();
      this.refresh();
    }

    position() {
      if (!this.visible()) { this.close(false); return; }
      const rect = this.control.getBoundingClientRect();
      const view = window.visualViewport;
      const bounds = {
        left: view?.offsetLeft || 0, top: view?.offsetTop || 0,
        width: view?.width || window.innerWidth, height: view?.height || window.innerHeight,
      };
      bounds.bottom = bounds.top + bounds.height;
      if (rect.bottom < bounds.top || rect.top > bounds.bottom) { this.close(); return; }
      const gap = 7, gutter = 12, center = rect.left + rect.width / 2;
      // Limit the width symmetrically: the pills remain centered even near an edge.
      const maxWidth = Math.max(1, 2 * Math.min(center - bounds.left - gutter, bounds.left + bounds.width - gutter - center));
      const font = parseFloat(getComputedStyle(document.documentElement).fontSize);
      this.pane.style.maxWidth = `${Math.min(44 * font, maxWidth)}px`;
      const selectedScrollTop = this.pane.scrollTop;
      this.pane.style.maxHeight = 'none';
      const tagHeight = this.count ? this.pane.offsetHeight : 0;
      const portrait = window.matchMedia('(orientation: portrait)').matches;
      let menuHeight = 0;
      const optionScrollTop = this.options?.scrollTop || 0;
      if (this.menu) {
        this.menu.style.width = `${rect.width}px`;
        // Measure the natural height so filtering can shrink the menu, then
        // restore its scroll position after applying the final viewport size.
        this.menu.style.height = 'auto';
        menuHeight = Math.min(this.options.scrollHeight, portrait ? 30 * font : 200);
      }
      const above = Math.max(0, rect.top - bounds.top - gutter - gap);
      const below = Math.max(0, bounds.bottom - rect.bottom - gutter - gap);
      const tagMinimum = Math.min(tagHeight, portrait ? 6 * font : 3 * font);
      const menuMinimum = Math.min(menuHeight, portrait ? 5 * font : 40);
      let tagLimit = above, menuLimit = below;
      let tagTop, menuTop;
      if (tagHeight && above < tagMinimum && below > above) {
        // At the top of the viewport, keep selections and options together below.
        menuLimit = this.menu ? Math.min(menuHeight, Math.max(menuMinimum, below / 2)) : 0;
        tagLimit = Math.max(0, below - menuLimit - (this.menu ? gap : 0));
        tagTop = rect.bottom + gap;
        menuTop = tagTop + Math.min(tagHeight, tagLimit) + gap;
      } else if (this.menu && below < menuMinimum && above > below) {
        // At the bottom, put options above the field with selections above them.
        menuLimit = Math.min(menuHeight, tagHeight ? Math.max(menuMinimum, above / 2) : above);
        tagLimit = Math.max(0, above - menuLimit - (tagHeight ? gap : 0));
        menuTop = rect.top - gap - menuLimit;
        tagTop = menuTop - gap - Math.min(tagHeight, tagLimit);
      } else {
        tagTop = rect.top - gap - Math.min(tagHeight, tagLimit);
        menuTop = rect.bottom + gap;
      }
      if (this.count) {
        this.pane.style.maxHeight = `${Math.max(0, tagLimit)}px`;
        this.pane.scrollTop = selectedScrollTop;
        this.pane.style.left = `${center - this.pane.offsetWidth / 2}px`;
        this.pane.style.top = `${Math.max(bounds.top + gutter, tagTop)}px`;
        this.pane.style.visibility = 'visible';
      }
      if (this.menu) {
        this.menu.style.left = `${rect.left}px`;
        this.menu.style.top = `${menuTop}px`;
        this.menu.style.height = `${Math.max(0, Math.min(menuHeight, menuLimit))}px`;
        this.options.scrollTop = optionScrollTop;
        this.menu.style.visibility = 'visible';
      }
    }
  }

  document.addEventListener('pointerdown', event => {
    if (active && !active.contains(event.target)) active.close();
  }, true);
  document.addEventListener('focusin', event => {
    if (active && !active.contains(event.target)) active.close();
  }, true);
  document.addEventListener('keydown', event => {
    if (active && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      active.close();
    }
  }, true);
  document.addEventListener('scroll', event => {
    if (active && !active.pane.contains(event.target) && !active.menu?.contains(event.target)) schedulePosition();
  }, true);
  window.addEventListener('resize', schedulePosition);
  window.visualViewport?.addEventListener('resize', schedulePosition);
  window.visualViewport?.addEventListener('scroll', schedulePosition);
  window.addEventListener('pagehide', () => active?.close(false));

  window.ModalTagFields = {
    attach(config) {
      if (!config.control || !config.input || !config.tags) return null;
      if (!fields.has(config.control)) fields.set(config.control, new TagField(config));
      return fields.get(config.control);
    },
  };
})();
