import logging
import datetime

import requests
from django.apps import apps
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET

from core.models import MediaItem
from core.services.m_music import wait_for_rate_limit

logger = logging.getLogger(__name__)


@ensure_csrf_cookie
@require_GET
def musicbrainz_search(request):
    wait_for_rate_limit()
    query = request.GET.get("q", "").strip()

    if not query:
        return JsonResponse({"error": "Query parameter 'q' is required."}, status=400)

    # 1. Fetch data from MusicBrainz
    try:
        url = "https://musicbrainz.org/ws/2/recording"
        params = {"query": query, "limit": 20, "fmt": "json"}
        headers = {
            "User-Agent": "MediaJournal/1.0 (https://github.com/mihail-pop/media-journal)"
        }

        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 503:
            return JsonResponse(
                {
                    "error": "Most likely MusicBrainz API rate limit error. Please try again in a moment."
                },
                status=503,
            )
        return JsonResponse(
            {
                "error": f"Failed to fetch from MusicBrainz (Error {e.response.status_code})."
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

    except Exception as e:
        logger.error(f"MusicBrainz search error: {str(e)}")
        return JsonResponse({"error": f"Search failed: {str(e)}"}, status=500)

    # 2. Process recordings into entries
    entries = []
    for recording in data.get("recordings", []):
        title = recording.get("title", "Untitled")
        artists_list = [a.get("name", "") for a in recording.get("artist-credit", [])]
        recording_id = recording.get("id")

        for r in recording.get("releases", []):
            rg = r.get("release-group", {})
            primary_type = rg.get("primary-type", "").lower()
            secondary_types = [s.lower() for s in rg.get("secondary-types", [])]

            if not r.get("date"):
                continue

            year = r.get("date")[:4] if len(r.get("date")) >= 4 else ""

            entries.append(
                {
                    "id": recording_id,
                    "title": title,
                    "artists": artists_list,
                    "release_title": r.get("title", ""),
                    "release_type": primary_type,
                    "secondary_types": secondary_types,
                    "year": year,
                }
            )

    # 3. Group by song title + artists
    grouped = {}
    for e in entries:
        key = (e["title"].lower(), tuple([a.lower() for a in e["artists"]]))
        grouped.setdefault(key, []).append(e)

    # 4. Filter: keep all albums, only show singles if no album
    filtered = []
    for recs in grouped.values():
        albums = [
            r
            for r in recs
            if r["release_type"] == "album"
            and not any(
                st in ["live", "remix", "compilation", "ep"]
                for st in r["secondary_types"]
            )
        ]
        if albums:
            filtered.append(albums[0])  # keep only the first album per title+artist
        else:
            filtered.append(recs[0])  # keep only the first single if no album

    # 5. Format results for the frontend
    results = []
    for r in filtered:
        display_title = r["title"]
        if r["artists"]:
            display_title += f" by {', '.join(r['artists'])}"
        if r["year"]:
            display_title += f" | {r['year']}"

        results.append(
            {
                "id": r["id"],
                "title": display_title,
                "poster_path": None,
            }
        )

    return JsonResponse({"results": results})


@ensure_csrf_cookie
@require_GET
def musicbrainz_detail(request, recording_id):
    item = None
    try:
        item = MediaItem.objects.get(provider_ids__musicbrainz=str(recording_id))

        # Get YouTube links from screenshots field
        youtube_links = item.screenshots or []

        # Format release date
        formatted_release_date = ""
        if item.release_date:
            try:
                parsed_date = datetime.datetime.strptime(item.release_date, "%Y-%m-%d")
                formatted_release_date = parsed_date.strftime("%d %B %Y")
            except ValueError:
                formatted_release_date = item.release_date

        AppSettings = apps.get_model("core", "AppSettings")
        settings = AppSettings.objects.first()
        theme_mode = settings.theme_mode if settings else "dark"

        # Extract artist and album IDs from cast field
        cast_data = item.cast or {}
        artist_id = (
            cast_data.get("artists", [{}])[0].get("id", "")
            if cast_data.get("artists")
            else ""
        )
        album_id = (
            cast_data.get("album", {}).get("id", "") if cast_data.get("album") else ""
        )

        return render(
            request,
            "core/p_media_details.html",
            {
                "item": item,
                "item_id": item.id,
                "source": "musicbrainz",
                "source_id": recording_id,
                "in_my_list": True,
                "media_type": "music",
                "title": item.title,
                "overview": item.overview,
                "banner_url": item.banner_url,
                "poster_url": item.cover_url,
                "release_date": formatted_release_date,
                "cast": [],
                "recommendations": [],
                "seasons": None,
                "youtube_links": youtube_links,
                "page_type": "music",
                "theme_mode": theme_mode,
                "artist_id": artist_id,
                "album_id": album_id,
            },
        )
    except MediaItem.DoesNotExist:
        pass

    wait_for_rate_limit()
    # Fetch from MusicBrainz API
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

    # Get first release by date
    first_release = ""
    releases = recording_data.get("releases", [])
    if releases:
        sorted_releases = sorted(
            [r for r in releases if r.get("date")], key=lambda x: x.get("date", "")
        )
        if sorted_releases:
            release = sorted_releases[0]
            release_title = release.get("title", "")
            release_type = release.get("release-group", {}).get("primary-type", "")
            first_release = (
                f"{release_title} ({release_type})" if release_type else release_title
            )

    # Get genres from tags
    genres = [tag.get("name", "") for tag in recording_data.get("tags", [])[:5]]

    # Build overview
    overview_parts = []
    if artists:
        overview_parts.append(f"{artist_label}: {artists}")
    if first_release:
        overview_parts.append(f"First released as: {first_release}")
    if genres:
        overview_parts.append(f"Genres: {', '.join(genres)}")
    overview = "\n".join(overview_parts)

    # Get ISRC for YouTube search
    isrcs = recording_data.get("isrcs", [])
    isrc = isrcs[0] if isrcs else None

    # Search YouTube
    youtube_link = None
    poster_url = None
    banner_url = None
    if isrc:
        search_query = isrc
    else:
        search_query = f"{artists} {title}"

    # Simple YouTube search via scraping (no API key needed)
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

            # Find video entries with their view counts nearby
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
                youtube_link = f"https://www.youtube.com/watch?v={best_video}"
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
                        poster_url = max_res_url
                    else:
                        poster_url = (
                            f"https://img.youtube.com/vi/{best_video}/hqdefault.jpg"
                        )
                except Exception:
                    poster_url = (
                        f"https://img.youtube.com/vi/{best_video}/hqdefault.jpg"
                    )
                banner_url = poster_url
            else:
                print("No title match found, skipping YouTube link")
    except Exception as e:
        print(f"YouTube search error: {str(e)}")
        pass

    # Get release date
    release_date = ""
    releases = recording_data.get("releases", [])
    if releases:
        first_release = releases[0]
        release_date = first_release.get("date", "")

    # Format release date
    formatted_release_date = ""
    if release_date:
        try:
            if len(release_date) >= 10:
                parsed_date = datetime.datetime.strptime(release_date[:10], "%Y-%m-%d")
                formatted_release_date = parsed_date.strftime("%d %B %Y")
            elif len(release_date) >= 4:
                formatted_release_date = release_date[:4]
        except ValueError:
            formatted_release_date = release_date

    AppSettings = apps.get_model("core", "AppSettings")
    settings = AppSettings.objects.first()
    theme_mode = settings.theme_mode if settings else "dark"

    # Extract artist and album IDs
    artist_id = (
        artist_credits[0].get("artist", {}).get("id", "") if artist_credits else ""
    )
    first_release_id = releases[0].get("id", "") if releases else ""

    return render(
        request,
        "core/p_media_details.html",
        {
            "item": None,
            "item_id": None,
            "source": "musicbrainz",
            "source_id": recording_id,
            "in_my_list": False,
            "media_type": "music",
            "title": title,
            "overview": overview,
            "banner_url": banner_url or "",
            "poster_url": poster_url or "",
            "release_date": formatted_release_date,
            "cast": [],
            "recommendations": [],
            "seasons": None,
            "youtube_links": [{"url": youtube_link, "position": 1}]
            if youtube_link
            else [],
            "page_type": "music",
            "theme_mode": theme_mode,
            "artist_id": artist_id,
            "album_id": first_release_id,
        },
    )
