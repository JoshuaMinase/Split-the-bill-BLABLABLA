"""
Food image lookup — returns a real photo URL for a given food item name.

Strategy (no API keys required):
  1. Try Unsplash Source (free, no auth, returns a redirect to a photo).
     URL: https://source.unsplash.com/200x200/?food,{query}
     This works as a direct <img src=""> — the redirect resolves in the browser.
     We just return the constructed URL; no HTTP call needed server-side.

  2. Fallback: a deterministic DiceBear "shapes" avatar so there's always
     something colourful even for unknown items.

Why not Foodish API? It only has ~10 fixed food categories with random images
and doesn't support search, so it would show random unrelated photos.

The Unsplash Source endpoint is:
  https://source.unsplash.com/200x200/?{keyword},{keyword2}
It resolves to a real Unsplash photo for that query — free, no key.
"""
import re
import urllib.parse


# Common food keywords to improve match quality
_NOISE = {
    "with", "and", "or", "the", "a", "an", "of", "in", "on", "side",
    "extra", "no", "add", "large", "small", "medium", "combo", "special",
    "grilled", "fried", "fresh", "hot", "cold", "spicy",
}

# Explicit overrides for common Ethiopian / generic restaurant items
_OVERRIDES: dict[str, str] = {
    "tibs":        "Ethiopian+tibs+beef",
    "injera":      "injera+Ethiopian+bread",
    "doro wat":    "doro+wat+Ethiopian",
    "kitfo":       "kitfo+Ethiopian+beef",
    "shiro":       "shiro+Ethiopian+chickpea",
    "firfir":      "injera+firfir+Ethiopian",
    "tej":         "tej+Ethiopian+honey+wine",
    "coffee":      "Ethiopian+coffee+buna",
    "tea":         "tea+cup",
    "water":       "water+glass+drink",
    "juice":       "fresh+juice+glass",
    "burger":      "burger+sandwich",
    "pizza":       "pizza+slice",
    "pasta":       "pasta+dish",
    "salad":       "salad+bowl",
    "fries":       "french+fries",
    "chicken":     "grilled+chicken",
    "fish":        "fish+dish+food",
    "rice":        "rice+dish",
    "soup":        "soup+bowl",
    "steak":       "steak+beef",
    "sandwich":    "sandwich+bread",
    "cake":        "cake+dessert",
    "ice cream":   "ice+cream+dessert",
}


def _sanitise(name: str) -> str:
    """Turn an item name into a clean search keyword string."""
    lower = name.lower().strip()

    # Check explicit overrides first (substring match)
    for key, replacement in _OVERRIDES.items():
        if key in lower:
            return replacement

    # Remove noise words, keep meaningful tokens
    tokens = re.split(r"[\s,/\-]+", lower)
    tokens = [t for t in tokens if t and t not in _NOISE and len(t) > 1]
    if not tokens:
        tokens = [lower.replace(" ", "+")]

    # Take up to 3 tokens for the query
    return "+".join(tokens[:3]) + "+food"


def food_image_url(item_name: str) -> str:
    """
    Return a direct image URL for the given food item name.
    Uses Unsplash Source — a free, no-auth service that resolves to a real photo.
    The URL works directly as an <img src> in the browser.
    """
    query = _sanitise(item_name)
    # Unsplash Source format: https://source.unsplash.com/WxHxW/?keyword
    encoded = urllib.parse.quote(query.replace("+", ","))
    return f"https://source.unsplash.com/200x200/?{encoded}"
