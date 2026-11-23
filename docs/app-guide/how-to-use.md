# How to use

On this page I will describe how you can use the app and explain some of its meaningful functionalities and details.

## 1. Media Items

### 1.1 Search and Discover

After you add your API keys you can start adding items. The search button is available on every page. On a media list or details page it automatically selects that media type. On other pages, like Home or Settings, it remembers the last type you used.

You can also change the media type using the dropdown attached to the search bar. Its options follow your navigation button order and leave out media types you have hidden in Settings.

People and Characters can also appear after the media types. Settings > Preferences > Extra Search Options controls these two choices; People starts enabled and Characters starts disabled. People search uses TMDB, while character search uses AniList.

> **Note:** Live search is controlled per media type from Settings > Preferences > Live Search. Movies, TV shows and games have it enabled by default. Anime, manga, books and music start with it disabled to reduce API requests. You can always press Enter to search manually.

Alternatively you can open the discover page from the home page. There you can just hover over an item and press the plus button to quickly add it. 

Discover has different sorting and filtering options for each media type. For games, the Free to Play filter can be combined with Top Rated or Upcoming, genres and any available release year filter.

When using the search bar, clicking on an item will open its details page. Press Add to List to save it as Planned, or use the attached dropdown to add it with a different status. The button's wording changes for each media type, like Add to Anime List or Add to TV List.

### 1.2 Details Page

The tabs below the description switch between Overview and full sections like Information, Cast, Characters, Staff, Trailers and Recommendations. The available tabs depend on the media type. Settings > Preferences > Details Page Overview lets you rearrange or hide the previews in Overview without removing access to their full tabs.

Overview uses locally saved data for items already in your list, so opening it does not make provider API calls. Opening a tab that needs extra data fetches a shared bundle, then the other tabs reuse it. This data is cached in the browser tab for up to 20 minutes, with limits on how many items and how much data are kept. Long AniList character and staff lists fetch more pages as you scroll.

Items not yet in your list also show Information, Trailers and Recommendations previews in Overview when available. Movie collections appear as relations, ordered by release date. TV season pages have their own Overview, Information, Cast and Staff tabs, plus links for moving between seasons and back to the main show. Episodes can be shown in their usual detailed layout or as small cards.

Here are some notable sections:

#### 1.2.1 Journal Section

In this section you can see and write Notes and Logs. Notes also appear in the edit modal and are supposed to be a single place where you keep general thoughts about your media. Logs on the other hand can only be created from the journal section. You can have multiple logs for an item which gives you more options to keep detailed and sectioned info.

You can edit or delete logs, search within the journal, change the sort order and switch between grid and list views. Unfinished notes and logs are kept as drafts in the same browser so you can return to them later.

> **Note:** Both your notes and logs will appear under each media item when you use the Detailed List View on list pages.

#### 1.2.2 Cast & Characters Section

Overview shows a preview of the cast or characters. Press its title or the matching tab to open the full section. When you hover over a card you can favorite or unfavorite using the heart icon. Search is available inside the full Cast, Characters and Staff tabs; anime and manga staff search uses AniList.

People come from TMDB or AniList. Voice actors on character pages and staff cards are clickable too, so you can open their person page and favorite them.

#### 1.2.3 Music Section

In this section you can add YouTube URLs to link videos for a music item. The + opens the URL input; press it again or use Enter to save. You can toggle the video size, enable autoplay or remove a video after confirming.

The music-note button beside each video starts the built-in player from that video. Next and Previous move through the other videos attached to the same item and loop through them. When starting the item from Home or a music list, the player uses its first video.

#### 1.2.4 Screenshots Section

Games automatically come with some screenshots fetched from the API but you can also add your own. The ADD button puts your new screenshots after the existing ones. The SWAP button asks for confirmation before you choose replacement images, then replaces all existing screenshots and removes their favorites.

You can delete a single screenshot or choose Delete More in the confirmation popup to select several previews for deletion. This selection mode is available outside fullscreen. Use the star to favorite a screenshot; favorites have a golden border in the preview strip. Hover over the star to show the option to view only favorites.

