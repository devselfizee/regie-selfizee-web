import { proxyMedia } from '@/studio/lib/media-proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /editor-api/font-proxy?url=… → relaie une police Selfizee avec CORS. */
export async function GET(req: Request) {
  return proxyMedia(req);
}
