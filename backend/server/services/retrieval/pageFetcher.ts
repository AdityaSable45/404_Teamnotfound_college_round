import { logger } from '../../utils/logger.js';

export interface PageFetchOptions {
  timeoutMs?: number;
  maxSizeBytes?: number;
  maxRedirects?: number;
}

export type PageFetchErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_PROTOCOL'
  | 'SSRF_BLOCKED'
  | 'TIMEOUT'
  | 'OVERSIZED'
  | 'UNSUPPORTED_CONTENT_TYPE'
  | 'HTTP_ERROR'
  | 'FETCH_ERROR';

export interface FetchedPageResult {
  success: boolean;
  url: string;
  finalUrl?: string;
  html?: string;
  statusCode?: number;
  contentType?: string;
  error?: string;
  errorCode?: PageFetchErrorCode;
}

export class PageFetcher {
  private defaultTimeoutMs: number;
  private defaultMaxSizeBytes: number;
  private defaultMaxRedirects: number;

  constructor(options?: PageFetchOptions) {
    this.defaultTimeoutMs =
      options?.timeoutMs ?? Number(process.env.PAGE_FETCH_TIMEOUT_MS || 10000);
    this.defaultMaxSizeBytes =
      options?.maxSizeBytes ?? Number(process.env.MAX_PAGE_SIZE_BYTES || 5000000);
    this.defaultMaxRedirects = options?.maxRedirects ?? 5;
  }

  /**
   * Safely fetches webpage content with SSRF protection, redirect verification,
   * size limiting, content-type checking, and configurable timeouts.
   */
  async fetchPage(url: string, options?: PageFetchOptions): Promise<FetchedPageResult> {
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const maxSizeBytes = options?.maxSizeBytes ?? this.defaultMaxSizeBytes;
    const maxRedirects = options?.maxRedirects ?? this.defaultMaxRedirects;

    let currentUrl = url;
    let redirectCount = 0;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      while (redirectCount <= maxRedirects) {
        // 1. Validate URL & SSRF
        const validation = this.validateUrl(currentUrl);
        if (!validation.valid) {
          return {
            success: false,
            url,
            finalUrl: currentUrl,
            error: validation.error,
            errorCode: validation.errorCode,
          };
        }

        // 2. Perform single-step fetch with manual redirect inspection
        const res = await fetch(currentUrl, {
          signal: controller.signal,
          redirect: 'manual',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 (SecondOpinion Fact-Audit)',
            Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
          },
        });

        // 3. Handle redirects safely
        if ([301, 302, 303, 307, 308].includes(res.status)) {
          const location = res.headers.get('location');
          if (!location) {
            return {
              success: false,
              url,
              finalUrl: currentUrl,
              error: `Redirect status ${res.status} missing Location header`,
              errorCode: 'HTTP_ERROR',
            };
          }

          redirectCount++;
          if (redirectCount > maxRedirects) {
            return {
              success: false,
              url,
              finalUrl: currentUrl,
              error: `Exceeded maximum redirects (${maxRedirects})`,
              errorCode: 'FETCH_ERROR',
            };
          }

          // Resolve relative or absolute redirect destination
          try {
            currentUrl = new URL(location, currentUrl).href;
          } catch {
            return {
              success: false,
              url,
              finalUrl: location,
              error: `Invalid redirect location URL: ${location}`,
              errorCode: 'INVALID_URL',
            };
          }
          continue;
        }

        // 4. Check HTTP status
        if (!res.ok) {
          return {
            success: false,
            url,
            finalUrl: currentUrl,
            statusCode: res.status,
            error: `HTTP ${res.status} ${res.statusText}`,
            errorCode: 'HTTP_ERROR',
          };
        }

        // 5. Validate Content-Type
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        const isHtmlOrText =
          contentType.includes('text/html') ||
          contentType.includes('application/xhtml+xml') ||
          contentType.includes('text/plain');

        if (!isHtmlOrText) {
          return {
            success: false,
            url,
            finalUrl: currentUrl,
            statusCode: res.status,
            contentType,
            error: `Unsupported content-type: ${contentType}`,
            errorCode: 'UNSUPPORTED_CONTENT_TYPE',
          };
        }

        // 6. Enforce maximum content size
        const contentLengthHeader = res.headers.get('content-length');
        if (contentLengthHeader) {
          const contentLength = parseInt(contentLengthHeader, 10);
          if (!isNaN(contentLength) && contentLength > maxSizeBytes) {
            return {
              success: false,
              url,
              finalUrl: currentUrl,
              statusCode: res.status,
              error: `Page size (${contentLength} bytes) exceeds maximum allowed limit of ${maxSizeBytes} bytes`,
              errorCode: 'OVERSIZED',
            };
          }
        }

        // 7. Read body safely with byte limit guard
        const text = await res.text();
        if (text.length > maxSizeBytes) {
          return {
            success: false,
            url,
            finalUrl: currentUrl,
            statusCode: res.status,
            error: `Downloaded body size exceeds limit of ${maxSizeBytes} bytes`,
            errorCode: 'OVERSIZED',
          };
        }

        return {
          success: true,
          url,
          finalUrl: currentUrl,
          statusCode: res.status,
          contentType,
          html: text,
        };
      }

