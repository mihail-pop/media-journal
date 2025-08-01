document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.load-more-btn').forEach(button => {
    button.addEventListener('click', () => {
      const section = button.closest('.discover-section');
      section.querySelectorAll('.card.card-vertical').forEach((el, idx) => {
        if (idx >= 10) el.classList.remove('hidden');
      });
      button.remove();
    });
  });
});
