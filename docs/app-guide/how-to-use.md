# How to use

On this page I will describe how you can use the app and explain some of its meaningful functionalities and details.

## 1. Media Items

### 1.1 Search and Discover

After you add your API keys you can start adding items. You can go to any list page from the header (like Movies) which will make the search bar symbol appear. The search bar automatically adapts to the page you are on. For example the TV shows page will open the search bar for TV shows, anime for anime and so on. 

> **Note:** You can turn on live search next to the search bar so that results come as you type. Keep in mind this consumes extra API calls and might time you out.

Alternatively you can open the discover page from the home page. There you can just hover over an item and press the plus button to quickly add it. 

When using the search bar, clicking on an item will open its details page where you can press the add to my list button.

### 1.2 Details Page

Each media type has different sections on its details page. You can rearrange them or hide them completely from Settings > Preferences > Details Page Sections.

If you want to see more details about an item you can press on More Information. I made this button load extra information through an on-demand API call so you always get the latest data. This way whenever you load a page for an item already in your list there are no automatic API calls. The app only fetches data when you actually want it. 

Here are some notable sections:

#### 1.2.1 Journal Section

In this section you can see and write Notes and Logs. Notes also appear in the edit modal and are supposed to be a single place where you keep general thoughts about your media. Logs on the other hand can only be created from the journal section. You can have multiple logs for an item which gives you more options to keep detailed and sectioned info.

> **Note:** Both your notes and logs will appear under each media item when you use the Detailed List View on list pages.

#### 1.2.2 Cast & Characters Section

Here you will see 8 actors or characters by default and you can see the rest with the load more button. When you hover over them you can favorite or unfavorite using the heart icon. There is also a search button here to search for any specific character or actor. This is the only place in the app where you can search for them.

#### 1.2.3 Music Section

In this section you can add YouTube URLs to link videos for a music item. Just note that only the video at the top of the list will be played in the built-in music player.

#### 1.2.4 Screenshots Section

Games automatically come with some screenshots fetched from the API but you can also add your own. The ADD button will simply put your new screenshots after the existing ones. The SWAP button will delete all existing screenshots and replace them entirely with the ones you upload. From here you can also delete individual screenshots, make them fullscreen and turn on autoplay.

### 1.3 Custom Media Items

If you cannot find the media you are looking for you can create a custom item. Just press the + button directly from the list page of the media type where you want it placed. This is also very useful if you want to add media types that are not officially supported like comics, podcasts or board games.

> **Note:** You can make a Collection of all your custom items of an unsupported type so it basically acts as a dedicated custom list.

### 1.4 Edit Item

After adding your items you can start editing them by pressing the ... button from the list pages or the history page. You can also press Edit Item directly from the details page. 

Besides the default tracking fields you can enable additional ones from Settings > Preferences > Edit Modal Fields. Options like Activity Date, Repeats and Collections are disabled by default so they don't clutter the edit modal if you don't need them.

#### 1.4.1 Scoring System

The app lets you change your scoring system at any time. All score values are saved locally on a 1 to 100 scale. For example a 5 gets saved as 50, 3 stars get saved as 60 and a neutral face gets saved as 50. Because everything is standardized behind the scenes you can change from one scoring system to another without breaking your existing ratings.

### 1.5 Edit Metadata 

By going to the details page and clicking the Gear icon > Edit Metadata you can manually edit the data fetched from the API. This includes things like genres, creators, release dates and so on.

> **Note:** Keep in mind that if you ever press Refresh Data from the gear menu the app will fetch from the API again and your custom metadata will be overwritten.

### 1.6 Refresh Data

In Settings > Refresh > Refresh Data you can refresh all items or choose specific media types and fields (like genres, creators etc). This is sometimes more useful and convenient than manually refreshing data one by one on the details page. It is especially useful when I update the app and add a new field. For example when I added the Genres field all existing items needed to be refreshed to populate that field with data from the API.

> **Note:** Some APIs are slower than others during this process because of their call limits or infrastructure speed.

### 1.7 Music Player

