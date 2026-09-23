/**
 * server/cloudStream.ts - Backend Cloud Video Streaming Proxy & Resolver
 * 
 * Streams cloud videos (Google Drive, Dropbox, OneDrive, etc.) to the browser player
 * with full HTTP Range (206 Partial Content) support, seamless seeking, and CORS compliance.
 * 
 * Specifically solves Google Drive's virus scan warning interceptor for large video files (>100MB)
 * by automating session confirm/uuid resolution.
 */
import { Request, Response } from 'express';
import { Readable } from 'stream';
import { extractGoogleDriveFileId, parseCloudVideoLink } from '../src/utils/cloudVideoHandler.js';

interface CachedStream {
  directUrl: string;
  expiresAt: number;
}

const directUrlCache = new Map<string, CachedStream>();
const CACHE_TTL_MS = 25 * 60 * 1000; // 25 minutes (Google session tokens typically last ~1-2 hours)

/**
 * Resolves a Google Drive File ID into an authentic direct media streaming URL.
 * Automatically handles Google Drive's "Virus scan warning" page for files > 100MB.
 */
export async function resolveGoogleDriveDirectUrl(fileId: string, forceFresh = false): Promise<string> {
  const cleanId = fileId.trim();

  if (!forceFresh) {
    const cached = directUrlCache.get(cleanId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.directUrl;
    }
  }

  const initialUrl = `https://drive.google.com/uc?export=download&id=${cleanId}`;
  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  try {
    const res1 = await fetch(initialUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,video/*,*/*;q=0.8',
      },
    });

    const contentType = res1.headers.get('content-type') || '';

    // If Google returned a direct media stream directly (small file < 100MB)
    if (contentType.startsWith('video/') || contentType.startsWith('application/octet-stream') || contentType.startsWith('application/binary')) {
      const finalUrl = res1.url || initialUrl;
      directUrlCache.set(cleanId, { directUrl: finalUrl, expiresAt: Date.now() + CACHE_TTL_MS });
      return finalUrl;
    }

    // Otherwise, parse the HTML virus warning confirmation form for large files (> 100MB)
    const text = await res1.text();
    const formMatch = text.match(/<form[^>]+id="download-form"[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/i);

    if (formMatch) {
      const formAction = formMatch[1];
      const inputs = [...formMatch[2].matchAll(/<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"/gi)];
      const params = new URLSearchParams();

      for (const [, name, val] of inputs) {
        params.set(name, val);
      }

      // Ensure required parameters
      if (!params.has('id')) params.set('id', cleanId);
      if (!params.has('export')) params.set('export', 'download');
      if (!params.has('confirm')) params.set('confirm', 't');

      const resolvedUrl = `${formAction}?${params.toString()}`;
      directUrlCache.set(cleanId, { directUrl: resolvedUrl, expiresAt: Date.now() + CACHE_TTL_MS });
      return resolvedUrl;
    }

    // Fallback direct endpoint
    const fallbackUrl = `https://drive.usercontent.google.com/download?id=${cleanId}&export=download&confirm=t`;
    directUrlCache.set(cleanId, { directUrl: fallbackUrl, expiresAt: Date.now() + CACHE_TTL_MS });
    return fallbackUrl;
  } catch (err: any) {
    console.error(`[CloudStream] Failed to resolve Google Drive file ${cleanId}:`, err?.message || err);
    // Return standard direct URL as last-resort fallback
    return `https://drive.google.com/uc?export=download&id=${cleanId}&confirm=t`;
  }
}

/**
 * Universal Stream Controller for Express.
 * Proxies media streams with full Range and CORS header support.
 */
export async function handleCloudStream(req: Request, res: Response): Promise<void> {
  const fileIdParam = (req.query.fileId as string) || '';
  const urlParam = (req.query.url as string) || '';

  let targetUrl = '';

  try {
    if (fileIdParam) {
      targetUrl = await resolveGoogleDriveDirectUrl(fileIdParam);
    } else if (urlParam) {
      const gdriveId = extractGoogleDriveFileId(urlParam);
      if (gdriveId) {
        targetUrl = await resolveGoogleDriveDirectUrl(gdriveId);
      } else {
        const parsed = parseCloudVideoLink(urlParam);
        if (parsed.directDownloadUrl) {
          targetUrl = parsed.directDownloadUrl;
        } else {
          targetUrl = urlParam;
        }
      }
    } else {
      res.status(400).json({ error: 'fileId or url query parameter is required' });
      return;
    }

    if (!targetUrl) {
      res.status(400).json({ error: 'Unable to resolve playable stream URL' });
      return;
    }

    const abortController = new AbortController();
    req.on('close', () => {
      abortController.abort();
    });

    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: '*/*',
    };

    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    let upstreamRes = await fetch(targetUrl, {
      headers,
      signal: abortController.signal,
      redirect: 'follow',
    });

    // If upstream returns 403 or 404 and we had a fileId, invalidate cache and retry once
    const effectiveFileId = fileIdParam || extractGoogleDriveFileId(urlParam);
    if ((upstreamRes.status === 403 || upstreamRes.status === 404) && effectiveFileId) {
      console.warn(`[CloudStream] Upstream token expired for ${effectiveFileId}, re-resolving...`);
      targetUrl = await resolveGoogleDriveDirectUrl(effectiveFileId, true);
      upstreamRes = await fetch(targetUrl, {
        headers,
        signal: abortController.signal,
        redirect: 'follow',
      });
    }

    // Set CORS and byte-range streaming headers
    res.status(upstreamRes.status);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Accept, Origin, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Accept-Ranges', 'bytes');

    const upstreamContentType = upstreamRes.headers.get('content-type');
    if (upstreamContentType && !upstreamContentType.includes('text/html')) {
      res.setHeader('Content-Type', upstreamContentType);
    } else {
      res.setHeader('Content-Type', 'video/mp4');
    }

    const contentRange = upstreamRes.headers.get('content-range');
    if (contentRange) {
      res.setHeader('Content-Range', contentRange);
    }

    const contentLength = upstreamRes.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    if (!upstreamRes.body) {
      res.end();
      return;
    }

    const nodeStream = Readable.fromWeb(upstreamRes.body as any);
    nodeStream.on('error', (err) => {
      // Client disconnects are normal during video seeking
      if (!res.headersSent) {
        res.status(500).end();
      }
    });

    nodeStream.pipe(res);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return;
    }
    console.error('[CloudStream] Streaming error:', err?.message || err);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Failed to stream cloud video: ' + (err?.message || 'Upstream connection error') });
    }
  }
}
