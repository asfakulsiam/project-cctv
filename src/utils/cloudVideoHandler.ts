/**
 * src/utils/cloudVideoHandler.ts - Universal Cloud Video Link Handler & Stream Resolver
 * 
 * Automatically detects, parses, and converts all types of cloud video share URLs:
 * - Google Drive (view, preview, open?id=, uc?id=, docs.google.com)
 * - Dropbox (dl=0 -> raw=1 direct streaming)
 * - Microsoft OneDrive / SharePoint
 * - Box (app.box.com)
 * - GitHub (blob -> raw.githubusercontent.com)
 * - Generic Cloud Storage (AWS S3, Wasabi, Cloudinary, Supabase, Firebase)
 * 
 * Converts non-playable webpage preview links into high-performance, range-compatible
 * video streams playable in HTML5 <video> elements and readable by Computer Vision.
 */

export type CloudProvider =
  | 'google_drive'
  | 'dropbox'
  | 'onedrive'
  | 'box'
  | 'github'
  | 'direct'
  | 'unknown';

export interface CloudVideoInfo {
  isCloud: boolean;
  provider: CloudProvider;
  providerName: string;
  fileId?: string;
  originalUrl: string;
  playableUrl: string;
  directDownloadUrl?: string;
  details?: string;
}

/**
 * Extracts Google Drive File ID from any variant of Google Drive URL.
 * Handles:
 * - https://drive.google.com/file/d/1_rU3wGEHvWmfnSDHmKnLnbN9HfQHOkeA/view
 * - https://drive.google.com/file/d/1_rU3wGEHvWmfnSDHmKnLnbN9HfQHOkeA/view?usp=sharing
 * - https://drive.google.com/file/d/1_rU3wGEHvWmfnSDHmKnLnbN9HfQHOkeA/preview
 * - https://drive.google.com/open?id=1_rU3wGEHvWmfnSDHmKnLnbN9HfQHOkeA
 * - https://drive.google.com/uc?id=1_rU3wGEHvWmfnSDHmKnLnbN9HfQHOkeA
 * - https://docs.google.com/file/d/1_rU3wGEHvWmfnSDHmKnLnbN9HfQHOkeA/edit
 */
export function extractGoogleDriveFileId(rawUrl: string): string | null {
  if (!rawUrl) return null;
  const url = rawUrl.trim();

  // Pattern 1: /file/d/FILE_ID
  const matchFileD = url.match(/(?:drive|docs)\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (matchFileD && matchFileD[1]) {
    return matchFileD[1];
  }

  // Pattern 2: id=FILE_ID query parameter (open?id=..., uc?id=..., uc?export=download&id=...)
  const matchQueryId = url.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  if (url.includes('google.com') && matchQueryId && matchQueryId[1]) {
    return matchQueryId[1];
  }

  return null;
}

/**
 * Parses any video URL and inspects whether it is a cloud service link.
 * Generates the playable URL and metadata.
 */
export function parseCloudVideoLink(rawUrl: string): CloudVideoInfo {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return {
      isCloud: false,
      provider: 'unknown',
      providerName: 'Unknown',
      originalUrl: '',
      playableUrl: '',
    };
  }

  const url = rawUrl.trim();

  // 1. Google Drive
  const gdriveId = extractGoogleDriveFileId(url);
  if (gdriveId) {
    // We route through our high-performance backend stream proxy:
    // /api/cloud-stream?fileId=...
    // The proxy handles Google's virus-scan prompts for >100MB files, range headers, and CORS!
    const playableUrl = `/api/cloud-stream?fileId=${gdriveId}`;
    const directDownloadUrl = `https://drive.google.com/uc?export=download&id=${gdriveId}`;

    return {
      isCloud: true,
      provider: 'google_drive',
      providerName: 'Google Drive',
      fileId: gdriveId,
      originalUrl: url,
      playableUrl,
      directDownloadUrl,
      details: `Google Drive file (ID: ${gdriveId}). Converted to range-compatible video stream.`,
    };
  }

  // 2. Dropbox
  if (url.includes('dropbox.com')) {
    let converted = url;
    if (converted.includes('?dl=0') || converted.includes('&dl=0')) {
      converted = converted.replace(/([?&])dl=0/g, '$1raw=1');
    } else if (!converted.includes('raw=1') && !converted.includes('dl=1')) {
      converted += (converted.includes('?') ? '&' : '?') + 'raw=1';
    }

    return {
      isCloud: true,
      provider: 'dropbox',
      providerName: 'Dropbox',
      originalUrl: url,
      playableUrl: `/api/cloud-stream?url=${encodeURIComponent(converted)}`,
      directDownloadUrl: converted,
      details: 'Dropbox cloud link converted to direct media stream.',
    };
  }

  // 3. Microsoft OneDrive
  if (url.includes('1drv.ms') || url.includes('onedrive.live.com') || url.includes('sharepoint.com')) {
    return {
      isCloud: true,
      provider: 'onedrive',
      providerName: 'OneDrive',
      originalUrl: url,
      playableUrl: `/api/cloud-stream?url=${encodeURIComponent(url)}`,
      details: 'Microsoft OneDrive stream routed through proxy handler.',
    };
  }

  // 4. Box
  if (url.includes('box.com/s/')) {
    return {
      isCloud: true,
      provider: 'box',
      providerName: 'Box Cloud',
      originalUrl: url,
      playableUrl: `/api/cloud-stream?url=${encodeURIComponent(url)}`,
      details: 'Box cloud link converted for HTML5 streaming.',
    };
  }

  // 5. GitHub Video
  if (url.includes('github.com') && url.includes('/blob/')) {
    const rawGitHub = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
    return {
      isCloud: true,
      provider: 'github',
      providerName: 'GitHub Raw',
      originalUrl: url,
      playableUrl: rawGitHub,
      directDownloadUrl: rawGitHub,
      details: 'GitHub blob link converted to raw media URL.',
    };
  }

  // 6. Direct Video / RTSP / Local File
  return {
    isCloud: false,
    provider: 'direct',
    providerName: 'Direct Video / Stream',
    originalUrl: url,
    playableUrl: url,
  };
}

/**
 * Convenience helper to convert any source URL to its playable format.
 */
export function convertToPlayableUrl(sourceUrl: string): string {
  if (!sourceUrl) return '';
  const parsed = parseCloudVideoLink(sourceUrl);
  return parsed.playableUrl;
}
