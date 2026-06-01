// Google Drive access with two modes:
//
//   1. API-KEY MODE (recommended, simplest) — set GOOGLE_DRIVE_API_KEY and share
//      your videos folder as "anyone with the link can view". No OAuth, no
//      consent screen. The key can only read PUBLIC files, nothing private.
//
//   2. OAUTH MODE (fallback) — if no API key is set, fall back to the Google
//      OAuth refresh token (GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN). Works on
//      private folders. This is what powers Calendar + Gmail too.
//
// Every Drive helper below picks the mode automatically.

import { getGoogleAccessToken } from './google-auth';

const DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY?.trim();

export function driveMode(): 'key' | 'oauth' {
  return DRIVE_API_KEY ? 'key' : 'oauth';
}

// Resolve how to authenticate a Drive request. Returns null when no credential
// is configured at all (so callers can bail gracefully).
async function driveAuth(): Promise<{ keyParam: string; headers: Record<string, string> } | null> {
  if (DRIVE_API_KEY) {
    return { keyParam: `key=${encodeURIComponent(DRIVE_API_KEY)}`, headers: {} };
  }
  const token = await getGoogleAccessToken();
  if (!token) return null;
  return { keyParam: '', headers: { Authorization: `Bearer ${token}` } };
}

// Low-level GET against a Drive API URL. `params` are merged into the query
// string; the key (if in key mode) is appended automatically.
export async function driveFetch(
  baseUrl: string,
  params: Record<string, string> = {},
  init: RequestInit = {},
): Promise<Response | null> {
  const auth = await driveAuth();
  if (!auth) return null;

  const qs = new URLSearchParams(params);
  if (auth.keyParam) {
    const [k, v] = auth.keyParam.split('=');
    qs.set(k, decodeURIComponent(v));
  }
  const sep = baseUrl.includes('?') ? '&' : '?';
  const url = `${baseUrl}${sep}${qs.toString()}`;

  return fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...auth.headers },
  });
}

// Confirm a folder is reachable with the current credentials.
export async function verifyFolder(folderId: string): Promise<boolean> {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
    fields: 'id',
    supportsAllDrives: 'true',
  });
  return !!res && res.ok;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  thumbnailLink?: string;
  createdTime?: string;
}

// List video/image files in a folder, newest first. `cutoffDate` (ISO) is
// optional — only files created on/after it are returned.
export async function listFolderMedia(folderId: string, cutoffDate?: string): Promise<DriveFile[]> {
  const cutoffClause = cutoffDate ? ` and createdTime > '${cutoffDate}'` : '';
  const query = `'${folderId}' in parents and trashed=false and (mimeType contains 'video/' or mimeType contains 'image/')${cutoffClause}`;
  const res = await driveFetch('https://www.googleapis.com/drive/v3/files', {
    q: query,
    fields: 'files(id,name,mimeType,webViewLink,thumbnailLink,createdTime)',
    orderBy: 'createdTime desc',
    pageSize: '50',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  if (!res || !res.ok) return [];
  return (await res.json()).files || [];
}

// Download a file's raw bytes.
export async function downloadFile(fileId: string): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    alt: 'media',
    supportsAllDrives: 'true',
  });
  if (!res || !res.ok) return null;
  return { buffer: await res.arrayBuffer(), mimeType: res.headers.get('content-type') || 'video/mp4' };
}

// Fetch file metadata (pass the Drive `fields` selector you want).
export async function getFileMeta(fileId: string, fields: string): Promise<Record<string, unknown> | null> {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    fields,
    supportsAllDrives: 'true',
  });
  if (!res || !res.ok) return null;
  return res.json();
}
