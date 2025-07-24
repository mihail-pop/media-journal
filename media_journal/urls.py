from django.contrib import admin
from django.urls import path
from core import views
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/tmdb_search/', views.tmdb_search, name='tmdb_search'),
    path("api/mal_search/", views.mal_search, name="mal_search"),
    path("api/igdb_search/", views.igdb_search, name="igdb_search"),
    path("api/openlib_search/", views.openlib_search, name="openlib_search"),
    path('api/add_to_list/', views.add_to_list, name='add_to_list'),
    path("edit-item/<int:item_id>/", views.edit_item, name="edit_item"),
    path("delete-item/<int:item_id>/", views.delete_item, name="delete_item"),
    path('tmdb/<str:media_type>/<int:tmdb_id>/', views.tmdb_detail, name='tmdb_detail'),
    path('mal/<str:media_type>/<int:mal_id>/', views.mal_detail, name='mal_detail'),
    path('igdb/game/<int:igdb_id>/', views.igdb_detail, name='igdb_detail'),
    path('openlib/book/<str:work_id>/', views.openlib_detail, name='openlib_detail'),
    path('', views.home, name='home'),
    path('movies/', views.movies, name='movies'),
    path('tvshows/', views.tvshows, name='tvshows'),
    path('anime/', views.anime, name='anime'),
    path('games/', views.games, name='games'),
    path('books/', views.books, name='books'),
    path('manga/', views.manga, name='manga'),
    path("discover/", views.discover_view, name="discover"),
    path('get-item/<int:item_id>/', views.get_item, name='get_item'),
    path('settings/', views.settings_page, name='settings'),
    path('api/add_key/', views.add_key, name='add_key'),
    path('api/update_key/', views.update_key, name='update_key'),
    path('api/delete_key/', views.delete_key, name='delete_key'),
    path('backup/export/', views.create_backup, name='create_backup'),
    path('backup/import/', views.restore_backup, name='restore_backup'),
    path('notifications/dismiss/<int:item_id>/', views.dismiss_notification, name='dismiss_notification'),
    path('api/character_search/', views.character_search_view, name='character_search'),
    path('api/actor_search/', views.actor_search_view, name='actor_search'),
    path('api/toggle_favorite_person/', views.toggle_favorite_person_view, name='toggle_favorite_person'),
    path('api/favorite-persons/reorder/', views.update_favorite_person_order, name='favorite_person_reorder'),
    path("upload-game-screenshots/", views.upload_game_screenshots, name="upload_game_screenshots"),
    path("upload-banner/", views.upload_banner, name="upload_banner"),
    path("upload-cover/", views.upload_cover, name="upload_cover"),
    path("refresh-item/", views.refresh_item, name="refresh_item"),
    path("update-nav-items/", views.update_nav_items, name="update_nav_items"),
    path("api/get-extra-info/", views.get_extra_info, name="get_extra_info"),

]+ static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
