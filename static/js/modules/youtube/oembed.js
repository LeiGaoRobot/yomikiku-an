// YouTube oEmbed lookup — title / author / thumbnail. No API key required.
// Public endpoint returns 404 for private/deleted videos AND for videos the
// uploader disabled embedding for; we surface that uniformly as
// NOT_EMBEDDABLE so the UI can show the same toast.

const ENDPOINT = 'https://www.youtube.com/oembed';

export async function fetchVideoMeta(videoId) {
  if (!videoId || typeof videoId !== 'string') throw new Error('BAD_ID');
  const url = `${ENDPOINT}?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}&format=json`;
  let res;
  try { res = await fetch(url); }
  catch (_) { throw new Error('NETWORK'); }
  if (res.status === 404) throw new Error('NOT_EMBEDDABLE');
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  const data = await res.json();
  return {
    title: data.title || '',
    author: data.author_name || '',
    thumbnail: data.thumbnail_url || '',
  };
}
