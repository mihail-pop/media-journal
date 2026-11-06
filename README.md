<h1 align="center">Media Journal</h1>
<p align="center"> <a href="https://mihail-pop.github.io/media-journal/">Documentation</a>

This is the self-hosted media tracker app I always wanted to have. From now on I will use it and keep it maintained. I will never ask for donations or try to monetize the app in any form. People using it is more than enough!
> **Note:** I added the open source AGPL license to make contributing easier, hoping nobody would try to monetize the app with the "commercial use" clause. I personally disapprove of that.

## Features

- Create lists for movies, TV shows, anime, manga, books, games and music.
- Track progress, ratings, status and notes.
- Organize media into collections.
- View stats, recent activity, collections and favorites on the home page.
- Share thoughts and updates through the community page.
- Discover trending or popular media.
- Favorite people and characters from TMDB and AniList, or create custom ones.
- Play saved songs through a YouTube music player, with a pop-out window for uninterrupted playback while browsing.
- Import and export media items and their personal fields through CSV.
- Share favorites as themed PNG images or a PDF.
- Customize themes, navigation, favorite sections and card overlays.
- Install Media Journal on your home screen when accessing it over HTTPS.

## Demo - [Youtube Demo](https://youtu.be/JXOvpvdVZpY?si=LIvj2CKixBAZ0Pp)
| <img src="https://github.com/user-attachments/assets/59ff70c5-46ce-4b69-a5ad-70e811b33f0b" width="500" /> | <img src="https://github.com/user-attachments/assets/48fdb9d3-aa17-4b2f-a8a2-173e5b2a3cb6" width="500" /> |
| :-----------------------------------------: | :-----------------------------------------: |
|                 Home                    |               Lists                   |

| <img src="https://github.com/user-attachments/assets/91a077d6-10ed-46a3-af85-9576b21824cd" width="500" /> | <img src="https://github.com/user-attachments/assets/6de5cc3d-bf77-4b0d-90f3-71d33e62bf5f" width="500" /> |
| :-----------------------------------------: | :-----------------------------------------: |
|               Discover                  |               History                   |

| <img src="https://github.com/user-attachments/assets/613761d3-7ca5-4071-8c11-2aa51eba208f"  width="500" /> | <img src="https://github.com/user-attachments/assets/6b44aaec-4d52-40d6-99e1-08089493c9f5" width="500" /> |
| :-----------------------------------------: | :-----------------------------------------: |
|               Details                  |               Edit                   |

## Setup

You can run Media Journal either with Docker or natively on your personal PC or laptop. If you haven't used Docker before and you don't need it, simply follow the specific guide for your operating system below:

<p align="center">
  <a href="https://mihail-pop.github.io/media-journal/setup/docker/"><strong>Docker Setup</strong></a> &nbsp;&nbsp;|&nbsp;&nbsp; 
  <a href="https://mihail-pop.github.io/media-journal/setup/windows/"><strong>Windows Setup</strong></a> &nbsp;&nbsp;|&nbsp;&nbsp; 
  <a href="https://mihail-pop.github.io/media-journal/setup/mac/"><strong>Mac Setup</strong></a> &nbsp;&nbsp;|&nbsp;&nbsp; 
  <a href="https://mihail-pop.github.io/media-journal/setup/linux/"><strong>Linux Setup</strong></a>
</p>

## Add to your home screen

Open your own Media Journal HTTPS address on your phone, then use **Install app** or **Add to Home screen** in your browser's menu. On iPhone, use Safari's **Share → Add to Home Screen**, with **Open as Web App** enabled if shown.

The icon opens Media Journal without the usual browser address bar. It uses the address you installed from, so there is no domain to configure in the app. Your server must remain running and reachable; offline use is not included.

Regular HTTP access continues to work in the browser. Installation generally requires HTTPS, with an exception for `localhost` on the same device.

## CSV transfer

In **Settings → Transfer**, export your media library to CSV or import a CSV from another application. Imports use one row per media item, rather than a diary entry per viewing. Convert JSON/XML exports to a flat CSV first if needed.

Choose which columns to use, the media type, score scale and activity-date format. Then map values such as statuses to Media Journal's choices. Provider IDs are recommended; title searches produce suggestions that you can review and correct before importing. Unmatched and invalid rows can be downloaded with all their original fields.

New entries use provider metadata and images. Mapped personal fields, genres, creators, overviews and release dates are applied from the CSV; cover/banner URL columns are used only for custom items. TMDB season IDs in Media Journal's `show_id_sN` format are supported as TV entries.

Existing items are skipped without changing their scores, notes or dates. Transfers report progress and can be paused and resumed, including after a server restart. Temporary transfer data is retained for seven days. Imports are limited to 50 MB and 50,000 rows per file and require the same API keys as ordinary searches and item saves.

Exports include personal fields, provider IDs, collection memberships and basic metadata. Scores use the internal 1–100 scale, with blank cells for unrated items. AniList imports also accept MyAnimeList IDs. Formula-like cells are escaped for spreadsheet safety, with information to restore their exact text when re-imported into Media Journal. Image files, people, logs and screenshot records remain part of full backups rather than CSV transfer.

For a walkthrough, see [CSV Import and Export](https://mihail-pop.github.io/media-journal/app-guide/how-to-use/#272-csv-import-and-export) in the app guide.
