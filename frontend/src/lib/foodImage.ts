import http from 'http';

export async function foodImageUrlAsync(query: string | null | undefined): Promise<string | null> {
  if (!query || !query.trim()) return null;
  const q = query.trim();

  // 1) Try TheMealDB search by name
  try {
    const url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`;
    const data = await fetch(url, { method: 'GET' });
    if (data.ok) {
      const json = await data.json();
      if (json && json.meals && json.meals.length > 0) {
        const meal = json.meals[0];
        if (meal && meal.strMealThumb) return meal.strMealThumb as string;
      }
    }
  } catch (e) {
    // ignore
  }

  // 2) Unsplash source image fallback (no API key required)
  try {
    const unsplash = `https://source.unsplash.com/featured/?${encodeURIComponent(q + ' food')}`;
    return unsplash;
  } catch (e) {
    // ignore
  }

  // 3) Generic Foodish fallback (random image)
  try {
    const res = await fetch('https://foodish-api.herokuapp.com/api/');
    if (res.ok) {
      const j = await res.json();
      if (j && j.image) return j.image;
    }
  } catch (e) {
    // ignore
  }

  return null;
}
