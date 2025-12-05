document.addEventListener('DOMContentLoaded', () => {
  const statsBox = document.querySelector('.stats-summary-box');
  const statsBlocks = Array.from(document.querySelectorAll('.stats-block'));
  const segments = document.querySelectorAll('.stats-bar-segment');
  const extraStats = document.querySelectorAll('.extra-stat-row');
  
  // Show top 5 blocks by count
  const blockData = statsBlocks.map(block => ({
    element: block,
    count: parseInt(block.querySelector('.stats-block-count').textContent),
    label: block.getAttribute('data-label')
  }));
  
  blockData.sort((a, b) => b.count - a.count);
  
  // Segment hover shows/highlights blocks
  segments.forEach(segment => {
    const label = segment.getAttribute('data-label');
    const block = statsBlocks.find(b => b.getAttribute('data-label') === label);
    
    if (block) {
      const wasHidden = !block.classList.contains('visible');
      
      segment.addEventListener('mouseenter', () => {
        statsBlocks.forEach(b => {
          if (b.classList.contains('visible')) b.style.opacity = '0.3';
        });
        if (wasHidden) {
          block.classList.add('visible');
        }
        block.classList.add('highlight');
        block.style.opacity = '1';
      });
      
      segment.addEventListener('mouseleave', () => {
        statsBlocks.forEach(b => b.style.opacity = '1');
        block.classList.remove('highlight');
        if (wasHidden) {
          block.classList.remove('visible');
        }
      });
    }
  });
  
  // Extra stats hover highlights related blocks
  extraStats.forEach(stat => {
    const type = stat.getAttribute('data-stat-type');
    let relatedLabels = [];
    
    if (type === 'Days Watched') relatedLabels = ['Movies', 'TV Shows', 'Anime'];
    else if (type === 'Days Played') relatedLabels = ['Games'];
    else if (type === 'Pages Read') relatedLabels = ['Books'];
    else if (type === 'Chapters Read') relatedLabels = ['Manga'];
    
    stat.addEventListener('mouseenter', () => {
      relatedLabels.forEach(label => {
        const block = statsBlocks.find(b => b.getAttribute('data-label') === label);
        if (block) {
          const wasHidden = !block.classList.contains('visible');
          if (wasHidden) {
            statsBlocks.forEach(b => {
              if (b.classList.contains('visible')) b.style.opacity = '0.3';
            });
            block.classList.add('visible');
          }
          block.classList.add('highlight');
          block.style.opacity = '1';
        }
      });
    });
    
    stat.addEventListener('mouseleave', () => {
      statsBlocks.forEach(b => {
        b.classList.remove('highlight');
        b.style.opacity = '1';
      });
      relatedLabels.forEach(label => {
        const block = statsBlocks.find(b => b.getAttribute('data-label') === label);
        const blockIndex = blockData.findIndex(d => d.label === label);
        if (block && blockIndex >= 5) {
          block.classList.remove('visible');
        }
      });
    });
  });
  
});
