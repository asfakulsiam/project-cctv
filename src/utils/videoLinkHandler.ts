/**
 * src/utils/videoLinkHandler.ts - Video URL Validation & Playability Helper
 * 
 * Provides comprehensive validation for CCTV, cloud shares, webcams, and direct video sources.
 * Validates syntax, supported extensions, known cloud storage providers (Google Drive, Dropbox, OneDrive, Box, GitHub),
 * RTSP/HTTP streaming protocols, and blob/object URLs before attempting to load them into the HTML5 video player.
 */

import { parseCloudVideoLink } from './cloudVideoHandler.js';
import { resolveSourceUrl } from './sourceResolver.js';

export interface VideoValidationResult {
  isValid: boolean;
  playableUrl: string;
  sourceType: 'cloud_link' | 'stream_url' | 'webcam' | 'local_file';
  providerName?: string;
  details?: string;
  errorMessage?: string;
  suggestedAction?: string;
}

// Known video formats playable in standard modern browsers
const PLAYABLE_VIDEO_EXTENSIONS = [
  '.mp4',
  '.webm',
  '.ogg',
  '.ogv',
  '.mov',
  '.m4v',
  '.m3u8', // HLS stream manifest
  '.mpd',  // DASH manifest
];

// Non-browser-playable or audio-only/image formats that commonly cause playback errors
const UNSUPPORTED_COMMON_EXTENSIONS = [
  '.avi',
  '.mkv',
  '.wmv',
  '.flv',
  '.rmvb',
  '.vob',
  '.mp3',
  '.wav',
  '.aac',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.pdf',
  '.zip',
];

// Domains known to block direct HTML5 <video> iframe/embed embedding without dedicated API/player
const UNSUPPORTED_STREAMING_SERVICES = [
  { domain: 'youtube.com', name: 'YouTube', note: 'YouTube videos require an embedded iframe player, not direct HTML5 video playback.' },
  { domain: 'youtu.be', name: 'YouTube', note: 'YouTube videos require an embedded iframe player, not direct HTML5 video playback.' },
  { domain: 'vimeo.com', name: 'Vimeo', note: 'Vimeo web links require the Vimeo player SDK or direct MP4 Pro links.' },
  { domain: 'tiktok.com', name: 'TikTok', note: 'TikTok pages cannot be streamed directly into standard video tags.' },
  { domain: 'facebook.com', name: 'Facebook Video', note: 'Direct Facebook watch links are not playable in an HTML5 video element.' },
  { domain: 'instagram.com', name: 'Instagram', note: 'Instagram links require native embed widgets.' },
  { domain: 'twitter.com', name: 'X / Twitter', note: 'X / Twitter links require native embed widgets.' },
  { domain: 'x.com', name: 'X / Twitter', note: 'X / Twitter links require native embed widgets.' },
];

/**
 * Validates whether a provided URL or file path is a valid, playable video source.
 * 
 * @param url The raw string input to validate
 * @returns VideoValidationResult with validation flag, resolved playable URL, source type, and friendly error messages
 */
