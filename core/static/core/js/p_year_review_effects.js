/* Canvas celebrations; third-party artwork credits and licenses are included
 * in core/static/core/img/year_review/ATTRIBUTION.md. */
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
  // Reuse four small vector paths; particle positions, sizes and motion stay live.
  // Older canvas implementations can still use the original drawing commands.
  const shapePaths = typeof Path2D === 'function' ? { stars: new Map(), snowflake: null, heart: null } : null;
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
  // Append foreground particles after section particles so each year's seeded
  // section layouts stay the same when adding more foreground effects.
  if (ambient) {
    ambient.visible = true;
    ambient.particles.push(...Array.from({ length: 54 }, () => ({
      x: random(), y: random(), size: 1.2 + random() * 3.8,
      speed: .018 + random() * .038, phase: random() * Math.PI * 2,
    })));
  }
  const decoration = document.getElementById('review-hero-decoration');
  const decorationArt = decoration?.querySelector('[data-decoration-art]');
  const decorationCookie = decoration?.querySelector('[data-decoration-cookie]');
  const decorationKind = decoration?.dataset.decoration;
  const decorationKinds = ['tree', 'party', 'gingerbread', 'champagne', 'stockings', 'disco', 'house', 'toast', 'sleigh', 'clock'];
  // Interaction randomness never consumes the original background scene seeds.
  const heroRandom = () => Math.random();
  const heroColors = [palette.cream, palette.rose, palette.second, palette.green, '#cfb3ff'];
  const fireworkColors = ['#ffd169', '#fe8da2', '#b6e4ff', '#cfb3ff', '#9ae3cb'];
  const heroParticles = [];
  const heroParticleLimit = 200;
  let heroEmitter = null, reactionUntil = 0, nextDecorationClick = 0;

  function resetHeroEffects() {
    heroParticles.length = 0;heroEmitter = null;reactionUntil = 0;nextDecorationClick = 0;
    decoration?.classList.remove('is-reacting');
  }

  function reactDecoration(duration = .7) {
    if (!enabled || !active || document.hidden) return;
    reactionUntil = elapsed + duration;
    decoration?.classList.add('is-reacting');
    wake();
  }

  function addHeroParticle(kind, x, y, options = {}) {
    if (heroParticles.length >= heroParticleLimit) return;
    heroParticles.push({ kind, x, y, born: elapsed, life: 1.8 + heroRandom() * .6,
      vx: (heroRandom() - .5) * 150, vy: -80 - heroRandom() * 100, gravity: 95,
      size: 3 + heroRandom() * 3, phase: heroRandom() * Math.PI * 2,
      spin: (heroRandom() - .5) * 6, wobble: 0,
      color: heroColors[Math.floor(heroRandom() * heroColors.length)], ...options });
  }

  function heroShell(x, y) {
    const count = 54;
    for (let index = 0; index < count; index++) {
      const angle = index * Math.PI * 2 / count + heroRandom() * .12;
      // The outer shell travels much farther than ordinary 45–155 px/s fireworks.
      const speed = [245, 175, 110][index % 3] + heroRandom() * 25;
      addHeroParticle('firework', x, y, {
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        gravity: 25, life: 2.3 + heroRandom() * .35, size: 2.2 + heroRandom() * 1.8,
        color: fireworkColors[index % fireworkColors.length],
      });
    }
    addHeroParticle('ring', x, y, { vx: 0, vy: 0, gravity: 0, life: .8, size: 12, radiusSpeed: 150, color: '#fff2cf' });
  }

  function launchHeroRocket(x, y, targetX, targetY, life) {
    addHeroParticle('rocket', x, y, { targetX, targetY, life, size: 4, gravity: 0, color: palette.cream });
  }

  function celebrateDecoration(kind, x, y) {
    if (kind === 'party') {
      for (let index = 0; index < 3; index++) {
        const targetX = Math.max(55, Math.min(ambient.width - 55, x - 100 + (index - 1) * 155));
        const targetY = Math.max(55, y - 230 - (index % 2) * 100);
        launchHeroRocket(x, y, targetX, targetY, .55 + index * .18);
      }
      for (let index = 0; index < 26; index++) {
        addHeroParticle(index % 4 ? 'paper' : 'curl', x, y, { vx: -180 + heroRandom() * 300, vy: -130 - heroRandom() * 170, size: 5 + heroRandom() * 4, life: 3 });
      }
    } else if (kind === 'tree') {
      for (let index = 0; index < 58; index++) {
        addHeroParticle(index % 3 ? 'star' : 'ice', x + (heroRandom() - .5) * 70, y, {
          vx: -100 + heroRandom() * 180, vy: -120 - heroRandom() * 180, gravity: 115,
          size: index % 3 ? 2 + heroRandom() * 4 : 7 + heroRandom() * 7, life: 2.8,
          color: index % 3 ? ['#fff1ae', '#f2accb', '#bce9d2'][Math.floor(index / 3) % 3] : palette.snow,
        });
      }
    } else if (kind === 'gingerbread' || kind === 'stockings') {
      for (let index = 0; index < 58; index++) {
        const cookie = index % 5 === 0;
        addHeroParticle(cookie ? 'cookie' : kind === 'gingerbread' ? 'crumb' : 'paper', x + (index % 2 ? -17 : 17), y, {
          vx: -160 + heroRandom() * 290, vy: -150 - heroRandom() * 180, gravity: 210,
          life: 2.4 + heroRandom() * .5, size: cookie ? 20 + heroRandom() * 14 : 2 + heroRandom() * 4,
          color: kind === 'gingerbread' ? ['#d08b58', '#f1c492', '#fff0d8'][index % 3] : heroColors[index % heroColors.length],
        });
      }
    } else if (kind === 'champagne') {
      heroEmitter = { x, y, until: elapsed + 1.15, next: elapsed };
      addHeroParticle('cork', x, y, { vx: -160, vy: -310, gravity: 210, life: 2.6, size: 9, color: '#d9b77d', spin: -8 });
    } else if (kind === 'toast') {
      for (let index = 0; index < 64; index++) {
        const side = index % 2 ? -1 : 1;
        addHeroParticle(index % 5 ? 'bubble' : 'star', x + side * 24, y, {
          vx: side * (20 + heroRandom() * 80), vy: -100 - heroRandom() * 160, gravity: 45,
          life: 2.5 + heroRandom() * .5, size: index % 5 ? 2 + heroRandom() * 5 : 4 + heroRandom() * 3,
          color: index % 3 ? '#ffd77f' : '#fff4cf', wobble: 12,
        });
      }
      addHeroParticle('ring', x, y, { vx: 0, vy: 0, gravity: 0, life: .7, size: 12, radiusSpeed: 110, color: '#ffe0a2' });
    } else if (kind === 'disco') {
      for (let index = 0; index < 12; index++) {
        addHeroParticle('beam', x, y, { vx: 0, vy: 0, gravity: 0, size: 9, life: 1.9,
          phase: index * Math.PI * 2 / 12, spin: .45, color: fireworkColors[index % fireworkColors.length] });
      }
      for (let index = 0; index < 65; index++) {
        addHeroParticle(index % 4 ? 'star' : 'paper', x, y, { vx: (heroRandom() - .5) * 420,
          vy: -180 + heroRandom() * 220, gravity: 25, size: 2 + heroRandom() * 4,
          color: fireworkColors[index % fireworkColors.length], life: 2.4 });
      }
    } else if (kind === 'house') {
      for (let index = 0; index < 70; index++) {
        // A short snowfall spreading from the roof, rather than another idle loop.
        addHeroParticle('ice', x + (heroRandom() - .5) * Math.min(ambient.width, 620), y - 30 - heroRandom() * 180, {
          vx: -18 - heroRandom() * 45, vy: 12 + heroRandom() * 30, gravity: 18, size: 5 + heroRandom() * 10,
          life: 3.2, wobble: 18, spin: (heroRandom() - .5) * 1.2, color: index % 3 ? palette.snow : '#a8d5ee',
        });
      }
    } else if (kind === 'sleigh') {
      addHeroParticle('trail', x, y, { vx: -360, vy: -130, gravity: 0, life: 1.6, size: 12, color: '#ffe4a0' });
      for (let index = 0; index < 65; index++) {
        const delay = index * .018;
        addHeroParticle(index % 4 ? 'spark' : 'ice', x - 360 * delay, y - 130 * delay - Math.sin(delay * 2) * 50, {
          born: elapsed + delay, vx: -35 + heroRandom() * 70, vy: 10 + heroRandom() * 40,
          gravity: 25, size: index % 4 ? 2 + heroRandom() * 3 : 6 + heroRandom() * 5,
          life: 1.4, color: index % 4 ? '#fff0ba' : '#c9e9ff',
        });
      }
    } else if (kind === 'clock') {
      for (let index = 0; index < 3; index++) {
        addHeroParticle('countdown', x, y - 44, { born: elapsed + index * .4, vx: 0, vy: -25,
          gravity: 0, life: .4, size: 42, number: 3 - index, color: '#ffe8ad' });
        addHeroParticle('ring', x, y, { born: elapsed + index * .12, vx: 0, vy: 0, gravity: 0,
          life: .9, size: 18, radiusSpeed: 130, squash: .8, color: '#ffd778' });
      }
      // A timed cue shares the capped particle list and is cleared with it.
      addHeroParticle('finale', x, y, { life: 1.2, vx: 0, vy: 0, gravity: 0, size: 0 });
    }
  }

  decoration?.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') reactDecoration();
  });
  decoration?.addEventListener('focus', () => { if (decoration.matches(':focus-visible')) reactDecoration(); });
  decoration?.addEventListener('click', event => {
    event.preventDefault();event.stopPropagation();
    if (!enabled || !active || document.hidden || !ambient || !decorationKinds.includes(decorationKind) || elapsed < nextDecorationClick) return;
    // Read layout only for the interaction: the large hero artwork stays in place.
    const box = (decorationArt || decoration).getBoundingClientRect(), canvasBox = ambient.canvas.getBoundingClientRect();
    if (!canvasBox.width || !canvasBox.height) return;
    const origins = {
      tree: [.5, .32], party: [.48, .42], gingerbread: [.5, .45], champagne: [.25, .2],
      stockings: [.5, .3], disco: [.5, .5], house: [.5, .25], toast: [.5, .34],
      sleigh: [.2, .4], clock: [.5, .32],
    };
    const tip = origins[decorationKind];
    const x = (box.left + box.width * tip[0] - canvasBox.left) * ambient.width / canvasBox.width;
    const y = (box.top + box.height * tip[1] - canvasBox.top) * ambient.height / canvasBox.height;
    nextDecorationClick = elapsed + (decorationKind === 'clock' ? 2.5 : .85);
    reactDecoration(decorationKind === 'disco' ? .95 : .7);
    celebrateDecoration(decorationKind, x, y);
    wake();
  });

  function star(context, x, y, radius, color, points = 4) {
    if (shapePaths && (points === 4 || points === 5)) {
      let path = shapePaths.stars.get(points);
      if (!path) {
        path = new Path2D();
        for (let point = 0; point < points * 2; point++) {
          const angle = -Math.PI / 2 + point * Math.PI / points;
          const length = point % 2 ? .28 : 1;
          if (point) path.lineTo(Math.cos(angle) * length, Math.sin(angle) * length);
          else path.moveTo(Math.cos(angle) * length, Math.sin(angle) * length);
        }
        path.closePath();shapePaths.stars.set(points, path);
      }
      context.fillStyle = color;
      context.save();context.translate(x, y);context.scale(radius, radius);
      context.fill(path);context.restore();
      return;
    }
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
    if (shapePaths && size > 0) {
      if (!shapePaths.snowflake) {
        const path = new Path2D();
        for (let arm = 0; arm < 6; arm++) {
          const angle = arm * Math.PI / 3, dx = Math.cos(angle), dy = Math.sin(angle);
          path.moveTo(0, 0);path.lineTo(dx, dy);
          for (const direction of [-1, 1]) {
            const branch = angle + direction * Math.PI / 3;
            path.moveTo(dx * .55, dy * .55);
            path.lineTo(dx * .55 + Math.cos(branch) * .3, dy * .55 + Math.sin(branch) * .3);
          }
        }
        shapePaths.snowflake = path;
      }
      context.scale(size, size);context.lineWidth /= size;
      context.stroke(shapePaths.snowflake);context.restore();
      return;
    }
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
    if (shapePaths) {
      if (!shapePaths.heart) {
        const path = new Path2D();
        path.moveTo(0, 8);path.bezierCurveTo(-23, -6, -9, -23, 0, -12);
        path.bezierCurveTo(9, -23, 23, -6, 0, 8);shapePaths.heart = path;
      }
      context.fill(shapePaths.heart);context.restore();
      return;
    }
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

  function paintHeroParticles(scene, time) {
    const context = scene.context;
    if (heroEmitter) {
      while (heroEmitter.next <= time && heroEmitter.next < heroEmitter.until) {
        for (let index = 0; index < 6; index++) {
          addHeroParticle(index % 5 ? 'bubble' : 'spark', heroEmitter.x, heroEmitter.y, {
            born: heroEmitter.next, vx: -110 + heroRandom() * 120, vy: -130 - heroRandom() * 210,
            gravity: 135, life: 1.4 + heroRandom() * .6, size: 1.5 + heroRandom() * 3.5,
            color: index % 3 ? '#ffda8b' : '#fff5cf', wobble: 6,
          });
        }
        heroEmitter.next += .06;
      }
      if (time >= heroEmitter.until) heroEmitter = null;
    }
    for (let index = heroParticles.length - 1; index >= 0; index--) {
      const particle = heroParticles[index], age = time - particle.born;
      if (age < 0) continue;
      if (age >= particle.life) {
        heroParticles.splice(index, 1);
        if (particle.kind === 'rocket') heroShell(particle.targetX, particle.targetY);
        if (particle.kind === 'finale') {
          for (let launch = 0; launch < 3; launch++) {
            launchHeroRocket(particle.x, particle.y,
              Math.max(55, Math.min(scene.width - 55, particle.x - 100 + (launch - 1) * 150)),
              Math.max(55, particle.y - 190 - (launch % 2) * 110), .45 + launch * .15);
          }
        }
        continue;
      }
      if (particle.kind === 'finale') continue;
      const fade = Math.min(1, (particle.life - age) / .6);
      let x = particle.x + particle.vx * age + (Math.sin(particle.phase + age * 2) - Math.sin(particle.phase)) * particle.wobble;
      let y = particle.y + particle.vy * age + particle.gravity * age * age / 2;
      context.globalAlpha = fade * .95;
      if (particle.kind === 'rocket') {
        const progress = age / particle.life, ease = 1 - (1 - progress) ** 1.7;
        x = particle.x + (particle.targetX - particle.x) * ease;y = particle.y + (particle.targetY - particle.y) * ease;
        context.strokeStyle = particle.color;context.lineWidth = 2;
        context.beginPath();context.moveTo(x + (particle.x - particle.targetX) * .08 * (1 - progress), y + 30 * (1 - progress));context.lineTo(x, y);context.stroke();
        star(context, x, y, 4, '#fff5d2');
      } else if (particle.kind === 'cookie') {
        const size = particle.size;
        const art = decorationKind === 'gingerbread' ? decorationArt : decorationCookie;
        context.save();context.translate(x, y);context.rotate(particle.phase + age * particle.spin * .4);
        if (art?.complete && art.naturalWidth) context.drawImage(art, -size / 2, -size / 2, size, size);
        context.restore();
      } else if (particle.kind === 'paper' || particle.kind === 'curl') {
        context.save();context.translate(x, y);context.rotate(particle.phase + age * particle.spin);
        if (particle.kind === 'curl') {
          context.strokeStyle = particle.color;context.lineWidth = 2.4;
          context.beginPath();context.moveTo(-particle.size, -particle.size * 2);
          context.bezierCurveTo(particle.size * 2, -particle.size * 2, -particle.size * 2, particle.size, particle.size, particle.size * 2);context.stroke();
        } else {
          context.fillStyle = particle.color;
          context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * (.4 + Math.abs(Math.sin(age * 5 + particle.phase))));
        }
        context.restore();
      } else if (particle.kind === 'crumb' || particle.kind === 'cork') {
        context.save();context.translate(x, y);context.rotate(particle.phase + age * particle.spin);
        context.fillStyle = particle.color;
        context.beginPath();context.ellipse(0, 0, particle.size * .6, particle.size, 0, 0, Math.PI * 2);context.fill();
        context.restore();
      } else if (particle.kind === 'bubble') {
        context.fillStyle = particle.color;context.globalAlpha = fade * .2;
        context.beginPath();context.arc(x, y, particle.size, 0, Math.PI * 2);context.fill();
        context.globalAlpha = fade * .85;context.strokeStyle = particle.color;context.lineWidth = 1.1;
        context.stroke();
        context.fillStyle = '#fff9e6';context.beginPath();context.arc(x - particle.size * .3, y - particle.size * .3, .8, 0, Math.PI * 2);context.fill();
      } else if (particle.kind === 'beam') {
        context.save();context.translate(x, y);context.rotate(particle.phase + age * particle.spin);
        const length = Math.min(scene.width, 410);
        const glow = context.createLinearGradient(0, 0, length, 0);
        glow.addColorStop(0, particle.color);glow.addColorStop(1, 'transparent');
        context.fillStyle = glow;context.globalAlpha = Math.sin(age / particle.life * Math.PI) * .22;
        context.beginPath();context.moveTo(0, 0);context.lineTo(length, -26);context.lineTo(length, 26);context.closePath();context.fill();
        context.restore();
      } else if (particle.kind === 'countdown') {
        context.save();context.font = `700 ${particle.size}px system-ui, sans-serif`;
        context.textAlign = 'center';context.textBaseline = 'middle';
        context.strokeStyle = '#3a263b';context.lineWidth = 3;context.lineJoin = 'round';
        context.strokeText(String(particle.number), x, y);context.fillStyle = particle.color;context.fillText(String(particle.number), x, y);
        context.restore();
      } else if (particle.kind === 'ice') {
        context.strokeStyle = particle.color;context.lineWidth = particle.size > 16 ? 1.9 : 1.2;
        snowflake(context, x, y, particle.size, particle.phase + age * particle.spin);
      } else if (particle.kind === 'ring') {
        context.save();context.translate(x, y);context.scale(1, particle.squash || 1);
        context.strokeStyle = particle.color;context.lineWidth = 2.6 * fade;
        context.beginPath();context.arc(0, 0, particle.size + age * particle.radiusSpeed, 0, Math.PI * 2);context.stroke();context.restore();
      } else if (particle.kind === 'trail') {
        y -= Math.sin(age * 2) * 50;
        const tailX = x - particle.vx * .22, tailY = y - particle.vy * .22;
        const gradient = context.createLinearGradient(tailX, tailY, x, y);
        gradient.addColorStop(0, '#ffe4a000');gradient.addColorStop(1, '#ffe4a0');
        context.strokeStyle = gradient;context.lineWidth = 8;context.lineCap = 'round';
        context.beginPath();context.moveTo(tailX, tailY);context.lineTo(x, y);context.stroke();
        context.lineCap = 'butt';star(context, x, y, particle.size, '#fff1ba', 5);
      } else if (particle.kind === 'spark' || particle.kind === 'firework') {
        context.strokeStyle = particle.color;context.lineWidth = particle.size;
        const tail = particle.kind === 'firework' ? .085 : .045;
        context.beginPath();context.moveTo(x - particle.vx * tail, y - (particle.vy + particle.gravity * age) * tail);context.lineTo(x, y);context.stroke();
      } else star(context, x, y, particle.size, particle.color);
    }
    context.globalAlpha = 1;
  }

  function paintDecorationReaction() {
    if (!reactionUntil) return;
    if (elapsed >= reactionUntil) {
      reactionUntil = 0;decoration?.classList.remove('is-reacting');
    }
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
            burst(scene, rocket.x, rocket.y);
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
    if (scene.kind === 'ambient') paintHeroParticles(scene, time);
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
    paintDecorationReaction();
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
    resetHeroEffects();
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
  const resize = 'ResizeObserver' in window ? new ResizeObserver(() => { if (!active) return;scenes.forEach(resizeScene);if (!enabled) scenes.forEach(scene => paint(scene, 0));wake(); }) : null;
  scenes.forEach(scene => {
    resizeScene(scene);
    if (visibility) visibility.observe(scene.canvas);else scene.visible = true;
    resize?.observe(scene.canvas);
  });
  window.addEventListener('resize', () => { if (!active) return;scenes.forEach(resizeScene);if (!enabled) scenes.forEach(scene => paint(scene, 0));wake(); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stop();resetHeroEffects(); } else wake(); });
  document.addEventListener('click', event => {
    if (!enabled || !active || event.target.closest('a, button, summary, input, select, textarea, [role="button"], [contenteditable="true"]')) return;
    if (!ambient) return;
    burst(ambient, event.clientX, event.clientY, true);
    wake();
  });
  window.addEventListener('pagehide', () => {
    active = false;stop();visibility?.disconnect();resize?.disconnect();
    resetHeroEffects();
    scenes.forEach(scene => { scene.bursts.length = 0;scene.rockets.length = 0;if (scene.cache) { scene.cache.width = 1;scene.cache.height = 1; }scene.cache = null;scene.canvas.width = 1;scene.canvas.height = 1; });
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    active = true;
    scenes.forEach(scene => { resizeScene(scene);visibility?.observe(scene.canvas);resize?.observe(scene.canvas); });
    updateToggle();
  });
  updateToggle();
});
