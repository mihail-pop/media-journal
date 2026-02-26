# Media (m_) - Logic for API integration, media data fetching and processing
from .m_anime_manga import *  # noqa: F403
from .m_books import *  # noqa: F403
from .m_games import *  # noqa: F403
from .m_movies_tvshows import *  # noqa: F403
from .m_music import *  # noqa: F403

# Pages (p_) - View functions that handle logic for specific HTML pages
from .p_community import *  # noqa: F403
from .p_detail import *  # noqa: F403
from .p_discover import *  # noqa: F403
from .p_favorites import *  # noqa: F403
from .p_home import *  # noqa: F403
from .p_settings import *  # noqa: F403
from .p_person_detail import *  # noqa: F403

# Universal (u_) - Shared code used across multiple pages and general helpers for the whole app
from .u_api import *  # noqa: F403
from .u_lists import *  # noqa: F403
from .u_pages import *  # noqa: F403

