import type { SupabaseClient } from '@supabase/supabase-js';

export async function persistThumbnail(
  supabase: SupabaseClient,
  sourceUrl: string,
  postUrl: string
): Promise<string> {
  if (!sourceUrl) return '';
  try {
    const res = await fetch(sourceUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://www.instagram.com/',
      },
    });
    if (!res.ok) return '';
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const buffer = Buffer.from(await res.arrayBuffer());
    const shortcode =
      postUrl.match(/\/(p|reel)\/([^/?]+)/)?.[2] || Math.random().toString(36).slice(2);
    const path = `${shortcode}.${ext}`;
    const { error } = await supabase.storage
      .from('competitor-thumbnails')
      .upload(path, buffer, { contentType, upsert: true });
    if (error) return '';
    const { data } = supabase.storage.from('competitor-thumbnails').getPublicUrl(path);
    return data.publicUrl;
  } catch {
    return '';
  }
}
