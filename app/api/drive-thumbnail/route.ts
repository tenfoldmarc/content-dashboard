import { NextResponse } from 'next/server';
import { getGoogleAccessToken } from '@/lib/google-auth';

export const dynamic = 'force-dynamic';

// Stable thumbnail proxy for Google Drive videos. Drive `thumbnailLink` URLs are
// short-lived and expire (why schedule thumbnails kept disappearing). This route
// fetches a FRESH thumbnailLink by file ID on every request, then streams the
// image — so the thumbnail is always valid at fetch time. The browser caches the
// proxied bytes for a day.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get('fileId');
  if (!fileId) return new NextResponse('Missing fileId', { status: 400 });

  try {
    const token = await getGoogleAccessToken();
    if (!token) return new NextResponse('No Google access', { status: 502 });

    // 1) Fresh thumbnailLink from Drive metadata
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink,hasThumbnail,mimeType&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
    );
    if (!metaRes.ok) return new NextResponse('Drive metadata failed', { status: metaRes.status });
    const meta = await metaRes.json();
    let link: string | undefined = meta.thumbnailLink;
    if (!link) return new NextResponse('No thumbnail', { status: 404 });

    // Bump the size param Drive appends (e.g. =s220 -> =s400) for a sharper image.
    link = link.replace(/=s\d+$/, '=s400');

    // 2) Fetch the image (with the OAuth token so private files resolve).
    let imgRes = await fetch(link, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!imgRes.ok) {
      // Some thumbnailLinks reject the auth header — retry without it.
      imgRes = await fetch(link, { cache: 'no-store' });
    }
    if (!imgRes.ok) return new NextResponse('Thumbnail fetch failed', { status: imgRes.status });

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const buffer = await imgRes.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=43200, s-maxage=43200',
      },
    });
  } catch {
    return new NextResponse('Proxy error', { status: 500 });
  }
}
