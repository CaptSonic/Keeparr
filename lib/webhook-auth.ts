import { safeEqual } from './session';
import { getArchivePlaceholderConfig } from './settings';

export function archiveWebhookAuthorized(request: Request): boolean {
  const expected = getArchivePlaceholderConfig().webhookSecret;
  if (!expected) return false;
  const url = new URL(request.url);
  const provided = url.searchParams.get('token') ??
    request.headers.get('x-keeparr-webhook-secret') ?? '';
  return safeEqual(expected, provided);
}

/** Read a request body while enforcing the limit even without Content-Length. */
export async function readBodyWithinLimit(
  request: Request,
  bytes = 10 * 1024 * 1024
): Promise<ArrayBuffer | null> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (!Number.isFinite(declared) || declared < 0 || declared > bytes) return null;
  }
  if (!request.body) return new ArrayBuffer(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > bytes) {
      await reader.cancel('payload_too_large').catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}