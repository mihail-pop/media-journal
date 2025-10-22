document.addEventListener('DOMContentLoaded', function() {
  const currentMonth = new Date().getMonth();
  if (currentMonth !== 9) return;
  
  let rainActive = localStorage.getItem('halloween-rain') === 'true';
  let canvas, ctx, raindrops = [], animationId;
  
  function createCanvas() {
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;pointer-events:none';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    ctx.strokeStyle = 'rgba(173,216,230,0.7)';
    ctx.lineWidth = 1;
  }
  
  function removeCanvas() {
    if (canvas) {
      canvas.remove();
      canvas = ctx = null;
    }
  }
  
  function createRaindrop() {
    raindrops.push({
      x: Math.random() * canvas.width,
      y: -10,
      speed: Math.random() * 3 + 4,
      length: Math.random() * 6 + 8
    });
  }
  
  function updateRain() {
    if (!rainActive || !ctx) return;
    
    const currentMonth = new Date().getMonth();
    if (currentMonth !== 9) {
      rainActive = false;
      localStorage.setItem('halloween-rain', 'false');
      removeCanvas();
      const batButton = document.getElementById('bat-toggle');
      if (batButton) batButton.style.display = 'none';
      return;
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (Math.random() < 0.4 && raindrops.length < 60) createRaindrop();
    
    for (let i = raindrops.length - 1; i >= 0; i--) {
      const drop = raindrops[i];
      drop.y += drop.speed;
      
      ctx.beginPath();
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x, drop.y - drop.length);
      ctx.stroke();
      
      if (drop.y > canvas.height) {
        raindrops.splice(i, 1);
      }
    }
    
    animationId = requestAnimationFrame(updateRain);
  }
  
  function toggleRain() {
    rainActive = !rainActive;
    localStorage.setItem('halloween-rain', rainActive);
    
    const batButton = document.getElementById('bat-toggle');
    if (batButton) {
      batButton.classList.toggle('active', rainActive);
      batButton.innerHTML = rainActive ? '<img src="/static/core/icons/halloween/ghost-face.png" width="24" height="24">' : '<img src="/static/core/icons/halloween/bat.png" width="24" height="24">';
    }
    
    if (rainActive) {
      createCanvas();
      updateRain();
    } else {
      if (animationId) cancelAnimationFrame(animationId);
      removeCanvas();
      raindrops = [];
    }
  }
  
  const batButton = document.getElementById('bat-toggle');
  if (batButton) {
    batButton.style.display = 'block';
    batButton.innerHTML = rainActive ? '<img src="/static/core/icons/halloween/ghost-face.png" width="24" height="24">' : '<img src="/static/core/icons/halloween/bat.png" width="24" height="24">';
    batButton.addEventListener('click', toggleRain);
    if (rainActive) batButton.classList.add('active');
  }
  
  if (rainActive) {
    createCanvas();
    updateRain();
  }
  
  window.addEventListener('resize', () => {
    if (canvas) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
  });
});