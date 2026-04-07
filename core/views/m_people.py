import json

import requests
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET

from core.models import APIKey, FavoritePerson
from core.services.m_people import (
    actor_search,
    character_search,
    save_favorite_actor_character,
    delete_favorite_person_and_reorder,
)


@ensure_csrf_cookie
def character_search_view(request):
    query = request.GET.get("q", "")
    results = character_search(query) if query else []
    return JsonResponse(results, safe=False)


@ensure_csrf_cookie
def actor_search_view(request):
    query = request.GET.get("q", "")
    results = actor_search(query) if query else []
    return JsonResponse(results, safe=False)


def check_favorite_person_view(request):
    name = request.GET.get("name")
    person_type = request.GET.get("type")

    if not name or not person_type:
        return JsonResponse({"error": "Missing parameters"}, status=400)

    is_favorited = FavoritePerson.objects.filter(name=name, type=person_type).exists()
    return JsonResponse({"is_favorited": is_favorited})


@ensure_csrf_cookie
def toggle_favorite_person_view(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST request required."}, status=400)

    data = json.loads(request.body)
    name = data.get("name")
    image_url = data.get("image_url")
    person_type = data.get("type")
    person_id = data.get("person_id")  # New parameter for ID

    # Check if already favorited
    existing = FavoritePerson.objects.filter(name=name, type=person_type).first()
    if existing:
        # Delete favorite and reorder positions
        delete_favorite_person_and_reorder(existing.id)
        return JsonResponse({"status": "removed"})
    else:
        save_favorite_actor_character(name, image_url, person_type, person_id)
        return JsonResponse({"status": "added"})


# Used for detail and season_detail
@ensure_csrf_cookie
@require_GET
def load_more_cast(request):
    source = request.GET.get("source")
    source_id = request.GET.get("source_id")
    media_type = request.GET.get("media_type")
    page = int(request.GET.get("page", 1))

    if not all([source, source_id, media_type]):
        return JsonResponse({"error": "Missing parameters"}, status=400)

    try:
        if source == "tmdb":
            api_key = APIKey.objects.get(name="tmdb").key_1
            if media_type == "tv":
                url = f"https://api.themoviedb.org/3/tv/{source_id}/aggregate_credits"
            else:
                url = f"https://api.themoviedb.org/3/movie/{source_id}/credits"

            response = requests.get(url, params={"api_key": api_key})
            if response.status_code != 200:
                return JsonResponse({"error": "Failed to fetch cast"}, status=500)

            data = response.json()
            all_cast = data.get("cast", [])

            # Paginate: page 1 = next 24 after first 8, page 2+ = 32 each
            if page == 1:
                start_idx = 8
                end_idx = 32
            else:
                start_idx = 32 + (page - 2) * 32
                end_idx = start_idx + 32
            cast_page = all_cast[start_idx:end_idx]

            cast_data = []
            for actor in cast_page:
                if media_type == "tv":
                    character_name = (
                        actor.get("roles", [{}])[0].get("character")
                        if actor.get("roles")
                        else ""
                    )
                else:
                    character_name = actor.get("character")

                profile_url = (
                    f"https://image.tmdb.org/t/p/w185{actor.get('profile_path')}"
                    if actor.get("profile_path")
                    else ""
                )
                cast_data.append(
                    {
                        "name": actor.get("name"),
                        "character": character_name,
                        "profile_path": profile_url,
                        "id": actor.get("id"),
                        "is_full_url": True,
                    }
                )

            has_more = end_idx < len(all_cast)

        elif source in ["mal", "anilist"]:
            # For anime/manga, use AniList API
            if source == "anilist":
                query = """
                query ($id: Int, $type: MediaType, $page: Int) {
                  Media(id: $id, type: $type) {
                    characters(sort: [ROLE, RELEVANCE], page: $page, perPage: 25) {
                      pageInfo {
                        hasNextPage
                      }
                      nodes {
                        id
                        name {
                          full
                        }
                        image {
                          large
                        }
                      }
                    }
                  }
                }
                """
            else:
                query = """
                query ($id: Int, $type: MediaType, $page: Int) {
                  Media(idMal: $id, type: $type) {
                    characters(sort: [ROLE, RELEVANCE], page: $page, perPage: 25) {
                      pageInfo {
                        hasNextPage
                      }
                      nodes {
                        id
                        name {
                          full
                        }
                        image {
                          large
                        }
                      }
                    }
                  }
                }
                """

            # For AniList: page 1 gets remaining 17 from first page, page 2+ gets full pages
            if page == 1:
                anilist_page = 1
            else:
                anilist_page = page

            variables = {
                "id": int(source_id),
                "type": media_type.upper(),
                "page": anilist_page,
            }

            response = requests.post(
                "https://graphql.anilist.co",
                json={"query": query, "variables": variables},
                headers={"Content-Type": "application/json"},
            )

            if response.status_code != 200:
                return JsonResponse({"error": "Failed to fetch characters"}, status=500)

            data = response.json()
            characters_data = (
                data.get("data", {}).get("Media", {}).get("characters", {})
            )
            characters = characters_data.get("nodes", [])
            has_more = characters_data.get("pageInfo", {}).get("hasNextPage", False)

            cast_data = []
            # For page 1, skip first 8 characters (already shown)
            start_idx = 8 if page == 1 else 0
            for char in characters[start_idx:]:
                cast_data.append(
                    {
                        "name": char.get("name", {}).get("full", ""),
                        "character": "Character",
                        "profile_path": char.get("image", {}).get("large", ""),
                        "id": char.get("id"),
                        "is_full_url": True,
                    }
                )

        else:
            return JsonResponse({"error": "Unsupported source"}, status=400)

        return JsonResponse({"cast": cast_data, "has_more": has_more, "page": page})

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