You can start the music player using the ♪ button that appears next to the community button when you have favorited at least 1 song. There is also a similar button that starts the player on the music list page. When the music player is started from the home page it will play only your favorited songs in a random order. The one started from the list page will play the songs from your currently selected status (All, Completed, Dropped etc) in a random order. 

If you want to play a specific song you can hover over a music card and press the ▶ button. This will play the selected song and continue with the songs next to it in their current order from left to right.

> **Note:** The music player is rebuilt every time you go to a new page because the app is built as a multiple page app rather than a single page app (like Spotify for example). If it was a single page app that YouTube player would stay continuously while you navigate from page to page. I added music and the music player later on and they weren't planned from the start so that's why we are stuck with the way it works now. I would have to rebuild the whole app if I wanted to make it single page and it's not worth it for one feature. But as it stands now it works well enough. Plus on pages like Discover you can browse multiple sections like movies and TV shows without navigating away so the player is not being rebuilt which is nice.

## 2. Main Pages & Features

Now that you have your media items and your lists are growing here are some useful pages and functionalities you can use.

### 2.1 Home Page

The home page has multiple sections for favorites, stats, activity history, collections and upcoming releases.

> **Note:** If you press on the Stats or Activity History titles they will swap to show Collections and Upcoming Releases instead. Your choice remains saved locally so you can leave them the way you prefer. Also if you press on any favorites section title (e.g. Movies, Actors etc) it will open the favorites page.

#### 2.1.1 Stats Section

This section shows the amount of media items you have and meaningful stats about them like days watched and days played. To make the page load faster I simplified how days watched is calculated the same way other sites do it. Rather than getting the exact length of each individual movie, TV show or anime I multiply them by an average value. I use 90 minutes per movie, 40 minutes per TV show episode and 24 minutes per anime episode. When your lists have hundreds or thousands of media items these average values are accurate enough so it's good enough.

#### 2.1.2 Collections Section

Here you can see your top 10 collections and quickly access the collections page using the arrow button.

#### 2.1.3 Activity History Section

Here you can see an activity graph that shows items you modified or added by activity date per day for the past 24 weeks (about 5.5 months). Under it you will find the latest media items and how long ago they were updated. You can also find the Media History button here which redirects you to the History page.

#### 2.1.4 Upcoming Releases Section

Here you can view the latest releases in tiles for one week ahead and from the last week. It also shows the 12 newest upcoming releases and how long it is until they release. From here you can access the calendar page through the Calendar button.

> **Note:** When you swap from activity history to upcoming releases the data for the calendar refreshes automatically and the tiles are populated so you don't have to go to the calendar page every time to get updates.

#### 2.1.5 Favorites Section

The favorites section will show the top 25 of your media items, actors and characters. You can reorder them on the favorites page if you want to see different ones show up in these sections.

#### 2.1.6 Notifications

There are 3 types of notifications that can appear on the home page:  
1. TV shows, anime or manga that got a new season or sequel found from background checks.  
2. Calendar notifications for specific items that you manually enable on the calendar page.   
3. System notifications that I manually make when I add an important update you should be informed about.

### 2.2 History Page

Here you can see all your media items in one single place and you have more filtering options to search through them.

### 2.3 Calendar Page

Here you can see all the past and upcoming releases displayed as pills inside a calendar. Pills older than 3 months are deleted automatically to not clutter the calendar or database for nothing. There is no limit for upcoming releases. The calendar automatically refreshes every time you access the page.

### 2.4 Favorites Page

Here you can see all your favorited items and reorder them. You can also create custom characters and actors using the + button if you can't find specific ones when searching the APIs.

### 2.5 Community Page

The community page uses a Realtime Database from Firebase to store data. It uses the free plan which from my calculations can support about 100 to 1000 users actively using the page every day. I didn't add user accounts so that the page is more likely to be used. This also means it can be easily abused and I am the only moderator. I just base my hopes that moderation won't be needed with a small number of users. If it ever gets out of control I can either add Firebase authentication or just nuke it :).

On the community page posts you can insert YouTube videos, Imgur images, links and media items (excluding custom items).