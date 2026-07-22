// Live Wikipedia lookup. generator=search + pageimages + description gives
// titles, short descriptions, and thumbnails in a single CORS-friendly call.
export async function searchWikipedia(query) {
  const url = new URL('https://en.wikipedia.org/w/api.php')
  url.search = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: '6',
    prop: 'pageimages|description',
    piprop: 'thumbnail',
    pithumbsize: '400',
    pilicense: 'any', // include non-free lead images (posters, character art)
    format: 'json',
    origin: '*',
  })
  const response = await fetch(url)
  if (!response.ok) throw new Error('Wikipedia search failed — try again')
  const data = await response.json()
  const pages = Object.values(data.query?.pages ?? {})
  return pages
    .sort((a, b) => a.index - b.index)
    .map((page) => ({
      title: page.title,
      description: page.description ?? '',
      thumbnailUrl: page.thumbnail?.source ?? null,
    }))
}