The fullscreen button opens a larger viewer. Double-click the image to switch between that view and true fullscreen. Use the mouse wheel to zoom towards the pointer, drag to move a zoomed image, and use the left/right arrow keys to change screenshots. Autoplay is available too.

The download button saves the current screenshot, or the visible part when zoomed in. In either fullscreen view, hover over Download to choose a square or circular crop. Your browser's download settings still decide whether it asks where to save the file.

You can also drag the bottom-right corner of the preview strip down to see more thumbnails. Its height resets when you open the page again. The small bottom-left corner on the main image reveals the screenshot's added date when one is available.

### 1.3 Custom Media Items

If you cannot find the media you are looking for you can create a custom item. Just press the + button directly from the list page of the media type where you want it placed. This is also very useful if you want to add media types that are not officially supported like comics, podcasts or board games.

You can select one or more existing collections directly in the create modal, so you don't have to assign them afterwards.

> **Note:** You can make a Collection of all your custom items of an unsupported type so it basically acts as a dedicated custom list.

### 1.4 Edit Item

After adding your items you can start editing them by pressing the ... button from the list pages or the history page. You can also press Edit Item directly from the details page. 

Besides the default tracking fields you can enable additional ones from Settings > Preferences > Edit Modal Fields. Options like Activity Date, Repeats and Collections are disabled by default so they don't clutter the edit modal if you don't need them.

You can also use the small + next to progress on list pages while an item is Watching, Reading or Playing. It adds one episode or chapter, with separate episode and season controls in TV list views. Movies, games, books and music use a simple complete action instead of adding minutes, hours or pages. Reaching the known total marks the item as Completed without assigning a score.

Settings > Preferences > Activity Date Updates lets you choose when Activity Date changes automatically:

* **Manual Only:** Keep the date unless you change it yourself.
* **Any Status Change:** Update the date whenever the status changes.
* **Status + Score:** Update only when both status and score change in the same edit.
* **Combined:** Update when Watching/Reading/Playing changes to Completed, Dropped or Paused, or when both status and score change. This is the default.

The progress + follows the same preference when it completes an item. A date you explicitly change in the edit modal takes priority, and an unchanged score keeps its original saved value even if your scoring system displays a rounded number.

Genres, creators and collections show their selected values in a floating box while you use the field. When closed, the field shows the first choice and how many more are selected, so adding several values does not stretch the form.

#### 1.4.1 Scoring System

The app lets you change your scoring system at any time. All score values are saved locally on a 1 to 100 scale. For example a 5 out of 10 gets saved as 50, 3 stars get saved as 60 and a neutral face gets saved as 50. Because everything is standardized behind the scenes you can change from one scoring system to another without breaking your existing ratings.

The 1–10 and star views round to whole numbers when displaying a score. More precise values, such as 25 from a CSV import, stay saved in the database even if the 1–10 view displays them as 3.

### 1.5 Edit Metadata 

By going to the details page and clicking the Gear icon > Edit Metadata you can manually edit the data fetched from the API. This includes things like genres, creators, release dates and so on.

> **Note:** Keep in mind that if you ever press Refresh Data from the gear menu the app will fetch from the API again and your custom metadata will be overwritten.

### 1.6 Refresh Data

In Settings > Refresh > Refresh Data you can refresh all items or choose specific media types and fields (like genres, creators etc). This is sometimes more useful and convenient than manually refreshing data one by one on the details page. It is especially useful when I update the app and add a new field. For example when I added the Genres field all existing items needed to be refreshed to populate that field with data from the API.

> **Note:** Some APIs are slower than others during this process because of their call limits or infrastructure speed.

### 1.7 Music Player

You can start the music player using the ♪ button on the home page when you have favorited at least 1 song. There is also a similar button that starts the player on the music list page. When the music player is started from the home page it will play only your favorited songs in a random order. The one started from the list page will play the songs from your currently selected status (All, Completed, Dropped etc) in a random order.

