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
        ("music", "Music"),
    ]

    STATUS_CHOICES = [
        ("ongoing", "Ongoing"),
        ("completed", "Completed"),
        ("planned", "Planned"),
        ("dropped", "Dropped"),
        ("on_hold", "On Hold"),
    ]

    title = models.CharField(max_length=300)
    media_type = models.CharField(max_length=20, choices=MEDIA_TYPES)
    source = models.CharField(max_length=50)              
    source_id = models.CharField(max_length=100)          

    cover_url = models.URLField(blank=True, null=True)               
    banner_url = models.URLField(blank=True, null=True)              # New: wide image (e.g. backdrop, screenshot)

    release_date = models.CharField(max_length=20, blank=True, null=True)  # Stored as string to unify format
    overview = models.TextField(blank=True, null=True)               # Description/synopsis

    cast = models.JSONField(blank=True, null=True)        # Extra data for Music
    seasons = models.JSONField(blank=True, null=True)     # Only for TV series
    episodes = models.JSONField(blank=True, null=True)    # Episode details for seasons
    related_titles = models.JSONField(blank=True, null=True)  # Prequels/Sequels for anime/manga
    screenshots = models.JSONField(blank=True, null=True) # Youtube Links + Position for Music

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="planned")
    
    progress_main = models.PositiveIntegerField(default=0)
    progress_secondary = models.PositiveIntegerField(null=True, blank=True)

    total_main = models.PositiveIntegerField(null=True, blank=True)
    total_secondary = models.PositiveIntegerField(null=True, blank=True)

    # Before:
    # personal_rating = models.PositiveIntegerField(choices=RATING_CHOICES, null=True, blank=True)

    # After:
    personal_rating = models.PositiveSmallIntegerField(
        null=True,
        blank=True
    )  # No choices, stores values from 1–100
    favorite = models.BooleanField(default=False)
    favorite_position = models.PositiveIntegerField(null=True, blank=True)

    date_added = models.DateTimeField(default=timezone.now)
    repeats = models.PositiveIntegerField(default=0)
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
    person_id = models.CharField(max_length=50, blank=True, null=True)  # ID from TMDB/AniList
    
    # Actor-specific fields (TMDB)
    birthday = models.CharField(max_length=20, blank=True, null=True)
    deathday = models.CharField(max_length=20, blank=True, null=True)
    biography = models.TextField(blank=True, null=True)
    related_media = models.JSONField(blank=True, null=True)  # Movies/TV shows they appeared in
    
    # Character-specific fields (AniList)
    description = models.TextField(blank=True, null=True)
    age = models.CharField(max_length=50, blank=True, null=True)
    media_appearances = models.JSONField(blank=True, null=True)  # Anime/manga they appear in
    voice_actors = models.JSONField(blank=True, null=True)  # Voice actors for this character

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
        ("music", "Music"),
    ]

    name = models.CharField(max_length=20, choices=CATEGORY_CHOICES, unique=True)
    visible = models.BooleanField(default=True)
    position = models.PositiveIntegerField(default=1)

    def __str__(self):
        return f"{self.get_name_display()} (pos: {self.position}, visible: {self.visible})"
    
class AppSettings(models.Model):
    rating_mode = models.CharField(
        max_length=20,
        choices=[
            ('faces', 'Faces'),
            ('stars_5', '1–5 Stars'),
            ('scale_10', '1–10'),
            ('scale_100', '1–100'),
        ],
        default='faces'
    )
    show_date_field = models.BooleanField(default=False)
    show_repeats_field = models.BooleanField(default=False)
    theme_mode = models.CharField(
        max_length=20,
        choices=[
            ('light', 'Light'),
            ('dark', 'Dark'),
            ('brown', 'Brown'),
            ('green', 'Green'),
        ],
        default='dark'
    )

    username = models.CharField(max_length=50, blank=True, null=True)

    def __str__(self):
        return f"App Settings ({self.rating_mode}, theme={self.theme_mode}, username={self.username})"
