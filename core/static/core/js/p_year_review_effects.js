/* Canvas celebrations; Twemoji artwork by Twitter, Inc. and other contributors.
 * CC BY 4.0: https://github.com/jdecked/twemoji — local attribution accompanies the SVGs. */
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
    snow: ['light', 'pink', 'cake'].includes(document.body.dataset.theme) ? '#8196a4' : '#f6f5ed',
  };
  let enabled = !motion.matches;
  let active = true;
  let frame = 0;
  let previous = 0;
  let elapsed = 0;
  let nextFirework = 2.5;

  const scenes = [...root.querySelectorAll('[data-review-scene]')].map(canvas => ({
    canvas, context: canvas.getContext('2d'), kind: canvas.dataset.reviewScene,
    width: 0, height: 0, visible: false, cache: null, bursts: [], rockets: [],
    particles: Array.from({ length: 42 }, () => ({
      x: random(), y: random(), size: 1.2 + random() * 3.8,
      speed: .018 + random() * .038, phase: random() * Math.PI * 2,
    })),
  })).filter(scene => scene.context);
  if (!scenes.length) { if (toggle) toggle.hidden = true; return; }

  const ambient = scenes.find(scene => scene.kind === 'ambient');
  // Extra snow/confetti belongs only to the foreground. Keep the original
  // heart/fire seed particles and their drawing code exactly as they were.
  if (ambient) {
    ambient.visible = true;
    ambient.particles.push(...Array.from({ length: 54 }, () => ({
      x: random(), y: random(), size: 1.2 + random() * 3.8,
      speed: .018 + random() * .038, phase: random() * Math.PI * 2,
    })));
  }
  const friend = document.getElementById('review-snowfriend');
  const guestArt = [...(friend?.querySelectorAll('[data-review-guest]') || [])];
  const guestLights = [...(friend?.querySelectorAll('.review-corner-lights circle') || [])];
  const guestGift = friend?.querySelector('[data-review-guest-gift]');
  const guestBubble = friend?.querySelector('.review-corner-bubble');
  const unavailableGuests = new Set();
  const guestDetails = {
    snowman: { tilt: -12, title: 'Shake a little snow loose', label: 'Shake the snowman for a snow shower', bubble: 'Snow much fun!' },
    tree: { tilt: -7, title: 'A little gift from the tree', label: 'Shake the Christmas tree for a shower of tiny gifts', bubble: 'A little gift for you!' },
    party: { tilt: -13, title: 'Launch a little celebration', label: 'Launch a celebration from the party popper', bubble: 'Make a little noise!' },
  };
  // The corner guest has its own randomness, so the original scene seeds stay intact.
  const guestRandom = () => Math.random();
  const cornerParticles = [];
  let friendHovered = false, friendFocused = false, boopUntil = 0;
  let friendSize = 116, friendX = 12, friendY = 0, guestKind = 'snowman';
  let guestStart = 0, guestUntil = 0, guestVisits = 0, nextGuestAt = 4 + guestRandom() * 5;
  let nextGuestFlake = 0, nextGuestClick = 0;
  function measureFriend() {
    if (!friend || !ambient) return;
    const computed = getComputedStyle(friend);
    friendSize = parseFloat(computed.getPropertyValue('--review-friend-size')) || 116;
    friendX = parseFloat(computed.left) || 12;
    friendY = ambient.height - (parseFloat(computed.bottom) || 12) - friendSize;
  }
  function resetFriend() {
    friendHovered = false;friendFocused = false;boopUntil = 0;
    guestUntil = 0;nextGuestAt = elapsed + 4 + guestRandom() * 5;
    nextGuestClick = 0;cornerParticles.length = 0;
    if (friend) { friend.hidden = true;friend.classList.remove('is-celebrating'); }
  }
  function visitFriend() {
    const choices = edition === 'winter' ? ['snowman', 'snowman', 'snowman', 'tree', 'tree', 'party'] :
      edition === 'midnight' ? ['snowman', 'snowman', 'tree', 'party', 'party', 'party'] : ['snowman', 'snowman', 'tree', 'tree', 'party', 'party', 'party'];
    const available = choices.filter(kind => !unavailableGuests.has(kind));
    if (!available.length || !guestArt.length) return;
    guestKind = guestVisits === 0 && !unavailableGuests.has('snowman') ? 'snowman' : available[Math.floor(guestRandom() * available.length)];
    guestVisits++;
    const detail = guestDetails[guestKind];
    guestArt.forEach(art => { art.hidden = art.dataset.reviewGuest !== guestKind; });
    friend.title = detail.title;friend.setAttribute('aria-label', detail.label);
    if (guestBubble) guestBubble.textContent = detail.bubble;
    guestStart = elapsed;guestUntil = elapsed + 12 + guestRandom() * 6;nextGuestFlake = elapsed + .3;
    friend.hidden = false;
  }
  function addCornerParticle(kind, x, y, options = {}) {
    if (cornerParticles.length >= 112) return;
    cornerParticles.push({ kind, x, y, born: elapsed, life: 1.6 + guestRandom() * .7,
      vx: (guestRandom() - .5) * 80, vy: -35 - guestRandom() * 65, gravity: 65,
      size: 2 + guestRandom() * 2, phase: guestRandom() * Math.PI * 2,
      color: [palette.cream, palette.rose, palette.second, palette.green][Math.floor(guestRandom() * 4)], ...options });
  }
  function cornerBurst(kind, x, y) {
    const count = kind === 'tree' ? 30 : kind === 'party' ? 42 : 34;
    for (let index = 0; index < count; index++) {
      if (kind === 'snowman') {
        addCornerParticle('snow', x + (guestRandom() - .5) * friendSize * .4, y,
          { color: palette.snow, vx: (guestRandom() - .5) * 125, vy: -20 - guestRandom() * 75, gravity: 62, size: 2 + guestRandom() * 2.7 });
      } else if (kind === 'tree') {
        addCornerParticle(index % 4 === 0 ? 'gift' : 'star', x, y,
          { vy: -65 - guestRandom() * 100, vx: (guestRandom() - .4) * 100, gravity: 115, size: index % 4 === 0 ? 14 + guestRandom() * 7 : 2.5 + guestRandom() * 2.5 });
      } else {
        const angle = index * Math.PI * 2 / count, speed = 30 + guestRandom() * 65;
        addCornerParticle(index % 3 === 0 ? 'star' : 'confetti', x, y,
          { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 15, gravity: 45, life: 1.4 + guestRandom() * .6 });
      }
    }
  }
  function paintFriend() {
    if (!friend || !ambient || !enabled) return;
    if (friend.hidden) {
      if (elapsed < nextGuestAt) return;
      visitFriend();
      if (friend.hidden) return;
    }
    const caught = elapsed < boopUntil;
    if (friendHovered || friendFocused || caught) guestUntil = Math.max(guestUntil, elapsed + 1.2);
    if (elapsed >= guestUntil) {
      friend.hidden = true;nextGuestAt = elapsed + 15 + guestRandom() * 15;
      friend.classList.remove('is-celebrating');return;
    }
    const age = elapsed - guestStart;
    const tilt = guestDetails[guestKind].tilt + Math.sin(age * 1.35) * 2.8 + (caught ? Math.sin((boopUntil - elapsed) * 22) * 7 : 0);
    friend.classList.toggle('is-celebrating', caught);
    friend.style.opacity = String(Math.min(1, age / .65, (guestUntil - elapsed) / .55));
    friend.style.transform = `rotate(${tilt.toFixed(2)}deg)`;
    if (guestKind === 'tree') guestLights.forEach((light, index) => {
      light.style.opacity = String(.2 + (Math.sin(elapsed * (caught ? 8 : 2) + index * 1.7) + 1) * .4);
    });
    if (guestKind === 'snowman' && elapsed >= nextGuestFlake) {
      addCornerParticle('snow', friendX + friendSize * (.28 + guestRandom() * .42), friendY + friendSize * .4,
        { color: palette.snow, vx: 3 + guestRandom() * 14, vy: 9 + guestRandom() * 10, gravity: 10, life: 2.4, size: 1.8 + guestRandom() * 1.6 });
      nextGuestFlake = elapsed + .28 + guestRandom() * .25;
    }
  }
  friend?.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse' || event.pointerType === 'pen') friendHovered = true; });
  friend?.addEventListener('pointerleave', () => { friendHovered = false; });
  friend?.addEventListener('pointercancel', () => { friendHovered = false; });
  friend?.addEventListener('focus', () => { friendFocused = friend.matches(':focus-visible'); });
  friend?.addEventListener('blur', () => { friendFocused = false; });
  guestArt.forEach(art => art.querySelector('img')?.addEventListener('error', () => {
    unavailableGuests.add(art.dataset.reviewGuest);
    if (guestKind === art.dataset.reviewGuest) { friend.hidden = true;nextGuestAt = elapsed + 2; }
  }, { once: true }));
  friend?.addEventListener('click', event => {
    event.preventDefault();event.stopPropagation();
    if (!enabled || !active || friend.hidden || !ambient || elapsed < nextGuestClick) return;
    if (event.detail !== 0) { friendFocused = false;friend.blur(); }
    boopUntil = elapsed + 1.6;nextGuestClick = elapsed + .65;
    const x = friendX + friendSize * .55, y = friendY + friendSize * .35;
    if (guestKind === 'party') {
      if (ambient.rockets.length < 3) ambient.rockets.push({ corner: true, start: x, startY: y,
        x: Math.min(ambient.width - 45, x + 55 + guestRandom() * 55),
        y: Math.max(65, y - 130 - guestRandom() * 90), born: elapsed });
    } else cornerBurst(guestKind, x, y);
    wake();
  });
  measureFriend();

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

  function snowflake(context, x, y, size, turn = 0) {
    context.save();context.translate(x, y);context.rotate(turn);
    context.beginPath();
    for (let arm = 0; arm < 6; arm++) {
      const angle = arm * Math.PI / 3, dx = Math.cos(angle), dy = Math.sin(angle);
      context.moveTo(0, 0);context.lineTo(dx * size, dy * size);
      for (const direction of [-1, 1]) {
        const branch = angle + direction * Math.PI / 3;
        context.moveTo(dx * size * .55, dy * size * .55);
        context.lineTo(dx * size * .55 + Math.cos(branch) * size * .3, dy * size * .55 + Math.sin(branch) * size * .3);
      }
    }
    context.stroke();context.restore();
  }

  function heart(context, x, y, size) {
    context.save();context.translate(x, y);context.scale(size / 24, size / 24);
    context.beginPath();context.moveTo(0, 8);
    context.bezierCurveTo(-23, -6, -9, -23, 0, -12);
    context.bezierCurveTo(9, -23, 23, -6, 0, 8);
    context.fill();context.restore();
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
    } else if (edition === 'midnight') {
      // The clock is decoration, deliberately fixed at a minute to midnight.
      const x = w * .83, y = h * .57, radius = Math.min(h * .45, w * .18);
      context.strokeStyle = palette.accent;context.globalAlpha = .3;
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
      context.globalAlpha = .13;context.lineWidth = .8;
      const fan = Math.min(h * .62, w * .22);
      for (let index = 0; index < 10; index++) {
        const angle = Math.PI * (.52 + index * .05);
        context.beginPath();context.moveTo(w + 5 + Math.cos(angle) * fan * .36, -5 + Math.sin(angle) * fan * .36);
        context.lineTo(w + 5 + Math.cos(angle) * fan, -5 + Math.sin(angle) * fan);context.stroke();
      }
      context.beginPath();context.arc(w + 5, -5, fan * .36, Math.PI * .52, Math.PI * .97);context.stroke();
    } else {
      // Cached paper streamers complement the illustrated ribbon and party popper.
      context.globalAlpha = .45;context.lineWidth = 5;
      [palette.rose, palette.second, palette.cream].forEach((color, index) => {
        context.strokeStyle = color;context.beginPath();context.moveTo(w * (.7 + index * .1), -10);
        context.bezierCurveTo(w * (.54 + index * .1), 85, w * (.98 - index * .05), 80, w * (.86 + index * .05), h * .48);
        context.stroke();
      });
      context.strokeStyle = palette.second;context.lineWidth = 3;context.globalAlpha = .35;
      context.beginPath();context.moveTo(w * .5, h + 5);
      context.bezierCurveTo(w * .45, h * .64, w * .88, h * 1.05, w * .68, h * .86);context.stroke();
      for (let index = 0; index < 16; index++) {
        context.globalAlpha = .25;
        star(context, (index * .137 % 1) * w, 15 + (index * .237 % 1) * (h - 30), 3 + index % 3, index % 2 ? palette.second : palette.cream);
      }
    }
    context.globalAlpha = 1;
    if (scene.cache) { scene.cache.width = 1;scene.cache.height = 1; }
    scene.cache = cache;
  }

  function resizeScene(scene) {
    const box = scene.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(box.width)), h = Math.max(1, Math.round(box.height));
    const maximumPixels = scene.kind === 'ambient' ? 1000000 : 800000;
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
    const pairs = [[palette.cream, palette.rose], ['#a9d8c8', '#f2bd80'], ['#c7b2e3', '#f3cf86']];
    const colors = edition === 'winter' ? [palette.snow, palette.second] : pairs[Math.floor(random() * pairs.length)];
    const count = interactive ? 48 : 40;
    scene.bursts.push({ x, y, born: elapsed, life: 1.9 + random() * .7,
      particles: Array.from({ length: count }, (_, index) => {
        const angle = index * Math.PI * 2 / count + random() * .18;
        const speed = 45 + random() * 110;
        return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          color: colors[index % colors.length], phase: random() * Math.PI * 2, size: 1.2 + random() * 1.5 };
      }),
    });
  }

  function paintBursts(scene, time) {
    if (!scene.bursts.length) return;
    const context = scene.context;
    scene.bursts = scene.bursts.filter(item => time - item.born < item.life);
    for (const item of scene.bursts) {
      const age = time - item.born, fade = Math.max(0, 1 - age / item.life);
      context.globalAlpha = fade * .8;
      for (const particle of item.particles) {
        const x = item.x + particle.vx * age, y = item.y + particle.vy * age + 23 * age * age;
        if (edition === 'confetti') {
          context.save();context.translate(x, y);context.rotate(age * 3 + particle.phase);
          context.fillStyle = particle.color;context.fillRect(-3.5, -1.8, 7, 3.6);context.restore();
        } else if (edition === 'winter') {
          context.strokeStyle = particle.color;context.lineWidth = 1.1;
          snowflake(context, x, y, particle.size * 3, age * .7 + particle.phase);
        } else {
          context.strokeStyle = particle.color;context.lineWidth = particle.size;
          context.beginPath();context.moveTo(x - particle.vx * .055, y - (particle.vy + 46 * age) * .055);
          context.lineTo(x, y);context.stroke();
        }
      }
    }
    context.globalAlpha = 1;
  }

  function paintCornerParticles(scene, time) {
    const context = scene.context;
    for (let index = cornerParticles.length - 1; index >= 0; index--) {
      const particle = cornerParticles[index], age = time - particle.born;
      if (age >= particle.life) { cornerParticles.splice(index, 1);continue; }
      const fade = Math.min(1, (particle.life - age) / .65);
      const x = particle.x + particle.vx * age, y = particle.y + particle.vy * age + particle.gravity * age * age / 2;
      context.globalAlpha = fade * .82;
      if (particle.kind === 'snow') {
        context.strokeStyle = particle.color;context.lineWidth = 1;
        snowflake(context, x, y, particle.size, particle.phase + age * .6);
      } else if (particle.kind === 'gift' && guestGift?.complete && guestGift.naturalWidth) {
        context.save();context.translate(x, y);context.rotate(Math.sin(particle.phase + age * 3) * .5);
        context.drawImage(guestGift, -particle.size / 2, -particle.size / 2, particle.size, particle.size);context.restore();
      } else if (particle.kind === 'confetti') {
        context.save();context.translate(x, y);context.rotate(particle.phase + age * 4);
        context.fillStyle = particle.color;context.fillRect(-3, -1.5, 6, 3);context.restore();
      } else star(context, x, y, particle.size, particle.color);
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
      const count = Math.min(particles.length, Math.max(30, Math.ceil(w / (edition === 'winter' ? 17 : 33))));
      for (let index = 0; index < count; index++) {
        const particle = particles[index];
        if (edition === 'winter') {
          const progress = (particle.y + time * particle.speed * 1.15) % 1;
          const x = particle.x * w + Math.sin(time * .35 + particle.phase) * 24;
          const y = progress * (h + 24) - 12;
          context.globalAlpha = .2 + particle.size * .09;
          if (index % 9 === 0) {
            context.strokeStyle = palette.snow;context.lineWidth = .9;
            snowflake(context, x, y, 3 + particle.size, time * .12 + particle.phase);
          } else {
            context.fillStyle = palette.snow;context.beginPath();
            context.arc(x, y, .7 + particle.size * .48, 0, Math.PI * 2);context.fill();
          }
        } else if (edition === 'confetti') {
          const x = particle.x * w + Math.sin(time * .3 + particle.phase) * 23;
          const y = ((particle.y + time * particle.speed * .6) % 1) * (h + 20) - 10;
          context.save();context.translate(x, y);context.rotate(time * .7 + particle.phase);
          context.globalAlpha = .26 + particle.x * .17;
          context.fillStyle = [palette.rose, palette.second, palette.accent][index % 3];
          if (index % 11 === 0) {
            context.strokeStyle = context.fillStyle;context.lineWidth = 1.5;
            context.beginPath();context.moveTo(-3, -10);context.bezierCurveTo(8, -8, -8, 3, 3, 10);context.stroke();
          } else context.fillRect(-1.6, -3.5, 3.2, 7);
          context.restore();
        } else if (index < 22) {
          context.globalAlpha = .08 + (Math.sin(time * .8 + particle.phase) + 1) * .12;
          star(context, particle.x * w, particle.y * h, particle.size, palette.accent);
        }
      }
      for (let index = scene.rockets.length - 1; index >= 0; index--) {
        const rocket = scene.rockets[index], progress = (time - rocket.born) / .85;
        if (progress >= 1) {
          if (progress < 2) {
            if (rocket.corner) cornerBurst('party', rocket.x, rocket.y);
            else burst(scene, rocket.x, rocket.y);
          }
          scene.rockets.splice(index, 1);
          continue;
        }
        const ease = 1 - (1 - progress) ** 1.6;
        const startY = rocket.startY ?? h + 8;
        const x = rocket.start + (rocket.x - rocket.start) * ease, y = startY + (rocket.y - startY) * ease;
        context.globalAlpha = .55;context.strokeStyle = palette.cream;context.lineWidth = 1.2;
        context.beginPath();context.moveTo(x, y + 18 * (1 - progress));context.lineTo(x, y);context.stroke();
        star(context, x, y, 2.3, palette.cream);
      }
    }
    context.globalAlpha = 1;paintBursts(scene, time);
    if (scene.kind === 'ambient') paintCornerParticles(scene, time);
  }

  function draw(now) {
    frame = 0;
    if (!active || !enabled || document.hidden) return;
    // One shared, capped 30 fps loop. Geometry is cached outside this loop.
    if (previous && now - previous < 32) { frame = requestAnimationFrame(draw); return; }
    const dt = previous ? Math.min((now - previous) / 1000, .08) : 0;
    previous = now;elapsed += dt;
    if (ambient?.visible && edition !== 'winter' && elapsed >= nextFirework) {
      if (ambient.rockets.length < 2) {
        const x = ambient.width * (.16 + random() * .68);
        ambient.rockets.push({ x, y: ambient.height * (.14 + random() * .4), start: x + (random() - .5) * 100, born: elapsed });
      }
      nextFirework = elapsed + 5 + random() * 4;
    }
    scenes.forEach(scene => { if (scene.visible) paint(scene, elapsed); });
    paintFriend();
    if (scenes.some(scene => scene.visible)) frame = requestAnimationFrame(draw);
  }

  function wake() {
    if (!frame && enabled && active && !document.hidden && scenes.some(scene => scene.visible)) frame = requestAnimationFrame(draw);
  }
  function stop() { cancelAnimationFrame(frame);frame = 0;previous = 0; }
  function updateToggle() {
    if (!active) return;
    root.classList.toggle('review-effects-paused', !enabled);
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(enabled));
      toggle.title = enabled ? 'Pause background effects' : 'Play background effects';
    }
    stop();
    resetFriend();
    scenes.forEach(scene => { scene.bursts.length = 0;scene.rockets.length = 0;paint(scene, 0); });
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
  const resize = 'ResizeObserver' in window ? new ResizeObserver(() => { if (!active) return;scenes.forEach(resizeScene);measureFriend();if (!enabled) scenes.forEach(scene => paint(scene, 0));wake(); }) : null;
  scenes.forEach(scene => {
    resizeScene(scene);
    if (visibility) visibility.observe(scene.canvas);else scene.visible = true;
    resize?.observe(scene.canvas);
  });
  measureFriend();
  window.addEventListener('resize', () => { if (!active) return;scenes.forEach(resizeScene);measureFriend();if (!enabled) scenes.forEach(scene => paint(scene, 0));wake(); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop();else wake(); });
  document.addEventListener('click', event => {
    if (!enabled || !active || event.target.closest('a, button, summary, input, select, textarea, [role="button"], [contenteditable="true"]')) return;
    if (!ambient) return;
    burst(ambient, event.clientX, event.clientY, true);
    wake();
  });
  window.addEventListener('pagehide', () => {
    active = false;stop();visibility?.disconnect();resize?.disconnect();
    resetFriend();
    scenes.forEach(scene => { scene.bursts.length = 0;scene.rockets.length = 0;if (scene.cache) { scene.cache.width = 1;scene.cache.height = 1; }scene.cache = null;scene.canvas.width = 1;scene.canvas.height = 1; });
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    active = true;
    scenes.forEach(scene => { resizeScene(scene);visibility?.observe(scene.canvas);resize?.observe(scene.canvas); });
    measureFriend();
    updateToggle();
  });
  updateToggle();
});
