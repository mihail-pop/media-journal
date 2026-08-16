# How it works

On this page I will explain the high-level flow of the app and some details about how it operates behind the scenes.

## 1. Where the data comes from

The app gets data for media items (like titles, descriptions, covers and banners) as well as actors and characters from separate external APIs:

* [TMDB](https://www.themoviedb.org/) for Movies and TV shows
* [AniList](https://anilist.co/) for Anime and Manga
* [IGDB](https://www.igdb.com/) for Games
* [OpenLibrary](https://openlibrary.org/) for Books
* [MusicBrainz](https://musicbrainz.org/) for Music

> **Note:** Music is special because we also fetch the YouTube URL of the song whenever we fetch a track. The YouTube video comes separately through a search and is not provided by MusicBrainz itself.

> **Note:** OpenLibrary is slow compared to the rest of the APIs but I chose it because it is highly likely to last and stay free. This ties into the longevity of the app which I explain below.

## 2. Local Storage

After the data is fetched it is saved locally on your machine. You can then edit the items to add your own tracking data like notes and scores or even edit the metadata (the information received from the API).

The rest of the features in the app are built entirely around this concept of fetching and saving locally. The notable exception is the Community page which adds another layer of integration. It uses a Realtime Database from Firebase to store the data for posts and comments rather than saving it on your local machine.

## 3. Longevity and API Reliability

As the app stands right now it should work well for years to come. The only real issue that could break functionality is if the current APIs close down or become paid.

I chose the current selection of APIs because they have all lasted a long time and are widely used. There are really low chances of any of them disappearing anytime soon.

In the worst case scenario that one does disappear we just have to hope there will be a replacement at that time which is highly likely. Even in that scenario your existing items will be completely safe. Because all your data is saved locally an API shutting down won't delete your lists. We would just have to link our existing items to the new API and I would update the app's code to work with the new provider.