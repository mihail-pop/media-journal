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
    path('api/add_to_list/', views.add_to_list, name='add_to_list'),
    path("edit-item/<int:item_id>/", views.edit_item, name="edit_item"),
    path('tmdb/<str:media_type>/<int:tmdb_id>/', views.tmdb_detail, name='tmdb_detail'),
    path('mal/<str:media_type>/<int:mal_id>/', views.mal_detail, name='mal_detail'),
    path('igdb/game/<int:igdb_id>/', views.igdb_detail, name='igdb_detail'),
    path('', views.home, name='home'),
    path('movies/', views.movies, name='movies'),
    path('tvshows/', views.tvshows, name='tvshows'),
    path('anime/', views.anime, name='anime'),
    path('games/', views.games, name='games'),
    path('books/', views.books, name='books'),
    path('manga/', views.manga, name='manga'),
    path('get-item/<int:item_id>/', views.get_item, name='get_item'),
    path('settings/', views.settings, name='settings'),
    path('api/add_key/', views.add_key, name='add_key'),
    path('api/update_key/', views.update_key, name='update_key'),
    path('api/delete_key/', views.delete_key, name='delete_key'),
]+ static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
