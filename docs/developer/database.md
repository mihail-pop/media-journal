# Database Schema

The database is built using Django's ORM (the `models.py` file that maps Python code into the SQLite database). The goal is to keep a balance between tables and rows. Since the app tracks vastly different types of media I designed the database to minimize complex relational tables.

## The Unified MediaItem Model

Instead of creating separate tables for movies, books and games the app uses one unified table called `MediaItem`. 

The `media_type` field dictates what the item is and the app renders it accordingly. To accommodate the different data structures required by different APIs the model heavily relies on **JSONFields**. 

In cases for fields that refer to metadata (item data fetched from the API that won't change like cast, seasons and episodes) we use JSONFields. This avoids needing a dozen extra database tables just to store metadata and the data is saved exactly how we need to display it. 

However for local data where we can have a massive amount of entries like game screenshots (which could reach thousands) or music URLs we make separate tables. Stuffing all of that into a single JSONField can slow down or break the database.

## Key Models Overview

* **`MediaItem`**: The core table. It stores all basic fields (title, cover, status, score) and uses a `provider_ids` JSON field to keep track of the item's ID from its respective API.
* **`MediaItemLog`**: Handles the journal logs system. It links via a Foreign Key to a `MediaItem` and stores timestamped entries, progress updates and text logs.
* **`Screenshot` & `MusicVideo`**: Separate tables linked to a `MediaItem` via Foreign Keys. They store individual game screenshots and YouTube music URLs so we don't overload the main item's JSON fields.
* **`FavoritePerson`**: Stores actors and characters. It handles API IDs, biographies and related media appearances.
* **`CalendarEvent`**: Links to a `MediaItem` to track release dates through calendar events. It handles both recurring rules and notification triggers.
* **`Collection` & `CollectionItem`**: A Many-to-Many relationship structure that allows users to group various media items into custom lists.
* **`AppSettings`**: A single-row table that stores user preferences like themes, scoring modes and details page section ordering.