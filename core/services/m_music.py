import time
import logging
import datetime

import requests
from django.http import JsonResponse

from core.models import MediaItem
from core.services.g_utils import download_image

logger = logging.getLogger(__name__)

last_request_time = 0


def wait_for_rate_limit():
    """
    Ensures that at least one second has passed since the last API call for all the musicbrainz functions.
    """
    global last_request_time
    elapsed = time.time() - last_request_time
    if elapsed < 1:
        time.sleep(1 - elapsed)
    last_request_time = time.time()


def save_musicbrainz_item(recording_id):
    wait_for_rate_limit()
    headers = {
        "User-Agent": "MediaJournal/1.0 (https://github.com/mihail-pop/media-journal)"
    }

    # Get recording details
    recording_url = f"https://musicbrainz.org/ws/2/recording/{recording_id}"
    recording_params = {
        "inc": "artists+releases+release-groups+isrcs+tags",
        "fmt": "json",
    }

    try:
        recording_response = requests.get(
            recording_url, params=recording_params, headers=headers, timeout=10
        )
        recording_response.raise_for_status()

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 503:
            return JsonResponse(
                {
                    "error": "Most likely MusicBrainz api rate limit error. Please try again in a moment."
                },
                status=503,
            )
        else:
            return JsonResponse(
                {
                    "error": f"Failed to fetch details from MusicBrainz (Error {e.response.status_code})."
                },
                status=e.response.status_code,
            )

    except requests.exceptions.RequestException:
        return JsonResponse(
            {
                "error": "Failed to connect to MusicBrainz. Please check your network connection."
            },
            status=500,
        )

    recording_data = recording_response.json()

    # Get title and artist
    title = recording_data.get("title", "Untitled")
    artist_credits = recording_data.get("artist-credit", [])
    artists = ", ".join([a.get("name", "") for a in artist_credits])
    artist_label = "Artist" if len(artist_credits) == 1 else "Artists"

    # Get first release by date and ISRC
    first_release = ""
    first_release_id = ""
    first_release_type = ""
    releases = recording_data.get("releases", [])
    if releases:
        sorted_releases = sorted(
            [r for r in releases if r.get("date")], key=lambda x: x.get("date", "")
        )
        if sorted_releases:
            release = sorted_releases[0]
            first_release = release.get("title", "")
            first_release_id = release.get("id", "")
            first_release_type = release.get("release-group", {}).get(
                "primary-type", ""
            )

    isrcs = recording_data.get("isrcs", [])
    isrc = isrcs[0] if isrcs else ""

    # Get genres from tags
    genres = [tag.get("name", "") for tag in recording_data.get("tags", [])[:5]]

    # Build overview
    overview_parts = []
    if artists:
        overview_parts.append(f"{artist_label}: {artists}")
    if first_release:
        release_display = (
            f"{first_release} ({first_release_type})"
            if first_release_type
            else first_release
        )
        overview_parts.append(f"First released as: {release_display}")
    if genres:
        overview_parts.append(f"Genres: {', '.join(genres)}")
    overview = "\n".join(overview_parts)

    # Store data in cast field
    cast_data = {
        "artists": [
            {"name": a.get("name", ""), "id": a.get("artist", {}).get("id", "")}
            for a in artist_credits
        ],
        "genres": genres,
        "album": {
            "title": first_release,
            "id": first_release_id,
            "type": first_release_type,
        }
        if first_release
        else None,
        "isrc": isrc,
    }

    # Search YouTube
    youtube_links = []
    local_poster = ""
    if isrc:
        search_query = isrc
    else:
        search_query = f"{artists} {title}"

    # Simple YouTube search via scraping
    try:
        import unicodedata
        import urllib.parse

        def normalize_text(text):
            # Remove accents and convert to lowercase
            text = "".join(
                c
                for c in unicodedata.normalize("NFD", text)
                if unicodedata.category(c) != "Mn"
            ).lower()
            # Keep only letters, numbers and spaces
            text = "".join(c for c in text if c.isalnum() or c.isspace())
            # Normalize all whitespace to single spaces
            return " ".join(text.split())

        yt_search_url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(search_query)}"

        yt_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        yt_response = requests.get(yt_search_url, headers=yt_headers, timeout=10)

        if yt_response.status_code == 200:
            import re

            # Find video entries
            video_ids = re.findall(r'"videoId":"([^"]+)"', yt_response.text)

            # Get unique videos
            videos = []
            seen = set()
            for vid in video_ids:
                if vid not in seen and len(videos) < 10:
                    videos.append(vid)
                    seen.add(vid)

            # Match videos by title
            best_video = None
            title_normalized = normalize_text(title)

            video_titles = []
            for video_id in videos:
                video_pos = yt_response.text.find(f'"videoId":"{video_id}"')
                if video_pos == -1:
                    continue
                search_window = yt_response.text[video_pos : video_pos + 2000]
                title_pattern = r'"title":{"runs":\[{"text":"([^"]+)"}'
                title_match = re.search(title_pattern, search_window)

                if title_match:
                    video_title = title_match.group(1)
                    video_title_normalized = normalize_text(video_title)
                    video_titles.append((video_id, video_title, video_title_normalized))

                    if (
                        title_normalized in video_title_normalized
                        or video_title_normalized in title_normalized
                    ):
                        best_video = video_id
                        break

            # Fallback: try matching by artist names
            if not best_video and artists:
                artist_list = [normalize_text(a.strip()) for a in artists.split(",")]

                for artist_name in artist_list:
                    for video_id, video_title, video_title_normalized in video_titles:
                        if artist_name in video_title_normalized:
                            best_video = video_id
                            break
                    if best_video:
                        break

            if not best_video and isrc:
                # Retry search by title + artist
                search_query = f"{artists} {title}"
                yt_search_url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(search_query)}"
                yt_response = requests.get(
                    yt_search_url, headers=yt_headers, timeout=10
                )

                video_ids = re.findall(r'"videoId":"([^"]+)"', yt_response.text)
                videos = []
                seen = set()
                for vid in video_ids:
                    if vid not in seen and len(videos) < 10:
                        videos.append(vid)
                        seen.add(vid)

                video_titles = []
                for video_id in videos:
                    video_pos = yt_response.text.find(f'"videoId":"{video_id}"')
                    if video_pos == -1:
                        continue
                    search_window = yt_response.text[video_pos : video_pos + 2000]
                    title_pattern = r'"title":{"runs":\[{"text":"([^"]+)"}'
                    title_match = re.search(title_pattern, search_window)
                    if title_match:
                        video_title = title_match.group(1)
                        video_title_normalized = normalize_text(video_title)
                        video_titles.append(
                            (video_id, video_title, video_title_normalized)
                        )
                        if (
                            normalize_text(title) in video_title_normalized
                            or video_title_normalized in normalize_text(title)
                        ):
                            best_video = video_id
                            break

                # fallback by artist again
                if not best_video and artists:
                    artist_list = [
                        normalize_text(a.strip()) for a in artists.split(",")
                    ]
                    for artist_name in artist_list:
                        for (
                            video_id,
                            video_title,
                            video_title_normalized,
                        ) in video_titles:
                            if artist_name in video_title_normalized:
                                best_video = video_id
                                break
                        if best_video:
                            break

            if best_video:
                youtube_links.append(
                    {
                        "url": f"https://www.youtube.com/watch?v={best_video}",
                        "position": 1,
                    }
                )
                # Try maxresdefault first, fallback to hqdefault if not available
                max_res_url = (
                    f"https://img.youtube.com/vi/{best_video}/maxresdefault.jpg"
                )
                try:
                    img_check = requests.head(max_res_url, timeout=3)
                    if (
                        img_check.status_code == 200
                        and int(img_check.headers.get("content-length", 0)) > 5000
                    ):
                        thumbnail_url = max_res_url
                    else:
                        thumbnail_url = (
                            f"https://img.youtube.com/vi/{best_video}/hqdefault.jpg"
                        )
                except Exception:
                    thumbnail_url = (
                        f"https://img.youtube.com/vi/{best_video}/hqdefault.jpg"
                    )
                cache_bust = int(time.time() * 1000)
                local_poster = download_image(
                    thumbnail_url,
                    f"posters/musicbrainz_{recording_id}_{cache_bust}.jpg",
                )
                local_banner = download_image(
                    thumbnail_url,
                    f"banners/musicbrainz_{recording_id}_{cache_bust}.jpg",
                )
            else:
                print("[SAVE] No match found, saving without YouTube link")
    except Exception as e:
        print(f"[SAVE] YouTube search error: {str(e)}")
        pass

    # Get release date
    release_date = None
    releases = recording_data.get("releases", [])
    if releases:
        first_release = releases[0]
        release_date_str = first_release.get("date", "")

        # Format release date
        if release_date_str:
            try:
                if len(release_date_str) >= 10:
                    parsed_date = datetime.datetime.strptime(
                        release_date_str[:10], "%Y-%m-%d"
                    )
                    release_date = parsed_date.strftime("%Y-%m-%d")
                elif len(release_date_str) >= 4:
                    release_date = f"{release_date_str[:4]}-01-01"
            except ValueError:
                pass

    # Save to database
    MediaItem.objects.create(
        title=title,
        media_type="music",
        source="musicbrainz",
        source_id=recording_id,
        cover_url=local_poster,
        banner_url=local_banner if "local_banner" in locals() else "",
        overview=overview,
        release_date=release_date,
        cast=cast_data,
        seasons=None,
        related_titles=[],
        screenshots=youtube_links,
    )

    return JsonResponse({"success": True, "message": "Song added to list"})


