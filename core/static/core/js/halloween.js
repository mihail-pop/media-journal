document.addEventListener('DOMContentLoaded', function() {
  const currentMonth = new Date().getMonth();
  if (currentMonth !== 9) return;
  
  const isHomePage = window.location.pathname === '/' || window.location.pathname === '/home/';
  
  let halloweenActive = localStorage.getItem('halloween-rain') === 'true';
  let ghosts = [], characters = [], candies = [], bubbles = [], animationId;
  let characterCount = 0;
  
  function createGhost() {
    const ghost = document.createElement('img');
    ghost.src = '/static/core/icons/halloween/ghost.png';
    ghost.style.cssText = 'position:fixed;width:40px;height:40px;z-index:9998;cursor:pointer;transition:transform 0.1s';
    ghost.style.left = Math.random() * (window.innerWidth - 40) + 'px';
    ghost.style.top = Math.random() * (window.innerHeight - 200) + 'px';
    document.body.appendChild(ghost);
    
    const ghostObj = {
      element: ghost,
      x: parseFloat(ghost.style.left),
      y: parseFloat(ghost.style.top),
      dx: Math.random() * 0.3 + 0.1,
      dy: Math.random() * 0.3 + 0.1,
      facingRight: true,
      angle: 0
    };
    
    ghost.addEventListener('click', () => explodeGhost(ghostObj));
    ghosts.push(ghostObj);
  }
  
  function createCharacter(type) {
    const char = document.createElement('img');
    char.src = `/static/core/icons/halloween/character${type}.png`;
    char.style.cssText = 'position:fixed;width:50px;height:50px;bottom:0;z-index:9998;cursor:pointer;transition:transform 0.3s';
    char.style.left = Math.random() * (window.innerWidth - 50) + 'px';
    document.body.appendChild(char);
    
    const charObj = {
      element: char,
      x: parseFloat(char.style.left),
      dx: Math.random() * 0.8 + 0.3,
      type: type,
      facingRight: true
    };
    
    char.addEventListener('click', () => jumpCharacter(charObj));
    characters.push(charObj);
    return charObj;
  }
  
  function jumpCharacter(char) {
    char.element.style.transition = 'transform 0.2s ease-out';
    char.element.style.transform = 'translateY(-60px)';
    setTimeout(() => {
      char.element.style.transition = 'transform 0.3s ease-in';
      char.element.style.transform = char.facingRight ? 'scaleX(1)' : 'scaleX(-1)';
    }, 200);
    for (let i = 0; i < 3; i++) {
      setTimeout(() => dropFallingCandy(char.x + 25), i * 100);
    }
  }
  
  function explodeGhost(ghost) {
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const speed = Math.random() * 4 + 2;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      createBubble(ghost.x + 20, ghost.y + 20, vx, vy);
    }
    ghost.element.remove();
    ghosts = ghosts.filter(g => g !== ghost);
  }
  
  function showVampireMouth(x, y) {
    const mouth1 = document.createElement('img');
    mouth1.src = '/static/core/icons/halloween/mouth.png';
    mouth1.style.cssText = 'position:fixed;width:30px;height:20px;z-index:9995;pointer-events:none';
    mouth1.style.left = (x - 15) + 'px';
    mouth1.style.top = (y - 10) + 'px';
    document.body.appendChild(mouth1);
    
    setTimeout(() => {
      mouth1.src = '/static/core/icons/halloween/mouth2.png';
      setTimeout(() => {
        mouth1.remove();
      }, 800);
    }, 500);
  }
  
  function dropFallingCandy(x) {
    const candy = document.createElement('img');
    const candyType = Math.floor(Math.random() * 4) + 1;
    candy.src = `/static/core/icons/halloween/candy${candyType}.png`;
    candy.style.cssText = 'position:fixed;width:20px;height:20px;z-index:9997;pointer-events:none';
    candy.style.left = (x + Math.random() * 40 - 20) + 'px';
    candy.style.top = (window.innerHeight - 150) + 'px';
    document.body.appendChild(candy);
    
    const candyObj = {
      element: candy,
      x: parseFloat(candy.style.left),
      y: window.innerHeight - 150,
      vy: 0,
      bounced: false
    };
    
    candies.push(candyObj);
    
    const fall = () => {
      candyObj.vy += 0.5;
      candyObj.y += candyObj.vy;
      
      if (candyObj.y >= window.innerHeight - 20) {
        candyObj.y = window.innerHeight - 20;
        if (!candyObj.bounced && Math.random() < 0.7) {
          candyObj.vy = -Math.random() * 8 - 3;
          candyObj.bounced = true;
          requestAnimationFrame(fall);
        }
      } else {
        candyObj.element.style.top = candyObj.y + 'px';
        requestAnimationFrame(fall);
      }
    };
    
    fall();
    
    setTimeout(() => {
      showVampireMouth(candyObj.x, candyObj.y);
      setTimeout(() => {
        candy.remove();
        candies = candies.filter(c => c !== candyObj);
      }, 200);
    }, 4500);
  }
  
  function dropRandomCandy(x) {
    const candy = document.createElement('img');
    const candyType = Math.floor(Math.random() * 4) + 1;
    candy.src = `/static/core/icons/halloween/candy${candyType}.png`;
    candy.style.cssText = 'position:fixed;width:15px;height:15px;bottom:0px;z-index:9997;pointer-events:none';
    candy.style.left = x + 'px';
    document.body.appendChild(candy);
    
    candies.push(candy);
    setTimeout(() => {
      showVampireMouth(parseFloat(candy.style.left), window.innerHeight - 20);
      setTimeout(() => {
        candy.remove();
        candies = candies.filter(c => c !== candy);
      }, 200);
    }, 1500);
  }
  
  function createBubble(x, y, vx = 0, vy = 0) {
    const bubble = document.createElement('div');
    bubble.style.cssText = 'position:fixed;width:8px;height:8px;background:rgba(255,255,255,0.6);border-radius:50%;z-index:9996;pointer-events:none';
    bubble.style.left = x + 'px';
    bubble.style.top = y + 'px';
    document.body.appendChild(bubble);
    
    const bubbleObj = { element: bubble, x, y, vx, vy };
    bubbles.push(bubbleObj);
    
    if (vx !== 0 || vy !== 0) {
      const moveBubble = () => {
        bubbleObj.x += bubbleObj.vx;
        bubbleObj.y += bubbleObj.vy;
        bubbleObj.vx *= 0.95;
        bubbleObj.vy *= 0.95;
        bubble.style.left = bubbleObj.x + 'px';
        bubble.style.top = bubbleObj.y + 'px';
        
        if (Math.abs(bubbleObj.vx) > 0.1 || Math.abs(bubbleObj.vy) > 0.1) {
          requestAnimationFrame(moveBubble);
        }
      };
      moveBubble();
    }
    
    setTimeout(() => {
      bubble.remove();
      bubbles = bubbles.filter(b => b !== bubbleObj);
    }, 1000);
  }
  
  function updateHalloween() {
    if (!halloweenActive) return;
    
    const currentMonth = new Date().getMonth();
    if (currentMonth !== 9) {
      stopHalloween();
      localStorage.setItem('halloween-rain', 'false');
      return;
    }
    
    if (ghosts.length === 0) createGhost();
    
    ghosts.forEach(ghost => {
      ghost.angle += 0.02;
      ghost.x += ghost.dx + Math.sin(ghost.angle) * 1;
      ghost.y += ghost.dy + Math.cos(ghost.angle * 1.2) * 0.8;
      
      if (ghost.x <= 0 || ghost.x >= window.innerWidth - 40) ghost.dx *= -1;
      if (ghost.y <= 0 || ghost.y >= window.innerHeight - 200) ghost.dy *= -1;
      
      const shouldFaceRight = ghost.dx > 0;
      if (shouldFaceRight !== ghost.facingRight) {
        ghost.facingRight = shouldFaceRight;
        ghost.element.style.transform = shouldFaceRight ? 'scaleX(1)' : 'scaleX(-1)';
      }
      
      if (Math.random() < 0.8) {
        for (let i = 0; i < 3; i++) {
          const bubbleX = ghost.x + 8 + (i * 8) + Math.random() * 4 - 2;
          const bubbleY = ghost.y + 32 + Math.random() * 6;
          createBubble(bubbleX, bubbleY);
        }
      }
      
      ghost.element.style.left = ghost.x + 'px';
      ghost.element.style.top = ghost.y + 'px';
    });
    
    characters.forEach(char => {
      char.x += char.dx;
      if (char.x <= 0 || char.x >= window.innerWidth - 50) char.dx *= -1;
      
      const shouldFaceRight = char.dx > 0;
      if (shouldFaceRight !== char.facingRight) {
        char.facingRight = shouldFaceRight;
        char.element.style.transform = shouldFaceRight ? 'scaleX(1)' : 'scaleX(-1)';
      }
      
      if (Math.random() < 0.005) dropRandomCandy(char.x + 25);
      
      char.element.style.left = char.x + 'px';
    });
    
    animationId = requestAnimationFrame(updateHalloween);
  }
  
  function startHalloween() {
    if (characterCount === 0) {
      const char1 = createCharacter(1);
      characterCount = 1;
      
      char1.element.addEventListener('click', () => {
        if (characterCount === 1) {
          createCharacter(2);
          characterCount = 2;
        } else if (characterCount === 2) {
          createCharacter(3);
          characterCount = 3;
        }
      });
    }
    updateHalloween();
  }
  
  function stopHalloween() {
    if (animationId) cancelAnimationFrame(animationId);
    ghosts.forEach(ghost => ghost.element.remove());
    characters.forEach(char => char.element.remove());
    candies.forEach(candy => candy.remove());
    bubbles.forEach(bubble => bubble.remove());
    ghosts = [];
    characters = [];
    candies = [];
    bubbles = [];
    characterCount = 0;
  }
  
  window.addEventListener('storage', (e) => {
    if (e.key === 'halloween-rain' && isHomePage) {
      halloweenActive = e.newValue === 'true';
      if (halloweenActive) {
        startHalloween();
      } else {
        stopHalloween();
      }
    }
  });
  
  const batButton = document.getElementById('bat-toggle');
  if (batButton && isHomePage) {
    batButton.addEventListener('click', () => {
      setTimeout(() => {
        halloweenActive = localStorage.getItem('halloween-rain') === 'true';
        if (halloweenActive) {
          startHalloween();
        } else {
          stopHalloween();
        }
      }, 100);
    });
  }
  
  if (halloweenActive && isHomePage) startHalloween();
});