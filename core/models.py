from django.db import models

# Create your models here.

class APIKey(models.Model):
    name = models.CharField(max_length=100, unique=True)  # e.g., "tmdb", "igdb", "mal"
    key_1 = models.CharField(max_length=255)              # primary key or client ID
    key_2 = models.CharField(max_length=255, blank=True)  # secret or optional extra

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
    source = models.CharField(max_length=50)              # e.g. "tmdb", "mal", "igdb"
    source_id = models.CharField(max_length=100)          # Required: All major APIs provide unique IDs
    cover_url = models.URLField(blank=True)               # Can be remote or a local path if downloaded

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="planned")
    
    progress_main = models.PositiveIntegerField(default=0)    # Episodes / Chapters
    progress_secondary = models.PositiveIntegerField(null=True, blank=True)  # Seasons / Volumes (optional)

    total_main = models.PositiveIntegerField(null=True, blank=True)
    total_secondary = models.PositiveIntegerField(null=True, blank=True)

    personal_rating = models.PositiveIntegerField(choices=RATING_CHOICES, null=True, blank=True)
    favorite = models.BooleanField(default=False)

    date_added = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"{self.title} ({self.media_type})"