def get_music_extra_info(recording_id, artist_id=None, album_id=None):

    print(
        f"[MUSIC] Starting for recording_id: {recording_id}, artist_id: {artist_id}, album_id: {album_id}"
    )

    cast_data = {}
    try:
        item = MediaItem.objects.get(source="musicbrainz", source_id=recording_id)
        cast_data = item.cast or {}
        if not artist_id:
            artist_id = (
                cast_data.get("artists", [{}])[0].get("id", "")
                if cast_data.get("artists")
                else ""
            )
        if not album_id:
            album_id = (
                cast_data.get("album", {}).get("id", "")
                if cast_data.get("album")
                else ""
            )
        print(f"[MUSIC] From DB - artist_id: {artist_id}, album_id: {album_id}")
    except MediaItem.DoesNotExist:
        print("[MUSIC] Item not in DB, using passed IDs")

    headers = {
        "User-Agent": "MediaJournal/1.0 (https://github.com/mihail-pop/media-journal)"
    }
    album_tracks = []
    artist_singles = []

    # Fetch album tracks
    if album_id:
        time.sleep(1)
        album_url = f"https://musicbrainz.org/ws/2/release/{album_id}"
        album_params = {"inc": "recordings", "fmt": "json"}
        try:
            album_response = requests.get(
                album_url, params=album_params, headers=headers, timeout=10
            )
            print(f"[MUSIC] Album status: {album_response.status_code}")
            if album_response.status_code == 200:
                album_data = album_response.json()
                for medium in album_data.get("media", []):
                    for track in medium.get("tracks", []):
                        recording = track.get("recording", {})
                        rec_id = recording.get("id", "")
                        if rec_id and rec_id != recording_id:
                            album_tracks.append(
                                {"title": recording.get("title", ""), "id": rec_id}
                            )
                print(f"[MUSIC] Album tracks: {len(album_tracks)}")
        except Exception as e:
            print(f"[MUSIC] Album error: {e}")

    # Fetch artist singles via release-groups (no IDs)
    if artist_id:
        time.sleep(1)
        rg_url = "https://musicbrainz.org/ws/2/release-group"
        rg_params = {
            "artist": artist_id,
            "type": "single",
            "fmt": "json",
            "limit": 100,
            "offset": 0,
        }

        try:
            while True:
                rg_response = requests.get(
                    rg_url, params=rg_params, headers=headers, timeout=10
                )
                if rg_response.status_code != 200:
                    print(
                        f"[MUSIC] Release-group request failed: {rg_response.status_code}"
                    )
                    break

                rg_data = rg_response.json()
                rgs = rg_data.get("release-groups", [])
                print(
                    f"[MUSIC] Retrieved {len(rgs)} release-groups at offset {rg_params['offset']}"
                )

                for rg in rgs:
                    secondary_types = rg.get("secondary-types", [])
                    if secondary_types:
                        continue  # skip live, remix, compilation, EP

                    title = rg.get("title", "")
                    earliest_date = rg.get("first-release-date", "")
                    if title:
                        artist_singles.append({"title": title, "date": earliest_date})

                if len(rgs) < 100:
                    break
                rg_params["offset"] += 100

            # Sort by date descending (newest → oldest)
            artist_singles.sort(key=lambda x: x["date"] or "0000-00-00", reverse=True)
            print(f"[MUSIC] Total singles after sort: {len(artist_singles)}")
        except Exception as e:
            print(f"[MUSIC] Singles error: {e}")

    print(
        f"[MUSIC] Returning tracks={len(album_tracks)}, singles={len(artist_singles)}"
    )
    return {"album_tracks": album_tracks, "artist_singles": artist_singles}