If you want to play a specific song you can hover over a music card and press the ▶ button, or use the play button on its row in a list view. This will play the selected song and continue with the songs next to it in their current order.

The player has small, medium, fullscreen and pop-out modes. In the small modes you can drag it using the grab areas over the video, leaving the center and YouTube controls available. Your mode and position are remembered in the browser. The history panel starts closed unless you choose to open it.

For uninterrupted playback while navigating, use the pop-out button that appears when you hover over the small/medium mode control. It opens the player in a separate window, which keeps playing while you browse the main app. Its size and position are remembered too, although the browser may adjust where it opens. The button beside X in that window brings it back into the page.

> **Note:** The in-page player still reloads when you navigate to another page. Pop-out mode avoids that without needing to rebuild the app as a single page app. It is a normal browser window, so it does not stay on top of other windows automatically.

## 2. Main Pages & Features

Now that you have your media items and your lists are growing here are some useful pages and functionalities you can use.

### 2.1 Home Page

The home page has multiple sections for favorites, stats, activity history, collections and upcoming releases.

> **Note:** If you press on the Stats or Activity History titles they will swap to show Collections and Upcoming Releases instead. Your choice remains saved locally so you can leave them the way you prefer. Also if you press on any favorites section title (e.g. Movies, People etc) it will open the favorites page with that section at the top.

#### 2.1.1 Stats Section

This section shows the amount of media items you have and meaningful stats about them like days watched and days played. To make the page load faster I simplified how days watched is calculated the same way other sites do it. Rather than getting the exact length of each individual movie, TV show or anime I multiply them by an average value. I use 90 minutes per movie, 40 minutes per TV show episode and 24 minutes per anime episode. When your lists have hundreds or thousands of media items these average values are accurate enough so it's good enough.

#### 2.1.2 Collections Section

Here you can see your top 10 collections and quickly access the collections page using the arrow button.

#### 2.1.3 Activity History Section

Here you can see an activity graph that shows items you modified or added by activity date per day for the past 24 weeks (about 5.5 months). Press a day tile to open History filtered to that date. Under the graph you will find the latest media items and how long ago they were updated. You can also find the Media History button here which redirects you to the History page.

#### 2.1.4 Upcoming Releases Section

Here you can view the latest releases in tiles for one week ahead and from the last week. It also shows the 12 newest upcoming releases and how long it is until they release. From here you can access the calendar page through the Calendar button.

> **Note:** Upcoming Releases and Calendar share the same synchronization. Opening this section checks whether an update is due, so you don't have to visit Calendar to get updates. The media filters you select on Calendar also apply here.

#### 2.1.5 Favorites Section

Each favorites section shows up to 25 of your media items, people or characters. You can reorder items on the favorites page if you want different ones to show up here. Settings > Preferences > Favorite Sections lets you hide or reorder entire sections on both Home and Favorites.

#### 2.1.6 Notifications

There are 3 types of notifications that can appear on the home page:  
1. TV shows, anime or manga that got a new season or sequel found from background checks.  
2. Calendar notifications for specific items that you manually enable on the calendar page.   
3. System notifications that I manually make when I add an important update you should be informed about.

### 2.2 History Page

Here you can see all your media items in one single place and you have more filtering options to search through them.

The Activity Date fields let you filter by year, month or a specific day. Month accepts a number or a month name. If you leave the year empty, the current year is assumed; entering only a day also assumes the current month. Rewind automatically moves backwards through days with activity that matches your other filters, skipping empty days. Press Stop to stay on the displayed date.

### 2.3 Calendar Page

Here you can see past and upcoming releases in a month grid or a 30-day Agenda view. Press a day to see its items; Today also selects the current day. The media-type filter is remembered in your browser and also applies to Home's Upcoming Releases.

You can create custom events, including recurring ones, and edit their date, title or notes later. Rescheduling a recurring event can also shift the remaining events in its group. Enable notifications for releases you want to be reminded about.

Export Day, Export Month and Export Agenda download an `.ics` file for the current selection and media filters. You can import that file into a calendar app that supports `.ics`; it is a snapshot, not a live subscription.

