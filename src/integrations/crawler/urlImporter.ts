import { repositories } from '../../database/repositories/dexieRepositories';
import { extractUrlDocumentContent } from './htmlExtractor';
import { checkRobotsTxt, isPathAllowedByRobotsTxt } from './robotsPolicy';
import { acquireCrawlerSlot, validatePublicHttpUrl } from './urlValidation';

export { isPathAllowedByRobotsTxt };

export const MAX_URL_IMPORT_BYTES = 512 * 1024; // 512 KB cap
export const URL_FETCH_TIMEOUT_MS = 10_000;

const ALLOWED_CONTENT_TYPES = [
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/html',
  'text/csv',
  'application/json',
  'application/xhtml+xml',
];

export interface UrlImportPreview {
  title: string;
  sourceUrl: string;
  finalUrl: string;
  contentType: string;
  sourceType: 'markdown' | 'text' | 'json' | 'url';
  sizeBytes: number;
  content: string;
  contentHash: string;
  duplicateOfTitle: string | null;
  retrievedAt: string;
  robotsChecked: boolean;
  robotsNote: string;
}

export async function fetchAndPreviewUrlForKnowledge(
  rawUrl: string,
  options: { fetchImpl?: typeof fetch; checkDuplicate?: boolean } = {}
): Promise<UrlImportPreview> {
  const check = validatePublicHttpUrl(rawUrl);
  if (!check.valid || !check.parsed || !check.normalizedUrl) {
    throw new Error(check.reason ?? 'Invalid URL.');
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch API is unavailable in this environment.');
  }

  const releaseSlot = acquireCrawlerSlot();
  try {
    const robots = await checkRobotsTxt(check.parsed, fetchImpl);
    if (!robots.allowed) {
      throw new Error(robots.note);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetchImpl(check.normalizedUrl, {
        method: 'GET',
        redirect: 'follow',
        credentials: 'omit',
        cache: 'no-store',
        headers: {
          Accept: ALLOWED_CONTENT_TYPES.join(', '),
        },
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('URL request timed out after 10 seconds.');
      }
      throw new Error(
        'Unable to fetch this URL from the browser. Many websites block cross-origin browser requests (CORS); download or copy the page as .md/.txt and import locally instead.'
      );
    } finally {
      clearTimeout(timer);
    }

    // Re-validate post-redirect destination against SSRF policy
    const finalUrl = response.url || check.normalizedUrl;
    const finalValidation = validatePublicHttpUrl(finalUrl);
    if (!finalValidation.valid) {
      throw new Error(`Redirect destination rejected: ${finalValidation.reason}`);
    }

    if (!response.ok) {
      throw new Error(`Target URL returned HTTP ${response.status}.`);
    }

    const rawType = (response.headers.get('content-type') || 'text/plain').toLowerCase();
    const mimeType = rawType.split(';')[0].trim();
    if (!ALLOWED_CONTENT_TYPES.some((t) => mimeType === t || mimeType.startsWith(`${t};`))) {
      throw new Error(
        `Unsupported content type "${mimeType}". Only plain text, Markdown, HTML, CSV, and JSON are allowed.`
      );
    }

    const declaredLen = Number(response.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLen) && declaredLen > MAX_URL_IMPORT_BYTES) {
      throw new Error(
        `Response exceeds the ${Math.round(MAX_URL_IMPORT_BYTES / 1024)} KB single-URL import limit.`
      );
    }

    const rawText = await response.text();
    const sizeBytes = new TextEncoder().encode(rawText).byteLength;
    if (sizeBytes > MAX_URL_IMPORT_BYTES) {
      throw new Error(
        `Fetched page exceeds the ${Math.round(MAX_URL_IMPORT_BYTES / 1024)} KB import limit.`
      );
    }

    const defaultTitle =
      check.parsed.hostname + (check.parsed.pathname !== '/' ? check.parsed.pathname : '');
    const extracted = await extractUrlDocumentContent({
      rawText,
      mimeType,
      defaultTitle,
    });

    let duplicateOfTitle: string | null = null;
    if (options.checkDuplicate !== false) {
      const dup = await repositories.findKnowledgeDocByHash(extracted.contentHash);
      if (dup) duplicateOfTitle = dup.title;
    }

    return {
      title: extracted.title,
      sourceUrl: check.normalizedUrl,
      finalUrl,
      contentType: mimeType,
      sourceType: extracted.sourceType,
      sizeBytes,
      content: extracted.content,
      contentHash: extracted.contentHash,
      duplicateOfTitle,
      retrievedAt: new Date().toISOString(),
      robotsChecked: robots.checked,
      robotsNote: robots.note,
    };
  } finally {
    releaseSlot();
  }
}