      return {
        success: false,
        url,
        finalUrl: currentUrl,
        error: `Exceeded maximum redirects (${maxRedirects})`,
        errorCode: 'FETCH_ERROR',
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return {
          success: false,
          url,
          finalUrl: currentUrl,
          error: `Page fetch timed out after ${timeoutMs}ms`,
          errorCode: 'TIMEOUT',
        };
      }
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        url,
        finalUrl: currentUrl,
        error: msg,
        errorCode: 'FETCH_ERROR',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * SSRF and protocol validator.
   */
  validateUrl(rawUrl: string): { valid: boolean; error?: string; errorCode?: PageFetchErrorCode } {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return { valid: false, error: 'Malformed or unparseable URL', errorCode: 'INVALID_URL' };
    }

    // Protocol check
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        valid: false,
        error: `Unsupported protocol: ${parsed.protocol}. Only http: and https: are permitted.`,
        errorCode: 'UNSUPPORTED_PROTOCOL',
      };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Loopback / localhost checks
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.lan') ||
      hostname === '0.0.0.0' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]'
    ) {
      return {
        valid: false,
        error: `Access to localhost or internal network is blocked for SSRF protection: ${hostname}`,
        errorCode: 'SSRF_BLOCKED',
      };
    }

    // IPv4 private ranges & cloud metadata
    // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const octet1 = parseInt(ipv4Match[1], 10);
      const octet2 = parseInt(ipv4Match[2], 10);

      const isLoopback = octet1 === 127;
      const isClassA = octet1 === 10;
      const isClassB = octet1 === 172 && octet2 >= 16 && octet2 <= 31;
      const isClassC = octet1 === 192 && octet2 === 168;
      const isLinkLocalOrMetadata = octet1 === 169 && octet2 === 254; // includes 169.254.169.254
      const isCurrentNetwork = octet1 === 0;

      if (isLoopback || isClassA || isClassB || isClassC || isLinkLocalOrMetadata || isCurrentNetwork) {
        return {
          valid: false,
          error: `Access to private or link-local IP address is blocked: ${hostname}`,
          errorCode: 'SSRF_BLOCKED',
        };
      }
    }

    // IPv6 private / link-local / metadata checks
    if (
      hostname.startsWith('[fc') ||
      hostname.startsWith('[fd') ||
      hostname.startsWith('[fe80') ||
      hostname === '[::]'
    ) {
      return {
        valid: false,
        error: `Access to IPv6 private address is blocked: ${hostname}`,
        errorCode: 'SSRF_BLOCKED',
      };
    }

    return { valid: true };
  }
}

export const pageFetcher = new PageFetcher();