Calendar checks whether synchronization is due when you open it. Its sync options choose whether to check ongoing and planned items. Known future dates are rechecked less often to save API calls, and you can request a manual sync when needed. Home uses the same data and sync rules.

Events older than 90 days, including custom events and their notes, are deleted automatically. There is no limit for future releases.

### 2.4 Favorites Page

Here you can see all your favorited items and reorder them. Choose small or big cards; in small mode, click to open an item or hold before dragging to reorder it. Your view choice is remembered in the browser.

The search bar matches media titles and creators, as well as person and character names. Empty sections are hidden while searching and reordering is disabled until you clear the search. Opening Favorites from a Home section puts that section first; otherwise your configured section order is used.

You can create custom people and characters using the + button if you can't find them through the APIs. Once a person or character is in your favorites, their page lets you assign media items from your library. Those links also appear on the assigned items' details pages.

### 2.5 Community Page

The community page uses a Realtime Database from Firebase to store data. It uses the free plan which from my calculations can support about 100 to 1000 users actively using the page every day. I didn't add user accounts so that the page is more likely to be used. This also means it can be easily abused and I am the only moderator. I just base my hopes that moderation won't be needed with a small number of users. If it ever gets out of control I can either add Firebase authentication or just nuke it :).

On the community page posts you can insert YouTube videos, Imgur images, links and media items (excluding custom items).

Posts load in batches as you scroll. You can comment, like and unlike posts. Likes use one identity for your Media Journal installation, so changing browsers or devices does not give you another like on the same post.

### 2.6 Collections Page

Collections let you group media items, saved People and Characters in one place. In Add Items to Collection, switch between Media and People to choose what to add. People and characters come from your favorites, and you can mix them with media in the same custom order.

You can search the collections page by collection title, then search titles and creators inside a collection. Searching turns off reordering so filtered results don't accidentally change your saved order. Touch devices do not show the reorder control.

### 2.7 Settings

Preferences contains the theme, font and scoring options, along with a few ways to adjust what you see:

* **Navigation Buttons:** Click to hide/show buttons and drag to reorder them. Favorites, Collections, History, Calendar, Discover, Community and News are available as extra buttons and start hidden. If seven or more buttons are enabled, the first five stay visible and the rest go into More.
* **Favorite Sections:** Hide/show and reorder the media, People and Characters sections on Home and Favorites.
* **Details Page Overview:** Hide/show and reorder the previews in Overview while keeping their full tabs available.
* **Live Search:** Choose separately for each media type whether searching starts while you type.
* **Extra Search Options:** Show or hide People and Characters in the header search dropdown.
* **List Card Overlays:** Choose Full, Progress & Score or Hidden per media type. This affects card views; list views stay the same.
* **Banner Notes:** Show or hide your item notes over the banner rotators on Home and list pages.
* **18+ Content:** Include or filter out provider-marked adult titles in search and Discover. This does not hide or remove items already saved in your library. It relies on the provider's classification, so it isn't a general filter for violence or mature themes.
* **Activity Date Updates:** Choose when editing an item's status and score should update its Activity Date.

#### 2.7.1 Backups

Settings > Backup creates a ZIP archive containing your library database records and local media files. This includes settings, API keys, optional login accounts, collections, logs, people, screenshot records, music links, recorded progress, listening history and saved News channels. Use this when moving your installation or keeping a full backup, rather than CSV export.

Loading a backup checks the archive before restoring it. Uploading, validation and restoration have progress reporting, so a large library may spend some time validating before the item counter starts moving.

Browser-only choices, like player positions and view modes, stay in that browser rather than in the backup.

#### 2.7.2 CSV Import and Export

Settings > Transfer lets you move media items and their personal fields between apps without needing a separate importer for each service. It is a one-time transfer, not continuous syncing. Use one row per item; JSON or XML exports need to be converted to a flat CSV first.

For importing, upload your file and choose what each column means. You can ignore columns you don't need, choose a media type for the whole file or map a type column, and match status values to the app's choices. Select the file's score scale and activity date format too. Decimal scores such as `2.5` and `2,5` are accepted; a decimal comma needs quotes if the CSV also uses commas between columns. Blank or zero scores mean unrated.

