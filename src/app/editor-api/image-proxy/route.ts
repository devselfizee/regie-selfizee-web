import { proxyMedia } from '@/studio/lib/media-proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /editor-api/image-proxy?url=… → relaie une image Selfizee avec CORS. */
export async function GET(req: Request) {
  return proxyMedia(req);
}
