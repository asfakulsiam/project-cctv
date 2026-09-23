/**
 * src/utils/sourceResolver.ts - Frontend Stream Resolver Utility
 * Converts cloud share URLs (Google Drive, Dropbox, OneDrive, Box) and stream credential strings into HTML5 video player compatible URLs.
 */
import { convertToPlayableUrl, parseCloudVideoLink } from './cloudVideoHandler.js';

export { parseCloudVideoLink, convertToPlayableUrl };

export function resolveSourceUrl(sourceUrl: string, username?: string, password?: string): string {
  if (!sourceUrl) return '';
  let url = sourceUrl.trim();

  // If already resolved to cloud stream proxy, return as is
  if (url.startsWith('/api/cloud-stream') || url.startsWith('api/cloud-stream')) {
    return url.startsWith('/') ? url : `/${url}`;
  }

  // Handle embedded username / password for RTSP or HTTP streams if specified separately
  if (username && password) {
    if (url.startsWith('rtsp://') && !url.includes('@')) {
      url = url.replace('rtsp://', `rtsp://${encodeURIComponent(username)}:${encodeURIComponent(password)}@`);
    } else if (url.startsWith('http://') && !url.includes('@')) {
      url = url.replace('http://', `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@`);
    } else if (url.startsWith('https://') && !url.includes('@')) {
      url = url.replace('https://', `https://${encodeURIComponent(username)}:${encodeURIComponent(password)}@`);
    }
  }

  // Check and convert through universal cloud video handler
  const cloudInfo = parseCloudVideoLink(url);
  if (cloudInfo.isCloud && cloudInfo.playableUrl) {
    return cloudInfo.playableUrl;
  }

  return url;
}