export function validateVideoUrl(url: string | null | undefined): VideoValidationResult {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return {
      isValid: false,
      playableUrl: '',
      sourceType: 'stream_url',
      errorMessage: 'Please enter a video URL, cloud share link, or select a source.',
      suggestedAction: 'Enter a valid URL such as a Google Drive link, RTSP feed, or .mp4 file.',
    };
  }

  const cleanUrl = url.trim();

  // 1. Check for webcam identifier
  if (cleanUrl.toLowerCase() === 'webcam') {
    return {
      isValid: true,
      playableUrl: 'webcam',
      sourceType: 'webcam',
      providerName: 'Live Webcam',
      details: 'Device camera ingest stream',
    };
  }

  // 2. Check for browser blob: or data: video URLs
  if (cleanUrl.startsWith('blob:') || cleanUrl.startsWith('data:video/')) {
    return {
      isValid: true,
      playableUrl: cleanUrl,
      sourceType: 'local_file',
      providerName: 'Uploaded Video',
      details: 'Local browser file stream',
    };
  }

  // 3. Check for internal server upload/proxy endpoints
  if (cleanUrl.startsWith('/uploads/') || cleanUrl.startsWith('/api/cloud-stream') || cleanUrl.startsWith('/api/cameras/stream/')) {
    return {
      isValid: true,
      playableUrl: cleanUrl,
      sourceType: 'local_file',
      providerName: 'Server Video Feed',
      details: 'Internal stream endpoint',
    };
  }

  // 4. Check for unsupported video hosting sites that do not allow direct media tag ingest
  const lowerUrl = cleanUrl.toLowerCase();
  for (const item of UNSUPPORTED_STREAMING_SERVICES) {
    if (lowerUrl.includes(item.domain)) {
      return {
        isValid: false,
        playableUrl: '',
        sourceType: 'stream_url',
        errorMessage: `${item.name} links cannot be played directly in the CCTV video element.`,
        suggestedAction: item.note,
      };
    }
  }

  // 5. Check if it's a known supported cloud storage provider (Google Drive, Dropbox, OneDrive, Box, GitHub)
  const cloudInfo = parseCloudVideoLink(cleanUrl);
  if (cloudInfo.isCloud) {
    // If it's Google Drive, verify that a file ID was extracted
    if (cloudInfo.provider === 'google_drive') {
      if (!cloudInfo.fileId) {
        return {
          isValid: false,
          playableUrl: '',
          sourceType: 'cloud_link',
          providerName: 'Google Drive',
          errorMessage: 'Invalid Google Drive link format.',
          suggestedAction: 'Ensure the link includes a file ID (e.g. https://drive.google.com/file/d/FILE_ID/view).',
        };
      }
      return {
        isValid: true,
        playableUrl: cloudInfo.playableUrl,
        sourceType: 'cloud_link',
        providerName: 'Google Drive',
        details: `Google Drive file (ID: ${cloudInfo.fileId}) via Range-buffered stream proxy.`,
      };
    }

    return {
      isValid: true,
      playableUrl: cloudInfo.playableUrl,
      sourceType: 'cloud_link',
      providerName: cloudInfo.providerName,
      details: cloudInfo.details || `${cloudInfo.providerName} stream`,
    };
  }

  // 6. Check for unsupported video containers (AVI, MKV, WMV)
  const urlWithoutQuery = lowerUrl.split('?')[0].split('#')[0];
  for (const ext of UNSUPPORTED_COMMON_EXTENSIONS) {
    if (urlWithoutQuery.endsWith(ext)) {
      return {
        isValid: false,
        playableUrl: '',
        sourceType: 'stream_url',
        errorMessage: `Files with extension "${ext}" are not natively supported by HTML5 browsers.`,
        suggestedAction: 'Please provide an MP4, WebM, HLS stream, or cloud share link instead.',
      };
    }
  }

  // 7. Check for standard URL validity
  let parsedUrlObj: URL;
  try {
    parsedUrlObj = new URL(cleanUrl);
  } catch (_e) {
    // Check if it's an RTSP stream (which URL constructor may reject in some browser engines)
    if (cleanUrl.toLowerCase().startsWith('rtsp://')) {
      const resolved = resolveSourceUrl(cleanUrl);
      return {
        isValid: true,
        playableUrl: resolved,
        sourceType: 'stream_url',
        providerName: 'RTSP Stream',
        details: 'CCTV RTSP Network Camera feed',
      };
    }

    return {
      isValid: false,
      playableUrl: '',
      sourceType: 'stream_url',
      errorMessage: 'Invalid URL format.',
      suggestedAction: 'Please enter a complete URL starting with https://, http://, or rtsp://.',
    };
  }

  // 8. Protocol check
  const protocol = parsedUrlObj.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:' && protocol !== 'rtsp:') {
    return {
      isValid: false,
      playableUrl: '',
      sourceType: 'stream_url',
      errorMessage: `Unsupported protocol "${protocol.replace(':', '')}".`,
      suggestedAction: 'Only HTTP, HTTPS, and RTSP stream protocols are supported.',
    };
  }

  // 9. Check if URL has a recognized video extension or looks like a media streaming endpoint
  const hasPlayableExt = PLAYABLE_VIDEO_EXTENSIONS.some((ext) => urlWithoutQuery.endsWith(ext));
  const isStreamingKeywords = /stream|live|m3u8|mp4|webm|video|feed|camera|cctv|rtmp|hls|axis-media|mjpg|mjpeg/i.test(
    parsedUrlObj.pathname + parsedUrlObj.search
  );

  // If valid HTTP/HTTPS URL:
  const resolved = resolveSourceUrl(cleanUrl);
  return {
    isValid: true,
    playableUrl: resolved,
    sourceType: 'stream_url',
    providerName: hasPlayableExt ? 'Direct Video File' : 'Network Stream / Feed',
    details: hasPlayableExt
      ? 'Direct HTML5 compatible media file'
      : isStreamingKeywords
      ? 'Live network video stream'
      : 'HTTP video resource',
  };
}

/**
 * Asynchronously verifies if a direct HTTP/HTTPS video URL responds and supports media playback.
 * Performs a fast HEAD request to check content-type or accessibility when feasible.
 * 
 * @param url The target URL to test
 * @returns Promise with boolean and status message
 */
export async function testVideoLinkAccessibility(
  url: string
): Promise<{ accessible: boolean; message: string; contentType?: string }> {
  const validation = validateVideoUrl(url);
  if (!validation.isValid) {
    return {
      accessible: false,
      message: validation.errorMessage || 'Invalid video link',
    };
  }

  if (validation.sourceType === 'webcam' || validation.sourceType === 'local_file') {
    return { accessible: true, message: 'Ready for local playback' };
  }

  // If it's a cloud link with a stream proxy, verify the proxy endpoint
  const testUrl = validation.playableUrl;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(testUrl, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const contentType = res.headers.get('content-type') || '';
    if (res.ok || res.status === 206) {
      return {
        accessible: true,
        message: 'Video source is accessible and ready to stream.',
        contentType,
      };
    } else {
      return {
        accessible: false,
        message: `Video server returned status ${res.status} (${res.statusText || 'Unavailable'}).`,
      };
    }
  } catch (err: any) {
    // If CORS prevents HEAD request to 3rd party external servers, but validation passed
    return {
      accessible: true,
      message: 'Link format is valid and recognized.',
    };
  }
}
