# Architecture

This page outlines the technologies used to build Media Journal and how the codebase is structured.

## Tech Stack

Media Journal is built as a monolithic web application to keep self-hosting simple and reliable.

* **Backend:** Django (Python 3.13)
* **Database:** SQLite. It only allows one write at a time but because the app is meant for single-user or small family use it's good enough and doesn't require any extra database setup.
* **Frontend:** Vanilla JavaScript, HTML and CSS
* **Database for the Community Page:** Realtime Database from Firebase

## Minimal Dependencies

I intentionally keep the requirements as small as possible. I don't want to use external libraries unless they are truly needed. This is to future-proof the app so it doesn't depend on separate third-party packages that might break or get abandoned over time. 

The main `requirements.txt` is extremely lightweight:
```text
Django==5.2.18
requests==2.32.3
whitenoise==6.11.0
waitress==3.0.2
```

For development the `requirements-dev.txt` includes the base requirements plus the documentation tools:
```text
-r requirements.txt
mkdocs-material==9.*
```
I use MkDocs for building this documentation and Ruff for general code checking and formatting.


## Production Serving

When users run the app natively (where debug mode is off by default) the app uses a couple of extra tools to run efficiently:

* **WhiteNoise:** Used to serve static files (CSS, JS, images) directly through the Python web app so users don't have to set up a reverse proxy like Nginx.
* **Waitress:** A production-quality WSGI server used to run the app on Windows, Linux and Mac instead of Django's default development server. Users can choose to use Waitress or the default runserver depending on what they need.

## External APIs

I use well-known free APIs that are more likely to last for years to come. The backend makes these requests, parses the JSON data and formats it before saving it locally.

* **TMDB:** Movies and TV shows
* **AniList:** Anime and Manga
* **IGDB:** Games
* **OpenLibrary:** Books
* **MusicBrainz & YouTube Search:** Music

TMDB also supplies people, while AniList supplies characters and staff. Person URLs include the provider, such as `/person/tmdb/123/` or `/person/anilist/456/`. Custom people use `/person/custom/custom_.../`, and characters use `/character/123/`. Old `/person/actor/.../` and `/person/character/.../` links still redirect to the current routes.

## Music Player and Home Screen Installation

The main app still uses normal Django page navigation. The in-page YouTube player reloads between pages, while `/music/player/` runs it in a separate pop-out window so playback can continue. Player mode, position and pop-out size are saved in browser storage.

The web app manifest is generated at `/manifest.webmanifest` with relative app URLs, so each installation can use its own address. Home screen installation does not add offline caching or a service worker; the server must remain reachable.

## CSV Transfer

The transfer views and services handle CSV upload, field and value mapping, provider matching, review and import/export progress. Jobs run in background threads, with staging data in `data/transfer/` rather than new library models. Imports reuse the normal provider loaders with database writes deferred until an item is ready to save. No additional runtime dependency is needed.

## File Naming Conventions

To keep the codebase manageable without creating deeply nested folder structures I use a specific prefix naming convention. Files that belong to the same logical cluster share the same prefix across views, services, templates and static files.

* **`g_` (General):** Files used across multiple pages (e.g. `g_base.html`, `g_edit_modal.js`).
* **`p_` (Page):** Files specific to a standalone page (e.g. `p_home.html`, `p_calendar.py`, `p_settings.css`).
* **`m_` (Media):** Files for pages or functionalities that are mainly for media items (e.g. `m_lists.js`, `m_games.html`).

Because of this you can use the "Go to File" shortcut in Visual Studio Code (`Ctrl + P` or `Cmd + P`), type `p_home` and instantly see the HTML, CSS, JS and Python view files grouped together in the dropdown.
