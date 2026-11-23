(() => {
  const statusUrl = '/settings/?api_status=1#api-status';
  const providers = { movie: 'TMDB', tv: 'TMDB', tmdb: 'TMDB', anime: 'AniList',
    manga: 'AniList', anilist: 'AniList', mal: 'AniList', person: 'TMDB', character: 'AniList',
    game: 'IGDB', igdb: 'IGDB', book: 'Open Library', openlib: 'Open Library',
    music: 'MusicBrainz', musicbrainz: 'MusicBrainz', listenbrainz: 'ListenBrainz' };

  function payload(error, provider) {
    if (error?.apiError) return error.apiError;
    if (error?.error) return error;
    return { error: `Couldn’t load data from ${providers[provider] || 'the API'}. Check API status.`,
      provider, api_status_url: statusUrl, error_code: 'unavailable' };
  }

  async function readResponse(response, provider) {
    let data;
    try { data = await response.json(); }
    catch (error) {
      const failure = new Error('Invalid server response.');
      failure.apiError = payload(null, provider);
      throw failure;
    }
    if (!response.ok || !data || typeof data !== 'object' || data?.error || data?.success === false) {
      const failure = new Error(data?.error || 'The request failed.');
      failure.apiError = data?.error ? data : payload(null, provider);
      throw failure;
    }
    return data;
  }

  function render(container, error, provider, { retry, compact = false } = {}) {
    const data = payload(error, provider);
    const box = document.createElement('div');
    box.className = 'api-feedback' + (compact ? ' api-feedback-compact' : '');
    box.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = String(data.error).replace(/\s*Check API status\.?$/, '');
    box.appendChild(text);
    if (data.api_status_url) {
      const link = document.createElement('a');
      const credentials = ['missing_key', 'invalid_key'].includes(data.error_code);
      link.href = credentials ? '/settings/?tab=api-keys#api-keys' : statusUrl;
      link.textContent = credentials ? 'API credentials' : 'Check API status';
      box.appendChild(link);
    }
    if (retry) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Retry';
      button.addEventListener('click', () => retry());
      box.appendChild(button);
    }
    container.replaceChildren(box);
    return box;
  }

  function notify(error, provider, { retry } = {}) {
    document.querySelector('.api-feedback-toast')?.remove();
    const container = document.createElement('div');
    container.className = 'api-feedback-toast';
    render(container, error, provider, { compact: true, retry });
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'api-feedback-close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.textContent = '×';
    close.addEventListener('click', () => container.remove());
    container.appendChild(close);
    (document.fullscreenElement || document.body).appendChild(container);
    setTimeout(() => container.remove(), 12000);
    return container;
  }

  window.ApiFeedback = { payload, readResponse, render, notify };
})();
