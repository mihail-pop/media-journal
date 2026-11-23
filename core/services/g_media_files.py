"""Track refresh downloads and remove only files inside the media directory."""
from contextvars import ContextVar
from pathlib import Path
import logging

from django.conf import settings


logger = logging.getLogger(__name__)
current_downloads = ContextVar('refresh_downloads', default=None)


def media_paths(value):
    paths = set()
    if isinstance(value, dict):
        for child in value.values():
            paths.update(media_paths(child))
    elif isinstance(value, (list, tuple)):
        for child in value:
            paths.update(media_paths(child))
    elif isinstance(value, str) and value.startswith(settings.MEDIA_URL):
        root = Path(settings.MEDIA_ROOT).resolve()
        candidate = (root / value[len(settings.MEDIA_URL):]).resolve()
        if candidate.is_relative_to(root) and candidate != root:
            paths.add(candidate)
    return paths


def remove_media_files(paths):
    try:
        root = Path(settings.MEDIA_ROOT).resolve()
    except (OSError, RuntimeError, ValueError):
        logger.warning('Could not access the media directory for cleanup.')
        return
    for path in paths:
        try:
            path = Path(path).resolve()
            if path.is_relative_to(root) and path != root:
                path.unlink(missing_ok=True)
        except (OSError, RuntimeError, ValueError):
            logger.warning('Could not remove an unused media file: %s', path)


class RefreshDownloads:
    def __init__(self, provider):
        self.provider = provider
        self.created = set()
        self.retained = set()
        self.committed = False
        self.failure = None

    def __enter__(self):
        self.token = current_downloads.set(self)
        return self

    def keep(self, paths):
        self.retained.update(paths)

    def mark_committed(self):
        # Later cleanup errors must never delete files the database now uses.
        self.committed = True

    def __exit__(self, exc_type, exc_value, traceback):
        current_downloads.reset(self.token)
        retained = self.retained if exc_type is None or self.committed else set()
        remove_media_files(self.created - retained)
