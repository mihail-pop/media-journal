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
* **`FavoritePerson`**: Stores people and characters from TMDB, AniList or custom entries. The `source` and `person_id` fields identify the provider and its ID together, so matching numbers from different APIs do not refer to the same person. The stored `type='actor'` value and `media/favorites/actors/` folder are kept for compatibility, while the interface calls them People.
* **`MediaPersonLink`**: Links a saved person or character to a media item, with an optional role for that specific item.
* **`CalendarEvent`**: Links to a `MediaItem` to track release dates through calendar events. It handles both recurring rules and notification triggers.
* **`Collection` & `CollectionItem`**: A Many-to-Many relationship structure that allows users to group various media items into custom lists.
* **`AppSettings`**: A single-row table that stores user preferences like themes, scoring modes, details and favorite section ordering, per-type live search and card overlays, banner notes and adult content filtering.

## Backups and CSV Transfer

Full backups include the core models and their relationship tables, optional Django login accounts and groups, and files under `media/`. Restoring validates the archive before applying its database changes in a transaction. Scores and timestamps are preserved rather than going through the normal edit-item behavior.

CSV transfer has separate staging storage at `data/transfer/state.sqlite3`. Uploaded rows, mappings, match candidates and progress live there until they are imported or cleaned up. This keeps matching separate from the library database and allows a paused job to resume after a server restart. The directory is excluded from Git and Docker builds.

The importer prepares provider data before opening a short transaction for each new item, its related screenshot or music records and collection memberships. Existing items are kept unchanged. CSV export covers media items and their personal fields; use full backups for the rest of the library.
