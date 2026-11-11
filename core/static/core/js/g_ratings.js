// Matches g_utils.rating_to_display. Call with a stored 1–100 score, not a form value.
window.ratingToDisplay = function (rating, mode) {
  if (rating === null || rating === undefined || rating === '') return null;
  const value = Number(rating);
  if (!Number.isFinite(value) || value <= 0) return null;

  if (mode === 'faces') return value <= 33 ? 1 : value <= 66 ? 50 : 100;
  if (mode === 'stars_5') return Math.max(1, Math.round(value / 20));
  if (mode === 'scale_10') return Math.max(1, Math.round(value / 10));
  if (mode === 'scale_100') return Math.round(value);
  return null;
};
