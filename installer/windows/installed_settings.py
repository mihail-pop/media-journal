"""Installer-only settings; the ordinary source checkout keeps its own settings.

The launcher supplies MEDIA_JOURNAL_INSTALL_ROOT and the selected release on
PYTHONPATH. Keep user files outside release folders so updates never replace them.
"""

import json
import os
from pathlib import Path

from media_journal.settings import *  # noqa: F403


_install_root = Path(os.environ["MEDIA_JOURNAL_INSTALL_ROOT"]).resolve(strict=True)
with (_install_root / "config.json").open(encoding="utf-8-sig") as _config_file:
    _configuration = json.load(_config_file)

BASE_DIR = _install_root / "library"
DATABASES["default"]["NAME"] = BASE_DIR / "data" / "db.sqlite3"  # noqa: F405
MEDIA_ROOT = BASE_DIR / "media"
STATIC_ROOT = Path(os.environ.get("MEDIA_JOURNAL_STATIC_ROOT", str(_install_root / "staticfiles")))
SECRET_KEY = _configuration["secret_key"]
DEBUG = False

# Settings a native installation commonly receives through its startup script.
# Environment variables take priority, then the installer's editable config.json.
TIME_ZONE = os.environ.get("TZ", _configuration.get("timezone", "UTC"))
_origins = os.environ.get("CSRF_TRUSTED_ORIGINS", _configuration.get("csrf_trusted_origins", ""))
CSRF_TRUSTED_ORIGINS = [origin.strip() for origin in _origins.split(",") if origin.strip()]
REQUIRE_LOGIN = str(os.environ.get("REQUIRE_LOGIN", _configuration.get("require_login", False))).lower() in (
    "true", "1", "t",
)
