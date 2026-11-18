"""Episode runtime estimates from metadata already fetched by the app."""


def positive_runtime(value):
    """Keep valid whole minutes; unknown/invalid runtimes remain null."""
    if isinstance(value, str):
        value = value.strip()
        if not (value.isascii() and value.isdecimal()) or len(value) > 10:
            return None
        value = int(value)
    if isinstance(value, int) and not isinstance(value, bool) and 0 < value <= 2147483647:
        return value
    return None


def tmdb_episode_runtime(data):
    """Use the show's typical runtime, falling back to an available episode."""
    runtimes = data.get('episode_run_time')
    if isinstance(runtimes, (list, tuple)):
        for value in runtimes:
            runtime = positive_runtime(value)
            if runtime is not None:
                return runtime
    for field in ('last_episode_to_air', 'next_episode_to_air'):
        episode = data.get(field)
        if isinstance(episode, dict):
            runtime = positive_runtime(episode.get('runtime'))
            if runtime is not None:
                return runtime
    return None


def tmdb_season_runtime(season_data, show_data):
    """Average known episode lengths for a separately saved season."""
    runtimes = [
        runtime for episode in season_data.get('episodes', [])
        if isinstance(episode, dict)
        and (runtime := positive_runtime(episode.get('runtime'))) is not None
    ]
    if runtimes:
        return (sum(runtimes) + len(runtimes) // 2) // len(runtimes)
    return tmdb_episode_runtime(show_data)
