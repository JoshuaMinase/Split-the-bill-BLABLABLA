"""
Food image lookup — returns a real photo URL for a given food item name.

Strategy (all free, no API keys):

1. TheMealDB search API — free, no key, returns real food photos.
   Endpoint: https://www.themealdb.com/api/json/v1/1/search.php?s={name}
   Returns strMealThumb which is a direct CDN image URL.

2. Foodish API — has ~10 food categories, returns random real food photos.
   Endpoint: https://foodish-api.com/api/images/{category}
   Used as a category-based fallback when MealDB has no match.

3. UI Avatars fallback — a coloured square with the item initials.
   No image downloads, always works, used when both APIs fail.

The backend calls these at parse time and caches the result in the
session document. The frontend uses it as a plain <img src>.
"""
import asyncio
import hashlib
import urllib.parse
import httpx


# ─── TheMealDB ────────────────────────────────────────────────────────────────

MEALDB_SEARCH = "https://www.themealdb.com/api/json/v1/1/search.php?s={}"
MEALDB_FILTER = "https://www.themealdb.com/api/json/v1/1/filter.php?i={}"


# ─── Foodish category map ─────────────────────────────────────────────────────
# Maps keyword patterns to Foodish categories
# Full category list: https://foodish-api.com/api/images/
_FOODISH: list[tuple[list[str], str]] = [
    (["burger", "hamburger"],                          "burger"),
    (["pizza"],                                        "pizza"),
    (["pasta", "spaghetti", "noodle", "linguine"],     "pasta"),
    (["rice", "fried rice", "pilaf", "biryani"],       "rice"),
    (["chicken", "doro", "poultry"],                   "chicken-rice"),  # closest match
    (["dessert", "cake", "sweet", "ice cream"],        "dessert"),
    (["sandwich", "sub", "hoagie"],                    "sandwich"),
    (["idly", "idli", "dosa"],                         "idly"),
    (["biryani"],                                      "biryani"),
    (["butter chicken", "tikka", "masala"],            "butter-chicken"),
    (["dosa"],                                         "dosa"),
    (["dhokla"],                                       "dhokla"),
    (["samosa"],                                       "samosa"),
]

# ─── Keyword → direct image overrides for Ethiopian dishes ────────────────────
# Uses TheMealDB thumbnails for the closest international equivalent,
# or a high-quality Wikimedia Commons image for authentic Ethiopian dishes.
_DIRECT_OVERRIDES: dict[str, str] = {
    "injera":    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Injera_with_several_Ethiopian_dishes.jpg/320px-Injera_with_several_Ethiopian_dishes.jpg",
    "tibs":      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Tibs_with_injera.jpg/320px-Tibs_with_injera.jpg",
    "doro wat":  "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Doro_Wat.jpg/320px-Doro_Wat.jpg",
    "kitfo":     "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Kitfo.jpg/320px-Kitfo.jpg",
    "shiro":     "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Shiro_wat.jpg/320px-Shiro_wat.jpg",
    "firfir":    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Injera_with_several_Ethiopian_dishes.jpg/320px-Injera_with_several_Ethiopian_dishes.jpg",
}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _normalise(name: str) -> str:
    return name.lower().strip()


def _avatar_url(name: str) -> str:
    """Coloured square with item initials — always works, no network call."""
    initials = "".join(w[0].upper() for w in name.split()[:2]) or "?"
    # Deterministic colour from name hash
    colours = ["7c3aed", "8b5cf6", "ec4899", "f59e0b", "10b981", "3b82f6", "ef4444", "14b8a6"]
    idx = int(hashlib.md5(name.encode()).hexdigest(), 16) % len(colours)
    bg = colours[idx]
    encoded_name = urllib.parse.quote(initials)
    return f"https://ui-avatars.com/api/?name={encoded_name}&background={bg}&color=fff&size=200&bold=true&rounded=true"


def _foodish_category(name: str) -> str | None:
    lower = _normalise(name)
    for keywords, category in _FOODISH:
        if any(k in lower for k in keywords):
            return category
    return None


async def _mealdb_image(name: str, client: httpx.AsyncClient) -> str | None:
    """Search TheMealDB for the item name and return the thumbnail URL."""
    try:
        resp = await client.get(
            MEALDB_SEARCH.format(urllib.parse.quote(name)),
            timeout=10.0,  # Increased timeout
        )
        data = resp.json()
        meals = data.get("meals") or []
        if meals:
            return meals[0].get("strMealThumb")
    except Exception:
        pass
    return None


async def _foodish_image(category: str, client: httpx.AsyncClient) -> str | None:
    """Fetch a random Foodish image for the given category."""
    try:
        resp = await client.get(
            f"https://foodish-api.com/api/images/{category}",
            timeout=10.0,  # Increased timeout
        )
        data = resp.json()
        return data.get("image")
    except Exception:
        pass
    return None


# ─── Public API ───────────────────────────────────────────────────────────────

async def food_image_url_async(item_name: str) -> str:
    """
    Return a food image URL for the given item name (async version).
    Tries TheMealDB first, then Foodish, then falls back to an avatar URL.
    """
    lower = _normalise(item_name)

    # 1. Direct override for Ethiopian / known dishes
    for key, url in _DIRECT_OVERRIDES.items():
        if key in lower:
            return url

    async with httpx.AsyncClient(follow_redirects=True) as client:
        # 2. TheMealDB search
        url = await _mealdb_image(item_name, client)
        if url:
            return url

        # 3. Foodish category
        category = _foodish_category(item_name)
        if category:
            url = await _foodish_image(category, client)
            if url:
                return url

    # 4. Avatar fallback — always works
    return _avatar_url(item_name)


def food_image_url(item_name: str) -> str:
    """
    Synchronous wrapper — used in synchronous context (e.g. db.py).
    For async FastAPI routes use food_image_url_async directly.
    Falls back to avatar URL immediately (no network) to keep it fast.

    In the FastAPI route we call food_image_url_async and await it.
    This sync version is kept for compatibility but just returns the avatar.
    """
    lower = _normalise(item_name)
    for key, url in _DIRECT_OVERRIDES.items():
        if key in lower:
            return url
    return _avatar_url(item_name)
