from django.db import models
from django.db.models import JSONField
from django.utils import timezone

# Create your models here.

class APIKey(models.Model):
    NAME_CHOICES = [
        ("tmdb", "TMDB"),
        ("igdb", "IGDB"),
        ("mal", "MyAnimeList"),
        ("anilist", "AniList"),
    ]

    name = models.CharField(max_length=100, unique=True, choices=NAME_CHOICES)
    key_1 = models.CharField(max_length=255)
    key_2 = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return self.name
    
class MediaItem(models.Model):
    MEDIA_TYPES = [
        ("movie", "Movie"),
        ("tv", "TV Series"),
        ("anime", "Anime"),
        ("manga", "Manga"),
        ("game", "Game"),
        ("book", "Book"),
    ]

    STATUS_CHOICES = [
        ("ongoing", "Ongoing"),
        ("completed", "Completed"),
        ("planned", "Planned"),
        ("dropped", "Dropped"),
        ("on_hold", "On Hold"),
    ]

    RATING_CHOICES = [
        (1, "Bad"),
        (2, "Neutral"),
        (3, "Good"),
    ]

    title = models.CharField(max_length=300)
    media_type = models.CharField(max_length=20, choices=MEDIA_TYPES)
    source = models.CharField(max_length=50)              
    source_id = models.CharField(max_length=100)          

    cover_url = models.URLField(blank=True, null=True)               
    banner_url = models.URLField(blank=True, null=True)              # New: wide image (e.g. backdrop, screenshot)

    release_date = models.CharField(max_length=20, blank=True, null=True)  # Stored as string to unify format
    overview = models.TextField(blank=True, null=True)               # New: description/synopsis

    cast = models.JSONField(blank=True, null=True)        # Unified for all media types
    seasons = models.JSONField(blank=True, null=True)     # Only for TV series
    related_titles = models.JSONField(blank=True, null=True)  # Prequels/Sequels for anime/manga
    screenshots = models.JSONField(blank=True, null=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="planned")
    
    progress_main = models.PositiveIntegerField(default=0)
    progress_secondary = models.PositiveIntegerField(null=True, blank=True)

    total_main = models.PositiveIntegerField(null=True, blank=True)
    total_secondary = models.PositiveIntegerField(null=True, blank=True)

    personal_rating = models.PositiveIntegerField(choices=RATING_CHOICES, null=True, blank=True)
    favorite = models.BooleanField(default=False)

    date_added = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, null=True)

    last_updated = models.DateTimeField(default=timezone.now)
    notification = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.title} ({self.media_type})"
    
    class Meta:
        unique_together = ("source", "source_id", "media_type")
    

class FavoritePerson(models.Model):
    PERSON_TYPE_CHOICES = [
        ('character', 'Character'),
        ('actor', 'Actor'),
    ]

    name = models.CharField(max_length=200)
    image_url = models.URLField(blank=True, null=True)
    type = models.CharField(max_length=10, choices=PERSON_TYPE_CHOICES)
    position = models.PositiveIntegerField()

    def __str__(self):
        return f"{self.name} ({self.type})"
    
class NavItem(models.Model):
    CATEGORY_CHOICES = [
        ("home", "Home"),
        ("movies", "Movies"),
        ("tvshows", "TV Shows"),
        ("anime", "Anime"),
        ("games", "Games"),
        ("manga", "Manga"),
        ("books", "Books"),
    ]

    name = models.CharField(max_length=20, choices=CATEGORY_CHOICES, unique=True)
    visible = models.BooleanField(default=True)
    position = models.PositiveIntegerField(default=1)

    def __str__(self):
        return f"{self.get_name_display()} (pos: {self.position}, visible: {self.visible})"