Provider IDs are the most reliable way to identify an item. AniList imports support both AniList and MyAnimeList IDs, and TV seasons can use Media Journal's `show_id_sN` TMDB ID format. Without IDs, the app searches by title and any mapped matching details such as year or creator. Review suggestions before pressing Import Matched Items. Search Again uses the title you enter and returns candidates for you to pick with Use This; it does not import them automatically.

Existing items are skipped without changing their notes, scores or dates. Rows that could not be imported can be downloaded with their original fields so you can correct them or add those items manually. Cancel on Match Columns clears the remembered import session and closes its panels.

Imports are limited to 50 MB and 50,000 rows per file. Matching and importing show progress and can be paused and resumed, including after a server restart. Temporary transfer data is cleaned up after seven days when a new transfer starts.

CSV exports contain personal fields, provider IDs, collection memberships and basic metadata. Scores use the internal 1–100 scale, with blank cells for unrated items. They do not include image files, people, logs or screenshot records. Formula-like text is protected for spreadsheets, and Media Journal restores its original text when re-importing its own export. The completed export message clears when you leave Settings.

#### 2.7.3 Share Favorites

In Settings > Extras > Share Favorites, choose the sections you want to share, PNG or PDF, whether titles should appear and a maximum of 5, 10, 15, 20 or 25 items per section. The export follows your current theme and favorite item order, with a separate image or PDF page for each section.

For PNG, up to three sections download as separate images. Four or more are grouped into a ZIP. PDF puts the selected sections into one document. This is useful when you want to share your favorites without sharing a link to your private server.

#### 2.7.4 Year in Review

Settings > Extras > Year in Review opens your latest available review and lets you browse past years. Each year's review becomes available on 20 December. A Home button also appears from 20 December through 7 January and opens the latest review without the year selector.

The review brings together completed items, favorites among those items, dropped items, scores and recorded activity. It uses Activity Date to place completed and dropped items in a year. You can pause the background effects and use Share at the bottom to export an image.

Movie time uses each completed movie's saved runtime. Completed AniList anime can use their episode totals and saved episode runtime. TV shows, game hours and reading progress use changes recorded after tracking was added, rather than assigning all your past progress to one year. Music includes recorded plays and listening time from the built-in player. A play counts after one minute or half the video, whichever is shorter.

Existing progress is the starting baseline; refreshing metadata or loading a backup does not count it as new activity. Later changes are recorded when you make them, so adding old progress now places that change in the current year. Pending music listening data stays in the browser until the player closes or a later session starts.

The 24 Nov 2026 update starts recording more detailed activity, so reviews from 2027 onward will have more complete statistics.

### 2.8 Add to Your Home Screen

Open Media Journal through your own HTTPS address and choose Install app or Add to Home screen in your browser's menu. On iPhone, use Safari's Share > Add to Home Screen, with Open as Web App enabled if shown. The icon opens the app without the usual browser address bar.

No domain needs to be added to the app's code. It uses the address you installed from. Your server still needs to be running and reachable; offline use is not included. Regular HTTP access continues to work in the browser, but installation generally requires HTTPS, except for localhost on the same device.

If you use Tailscale, see [Remote Access](../configuration/remote-access.md#https-with-tailscale-serve) for a private HTTPS setup.

### 2.9 News Page

News shows recent YouTube videos from a selection of channels for each media type. Search filters the loaded videos by keyword. Sort by Views or Upload Date, ascending or descending; your sort choice is remembered in the browser, while the page starts with Movies each time.

Open Channels on the sidebar to enable or disable sources, or add your own YouTube channel URL for that media type. Default channels can be disabled, while channels you add can also be deleted after confirmation. These choices are saved with your library and included in backups.

Press a thumbnail or title to play the video in the shared player. Next and Previous follow the displayed video order. News playback stays separate from your music listening statistics. The page uses each channel's recent RSS videos, so it does not keep an archive of past news.
