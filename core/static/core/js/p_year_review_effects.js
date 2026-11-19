/* Procedural decorations only: no image downloads, libraries or per-particle DOM. */
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('year-review');
  if (!root) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const toggle = document.getElementById('review-effects-toggle');
  const edition = root.dataset.edition;
  const year = Number(root.dataset.year) || 1;
  let seed = year;
  const random = () => { seed = Math.imul(seed ^ (seed >>> 16), 2246822507); return (seed >>> 0) / 4294967296; };
  const style = getComputedStyle(root);
  const palette = {
    accent: style.getPropertyValue('--review-accent').trim() || '#d8b976',
    second: style.getPropertyValue('--review-accent-2').trim() || '#9eb9cf',
    rose: '#da8794', cream: '#f2d9a4', green: '#699783',
  };
  let enabled = !motion.matches;
  let active = true;
  let frame = 0;
  let previous = 0;
  let elapsed = 0;
  let nextFirework = 2.5;

  const scenes = [...root.querySelectorAll('[data-review-scene]')].map(canvas => ({
    canvas, context: canvas.getContext('2d'), kind: canvas.dataset.reviewScene,
    width: 0, height: 0, visible: false, cache: null, bursts: [],
    particles: Array.from({ length: 42 }, () => ({
      x: random(), y: random(), size: 1.2 + random() * 3.8,
      speed: .018 + random() * .038, phase: random() * Math.PI * 2,
    })),
  })).filter(scene => scene.context);
  if (!scenes.length) { if (toggle) toggle.hidden = true; return; }

  function star(context, x, y, radius, color, points = 4) {
    context.fillStyle = color;
    context.beginPath();
    for (let point = 0; point < points * 2; point++) {
      const angle = -Math.PI / 2 + point * Math.PI / points;
      const length = point % 2 ? radius * .28 : radius;
      const px = x + Math.cos(angle) * length, py = y + Math.sin(angle) * length;
      if (point) context.lineTo(px, py); else context.moveTo(px, py);
    }
    context.closePath();context.fill();
  }

  function heart(context, x, y, size) {
    context.save();context.translate(x, y);context.scale(size / 24, size / 24);
    context.beginPath();context.moveTo(0, 8);
    context.bezierCurveTo(-23, -6, -9, -23, 0, -12);
    context.bezierCurveTo(9, -23, 23, -6, 0, 8);
    context.fill();context.restore();
  }

  function bow(context, x, y, size, color) {
    context.save();context.translate(x, y);context.scale(size, size);
    context.fillStyle = color;context.globalAlpha = .65;
    context.beginPath();context.moveTo(0, 0);
    context.bezierCurveTo(-48, -43, -50, 16, 0, 3);
    context.bezierCurveTo(50, 16, 48, -43, 0, 0);context.fill();
    context.beginPath();context.moveTo(-4, 2);context.lineTo(-20, 40);
    context.lineTo(-6, 33);context.lineTo(0, 42);context.lineTo(3, 3);context.fill();
    context.beginPath();context.moveTo(3, 2);context.lineTo(28, 32);
    context.lineTo(15, 30);context.lineTo(14, 39);context.lineTo(-2, 3);context.fill();
    context.fillStyle = palette.cream;context.beginPath();context.arc(0, 1, 4, 0, Math.PI * 2);context.fill();
    context.restore();
  }

  function decorateHero(scene) {
    const { width: w, height: h } = scene;
    const cache = document.createElement('canvas');
    cache.width = scene.canvas.width;cache.height = scene.canvas.height;
    const context = cache.getContext('2d');
    if (!context) return;
    context.scale(cache.width / w, cache.height / h);
    context.lineWidth = 1;
    if (edition === 'winter') {
      // A looping light cord, glass ornaments, a layered evergreen and presents.
      context.strokeStyle = palette.green;context.globalAlpha = .48;
      context.beginPath();context.moveTo(0, 0);context.quadraticCurveTo(w * .5, 63, w, 0);context.stroke();
      for (let index = 1; index < 16; index++) {
        const x = w * index / 16, y = 126 * (index / 16) * (1 - index / 16);
        context.fillStyle = [palette.cream, palette.rose, palette.green][index % 3];
        context.beginPath();context.arc(x, y + 4, 2.7, 0, Math.PI * 2);context.fill();
        if (index % 4 === 0) {
          context.beginPath();context.moveTo(x, y);context.lineTo(x, y + 20);context.stroke();
          context.beginPath();context.arc(x, y + 27, 7, 0, Math.PI * 2);context.fill();
          context.fillStyle = '#fff';context.globalAlpha = .5;
          context.beginPath();context.arc(x - 2, y + 24, 1.6, 0, Math.PI * 2);context.fill();
          context.globalAlpha = .48;
        }
      }
      const x = w * .93, base = h + 6, height = Math.min(h * .8, 275);
      context.fillStyle = '#76553e';context.fillRect(x - 8, base - 28, 16, 36);
      for (let layer = 3; layer >= 0; layer--) {
        const top = base - height + layer * height * .18;
        const bottom = top + height * .47, spread = height * (.18 + layer * .065);
        context.fillStyle = ['#507e69', '#436c59', '#355a49', '#294b3e'][layer];
        context.globalAlpha = .68;context.beginPath();context.moveTo(x, top);
        context.quadraticCurveTo(x - spread * .45, bottom - 17, x - spread, bottom);
        context.quadraticCurveTo(x, bottom + 10, x + spread, bottom);
        context.quadraticCurveTo(x + spread * .45, bottom - 17, x, top);context.fill();
      }
      context.globalAlpha = .8;
      for (let index = 0; index < 18; index++) {
        const depth = .18 + index / 25, spread = depth * height * .36;
        const px = x + Math.sin(index * 2.4) * spread, py = base - height + depth * height;
        context.fillStyle = [palette.cream, palette.rose, '#b7d5b4'][index % 3];
        context.beginPath();context.arc(px, py, 2.3 + index % 2, 0, Math.PI * 2);context.fill();
      }
      star(context, x, base - height, 12, palette.cream, 5);
      context.globalAlpha = .55;
      context.fillStyle = palette.rose;context.fillRect(x - 76, base - 31, 32, 27);
      context.fillStyle = palette.cream;context.fillRect(x - 63, base - 31, 5, 27);
      bow(context, x - 60, base - 32, .35, palette.rose);
      context.fillStyle = palette.green;context.fillRect(x + 31, base - 45, 37, 41);
      context.fillStyle = palette.cream;context.fillRect(x + 46, base - 45, 5, 41);
      bow(context, x + 49, base - 45, .38, palette.cream);
    } else if (edition === 'midnight') {
      // The clock is decoration, deliberately fixed at a minute to midnight.
      const x = w * .83, y = h * .57, radius = Math.min(h * .45, w * .18);
      context.strokeStyle = palette.accent;context.globalAlpha = .2;
      context.beginPath();context.arc(x, y, radius, 0, Math.PI * 2);context.stroke();
      context.beginPath();context.arc(x, y, radius - 7, 0, Math.PI * 2);context.stroke();
      for (let index = 0; index < 60; index++) {
        const angle = index * Math.PI / 30, inner = radius - (index % 5 ? 11 : 18);
        context.beginPath();context.moveTo(x + Math.sin(angle) * inner, y - Math.cos(angle) * inner);
        context.lineTo(x + Math.sin(angle) * (radius - 4), y - Math.cos(angle) * (radius - 4));context.stroke();
      }
      context.lineWidth = 2;context.beginPath();context.moveTo(x, y);
      context.lineTo(x - radius * .08, y - radius * .74);context.moveTo(x, y);
      context.lineTo(x - radius * .05, y - radius * .49);context.stroke();
      for (let index = 0; index < 7; index++) {
        const px = w * (.08 + index * .145), py = 23 + Math.sin(index * 1.8) * 14;
        context.globalAlpha = .4;context.lineWidth = .8;
        context.beginPath();context.moveTo(px, 0);context.lineTo(px, py);context.stroke();
        star(context, px, py + 6, index % 2 ? 6 : 9, palette.accent, 5);
      }
    } else {
      // Paper streamers and two fabric bows frame the collage without covering it.
      context.globalAlpha = .45;context.lineWidth = 5;
      [palette.rose, palette.second, palette.cream].forEach((color, index) => {
        context.strokeStyle = color;context.beginPath();context.moveTo(w * (.7 + index * .1), -10);
        context.bezierCurveTo(w * (.54 + index * .1), 85, w * (.98 - index * .05), 80, w * (.86 + index * .05), h * .48);
        context.stroke();
      });
      bow(context, w * .88, 34, .85, palette.rose);
      bow(context, w * .06, h - 25, .65, palette.second);
      for (let index = 0; index < 16; index++) {
        context.globalAlpha = .25;
        star(context, (index * .137 % 1) * w, 15 + (index * .237 % 1) * (h - 30), 3 + index % 3, index % 2 ? palette.second : palette.cream);
      }
    }
    context.globalAlpha = 1;
    scene.cache = cache;
  }

  function resizeScene(scene) {
    const box = scene.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(box.width)), h = Math.max(1, Math.round(box.height));
    const maximumPixels = scene.kind === 'ambient' ? 550000 : 800000;
    const density = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(maximumPixels / (w * h)));
    const width = Math.max(1, Math.round(w * density)), height = Math.max(1, Math.round(h * density));
    if (scene.canvas.width === width && scene.canvas.height === height && scene.width === w && scene.height === h) return;
    scene.canvas.width = width;scene.canvas.height = height;scene.width = w;scene.height = h;
    scene.context.setTransform(width / w, 0, 0, height / h, 0, 0);
    if (scene.kind === 'celebration') decorateHero(scene);
    if (scene.kind === 'fire') {
      scene.fireGradient = scene.context.createLinearGradient(0, h, 0, h * .18);
      scene.fireGradient.addColorStop(0, '#d0522b00');scene.fireGradient.addColorStop(.35, '#d45d3266');
      scene.fireGradient.addColorStop(.78, '#e9a04c44');scene.fireGradient.addColorStop(1, '#f2c98100');
      scene.glowGradient = scene.context.createLinearGradient(0, h, 0, h * .3);
      scene.glowGradient.addColorStop(0, '#d056261c');scene.glowGradient.addColorStop(1, '#d0562600');
    }
  }

  function burst(scene, x, y, interactive = false) {
    if (!enabled || !scene?.visible || scene.bursts.length >= 4) return;
    const colors = [palette.accent, palette.second, palette.cream, palette.rose];
    const count = interactive ? 32 : 28;
    scene.bursts.push({ x, y, born: elapsed, life: 1.9 + random() * .7,
      particles: Array.from({ length: count }, (_, index) => {
        const angle = index * Math.PI * 2 / count + random() * .18;
        const speed = 35 + random() * 85;
        return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          color: colors[index % colors.length], phase: random() * Math.PI * 2, size: 1.2 + random() * 1.5 };
      }),
    });
  }

  function paintBursts(scene, time) {
    const context = scene.context;
    scene.bursts = scene.bursts.filter(item => time - item.born < item.life);
    for (const item of scene.bursts) {
      const age = time - item.born, fade = Math.max(0, 1 - age / item.life);
      context.globalAlpha = fade * .8;
      for (const particle of item.particles) {
        const x = item.x + particle.vx * age, y = item.y + particle.vy * age + 23 * age * age;
        if (edition === 'confetti') {
          context.save();context.translate(x, y);context.rotate(age * 3 + particle.phase);
          context.fillStyle = particle.color;context.fillRect(-3, -1.5, 6, 3);context.restore();
        } else if (edition === 'winter') {
          star(context, x, y, particle.size * 2, particle.color);
        } else {
          context.strokeStyle = particle.color;context.lineWidth = particle.size;
          context.beginPath();context.moveTo(x - particle.vx * .055, y - (particle.vy + 46 * age) * .055);
          context.lineTo(x, y);context.stroke();
        }
      }
    }
    context.globalAlpha = 1;
  }

  function paint(scene, time) {
    const { context, width: w, height: h, particles } = scene;
    context.clearRect(0, 0, w, h);
    if (scene.kind === 'celebration') {
      if (scene.cache) context.drawImage(scene.cache, 0, 0, w, h);
      if (edition === 'winter') {
        for (let index = 0; index < 14; index++) {
          const x = w * (index + 1) / 16, y = 126 * ((index + 1) / 16) * (1 - (index + 1) / 16);
          context.globalAlpha = .2 + (Math.sin(time * 1.4 + index) + 1) * .25;
          star(context, x, y + 4, 4, palette.cream);
        }
      }
    } else if (scene.kind === 'hearts') {
      for (let index = 0; index < Math.min(22, Math.ceil(w / 42)); index++) {
        const particle = particles[index], progress = (particle.y + time * particle.speed) % 1;
        context.globalAlpha = Math.sin(progress * Math.PI) * .24;
        context.fillStyle = index % 3 ? palette.rose : palette.accent;
        heart(context, particle.x * w + Math.sin(time * .45 + particle.phase) * 18, h + 20 - progress * (h + 65), 10 + particle.size * 2);
      }
    } else if (scene.kind === 'fire') {
      context.globalAlpha = 1;context.fillStyle = scene.glowGradient;context.fillRect(0, 0, w, h);
      context.fillStyle = scene.fireGradient;
      const flames = Math.min(25, Math.ceil(w / 42));
      for (let index = 0; index < flames; index++) {
        const particle = particles[index], x = (index + .5) * w / flames;
        const height = h * (.22 + particle.y * .32) * (.78 + Math.sin(time * 1.5 + particle.phase) * .18);
        const width = w / flames * (.52 + particle.x * .25), lean = Math.sin(time + particle.phase) * width * .5;
        context.globalAlpha = .4 + particle.x * .4;
        context.beginPath();context.moveTo(x - width, h + 4);
        context.bezierCurveTo(x - width, h - height * .4, x + lean - width * .1, h - height * .53, x + lean, h - height);
        context.bezierCurveTo(x + lean + width * .08, h - height * .51, x + width, h - height * .4, x + width, h + 4);
        context.closePath();context.fill();
      }
      for (let index = 0; index < 24; index++) {
        const particle = particles[index], progress = (particle.y + time * particle.speed * 1.5) % 1;
        context.globalAlpha = Math.sin(progress * Math.PI) * .65;context.fillStyle = index % 3 ? '#db9c5f' : '#e2b97c';
        context.beginPath();context.arc(particle.x * w + Math.sin(time * .5 + particle.phase) * 13, h - progress * h, particle.size * .37, 0, Math.PI * 2);context.fill();
      }
    } else if (scene.kind === 'ambient') {
      const count = Math.min(particles.length, Math.ceil(w / 32));
      for (let index = 0; index < count; index++) {
        const particle = particles[index];
        if (edition === 'winter') {
          const progress = (particle.y + time * particle.speed * .4) % 1;
          context.globalAlpha = .12 + particle.x * .16;context.fillStyle = palette.accent;
          context.beginPath();context.arc(particle.x * w + Math.sin(time * .3 + particle.phase) * 17, progress * (h + 12) - 6, particle.size * .6, 0, Math.PI * 2);context.fill();
        } else if (edition === 'confetti') {
          const x = index % 2 ? w * (.94 + particle.x * .06) : w * particle.x * .06;
          const y = ((particle.y + time * particle.speed * .2) % 1) * h;
          context.save();context.translate(x, y);context.rotate(time * .3 + particle.phase);
          context.globalAlpha = .22;context.fillStyle = index % 2 ? palette.rose : palette.second;
          context.fillRect(-2, -4, 4, 8);context.restore();
        } else if (index < 18) {
          const x = index % 2 ? w * (.95 + particle.x * .05) : w * particle.x * .05;
          context.globalAlpha = .08 + (Math.sin(time * .6 + particle.phase) + 1) * .1;
          star(context, x, particle.y * h, particle.size, palette.accent);
        }
      }
    }
    context.globalAlpha = 1;paintBursts(scene, time);
  }

  function draw(now) {
    frame = 0;
    if (!active || !enabled || document.hidden) return;
    // One shared, capped 30 fps loop. Geometry is cached outside this loop.
    if (previous && now - previous < 32) { frame = requestAnimationFrame(draw); return; }
    const dt = previous ? Math.min((now - previous) / 1000, .08) : 0;
    previous = now;elapsed += dt;
    const hero = scenes.find(scene => scene.kind === 'celebration' && scene.visible);
    if (hero && edition !== 'winter' && elapsed >= nextFirework) {
      burst(hero, hero.width * (.18 + random() * .68), hero.height * (.2 + random() * .38));
      nextFirework = elapsed + 7 + random() * 4;
    }
    scenes.forEach(scene => { if (scene.visible) paint(scene, elapsed); });
    if (scenes.some(scene => scene.visible)) frame = requestAnimationFrame(draw);
  }

  function wake() {
    if (!frame && enabled && active && !document.hidden && scenes.some(scene => scene.visible)) frame = requestAnimationFrame(draw);
  }
  function stop() { cancelAnimationFrame(frame);frame = 0;previous = 0; }
  function updateToggle() {
    root.classList.toggle('review-effects-paused', !enabled);
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(enabled));
      toggle.title = enabled ? 'Pause background effects. Click empty space for a celebration.' : 'Play background effects';
    }
    stop();
    scenes.forEach(scene => { scene.bursts.length = 0;paint(scene, 0); });
    wake();
  }
  toggle?.addEventListener('click', () => { enabled = !enabled;updateToggle(); });
  motion.addEventListener('change', event => { enabled = !event.matches;updateToggle(); });

  const visibility = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      const scene = scenes.find(item => item.canvas === entry.target);
      if (scene) scene.visible = entry.isIntersecting;
    }
    wake();
  }) : null;
  const resize = 'ResizeObserver' in window ? new ResizeObserver(() => { if (!active) return;scenes.forEach(resizeScene);if (!enabled) scenes.forEach(scene => paint(scene, 0));wake(); }) : null;
  scenes.forEach(scene => {
    resizeScene(scene);
    if (visibility) visibility.observe(scene.canvas);else scene.visible = true;
    resize?.observe(scene.canvas);
  });
  window.addEventListener('resize', () => { if (!active) return;scenes.forEach(resizeScene);if (!enabled) scenes.forEach(scene => paint(scene, 0));wake(); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop();else wake(); });
  root.addEventListener('click', event => {
    if (!enabled || event.target.closest('a, button, summary, input, select, textarea, [role="button"]')) return;
    const hero = scenes.find(scene => scene.kind === 'celebration');
    const scene = hero?.canvas.parentElement.contains(event.target) ? hero : scenes.find(scene => scene.kind === 'ambient');
    if (!scene) return;
    const box = scene.canvas.getBoundingClientRect();
    burst(scene, event.clientX - box.left, event.clientY - box.top, true);
    wake();
  });
  window.addEventListener('pagehide', () => {
    active = false;stop();visibility?.disconnect();resize?.disconnect();
    scenes.forEach(scene => { scene.bursts.length = 0;scene.cache = null;scene.canvas.width = 1;scene.canvas.height = 1; });
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    active = true;
    scenes.forEach(scene => { resizeScene(scene);visibility?.observe(scene.canvas);resize?.observe(scene.canvas); });
    updateToggle();
  });
  updateToggle();
});
