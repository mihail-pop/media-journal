# General (g_) - Repetitive functions for multiple pages or functions that aren't specific for one page or media
from .g_utils import *  # noqa: F403
from .g_api import *  # noqa: F403

# Media (m_) - Logic for API integration, media data fetching and processing
from .m_anime_manga import *  # noqa: F403
from .m_books import *  # noqa: F403
from .m_games import *  # noqa: F403
from .m_movies_tvshows import *  # noqa: F403
from .m_music import *  # noqa: F403
from .m_people import *  # noqa: F403

# Pages (p_) - View functions that handle logic for specific pages
from .p_home import *  # noqa: F403
from .p_person_detail import *  # noqa: F403
from .p_settings import *  # noqa: F403
