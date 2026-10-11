import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { EvidenceSource } from '../contracts.js';
import { logger } from '../../utils/logger.js';

function loadEnvironment(): void {
  if (!process.env.TAVILY_API_KEY) {
    dotenv.config();
    if (!process.env.TAVILY_API_KEY) {
      const parentEnv = path.resolve(process.cwd(), '../.env');
      if (fs.existsSync(parentEnv)) {
        dotenv.config({ path: parentEnv });
      }
    }
  }
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publisher?: string;
}

export interface SearchProvider {
  readonly name: string;
  search(query: string, timeoutMs?: number): Promise<SearchResult[]>;
}

export class TavilyProvider implements SearchProvider {
  readonly name = 'tavily';
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  private getApiKey(): string | undefined {
    loadEnvironment();
    return this.apiKey || process.env.TAVILY_API_KEY;
  }

  async search(query: string, timeoutMs = 8000): Promise<SearchResult[]> {
    const key = this.getApiKey();
    if (!key) {
      logger.warn('TavilyProvider: TAVILY_API_KEY is not configured');
      return [];
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          api_key: key,
          query,
          search_depth: 'advanced',
          max_results: 8,
          include_answer: false,
          include_raw_content: false,
        }),
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          logger.warn(`Tavily authentication failed (HTTP ${res.status}): invalid or unauthorized API key`);
        } else if (res.status === 429) {
          logger.warn('Tavily rate limit exceeded (HTTP 429)');
        } else {
          logger.warn(`Tavily search service returned HTTP ${res.status}`);
        }
        return [];
      }

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        logger.warn('Tavily search returned malformed JSON response');
        return [];
      }

      if (!data || typeof data !== 'object' || !Array.isArray((data as { results?: unknown[] }).results)) {
        logger.warn('Tavily search response missing results array');
        return [];
      }

      const results: SearchResult[] = [];
      const items = (data as { results: Array<{ title?: string; url?: string; content?: string }> }).results;

      for (const item of items) {
        if (!item.url || !/^https?:\/\//i.test(item.url)) {
          continue;
        }

        let publisher = 'Web Source';
        try {
          publisher = new URL(item.url).hostname.replace(/^www\./, '');
        } catch {
          // ignore
        }

        const title = (item.title || 'Untitled Source').trim();
        const snippet = (item.content || '').trim();

        if (title && snippet) {
          results.push({
            title,
            publisher,
            url: item.url,
            snippet,
          });
        }
      }

      return results;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        logger.warn(`Tavily search timed out after ${timeoutMs}ms`);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        // Ensure no API key is leaked in log messages
        const sanitizedMsg = key ? msg.replace(new RegExp(key, 'g'), '[REDACTED]') : msg;
        logger.warn(`Tavily search error: ${sanitizedMsg}`);
      }
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export class DuckDuckGoProvider implements SearchProvider {
  readonly name = 'duckduckgo';

  async search(query: string, timeoutMs = 8000): Promise<SearchResult[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
      });

      if (!res.ok) {
        if (res.status === 403 || res.status === 429) {
          logger.warn(`DuckDuckGo rate limited or blocked (HTTP ${res.status})`);
        } else {
          logger.warn(`DuckDuckGo search returned HTTP ${res.status}`);
        }
        return [];
      }

      const html = await res.text();

      // Detect CAPTCHA or anomaly challenges
      if (
        html.includes('anomaly-detected') ||
        html.includes('challenge-form') ||
        html.includes('Please complete the security check') ||
        html.includes('robot')
      ) {
        logger.warn('DuckDuckGo challenge / CAPTCHA detected; ignoring invalid HTML response');
        return [];
      }

      const results: SearchResult[] = [];
      const linkMatches = Array.from(
        html.matchAll(/<a[^>]*class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)
      );
      const snippetMatches = Array.from(
        html.matchAll(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)
      );

      for (let i = 0; i < Math.min(linkMatches.length, snippetMatches.length, 6); i++) {
        let rawUrl = linkMatches[i][1];
        const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
        const resolvedUrl = uddgMatch ? decodeURIComponent(uddgMatch[1]) : rawUrl;

        // Ensure valid HTTP/HTTPS scheme
        if (!/^https?:\/\//i.test(resolvedUrl)) {
          continue;
        }

        let publisher = 'Web Source';
        try {
          publisher = new URL(resolvedUrl).hostname.replace(/^www\./, '');
        } catch {
          // ignore
        }

        const title = linkMatches[i][2].replace(/<[^>]+>/g, '').trim();
        const snippet = snippetMatches[i][1]
          .replace(/<[^>]+>/g, '')
          .replace(/&#x27;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .trim();

        if (title && snippet) {
          results.push({
            title,
            publisher,
            url: resolvedUrl,
            snippet,
          });
        }
      }

      return results;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        logger.warn(`DuckDuckGo search timed out after ${timeoutMs}ms`);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`DuckDuckGo search error: ${msg}`);
      }
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export class WikipediaProvider implements SearchProvider {
  readonly name = 'wikipedia';

  async search(query: string, timeoutMs = 8000): Promise<SearchResult[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        query
      )}&utf8=&format=json&srlimit=4`;

      const res = await fetch(searchUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'SecondOpinion/1.0 (ai-auditing-tool)' },
      });

      if (!res.ok) {
        logger.warn(`Wikipedia search returned HTTP ${res.status}`);
        return [];
      }

      const data = await res.json();
      if (!data || !data.query || !Array.isArray(data.query.search)) {
        return [];
      }

      const results: SearchResult[] = [];
      for (const item of data.query.search) {
        const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(
          item.title.replace(/ /g, '_')
        )}`;
        const cleanSnippet = item.snippet
          .replace(/<[^>]+>/g, '')
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'")
          .replace(/&amp;/g, '&')
          .trim();

        if (item.title && cleanSnippet) {
          results.push({
            title: item.title,
            publisher: 'Wikipedia',
            url: pageUrl,
            snippet: cleanSnippet,
          });
        }
      }

      return results;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        logger.warn(`Wikipedia search timed out after ${timeoutMs}ms`);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`Wikipedia search error: ${msg}`);
      }
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export class LiveSearchEngine {
  private providers: SearchProvider[];
  private timeoutMs: number;
  private isCustom: boolean;

  constructor(providers?: SearchProvider[], timeoutMs?: number) {
    loadEnvironment();
    this.timeoutMs = timeoutMs ?? Number(process.env.SEARCH_TIMEOUT_MS || 8000);

    if (providers && providers.length > 0) {
      this.providers = providers;
      this.isCustom = true;
    } else {
      this.isCustom = false;
      if (process.env.TAVILY_API_KEY) {
        this.providers = [
          new TavilyProvider(),
          new WikipediaProvider(),
          new DuckDuckGoProvider(),
        ];
      } else {
        this.providers = [
          new DuckDuckGoProvider(),
          new WikipediaProvider(),
        ];
      }
    }
  }

  getProviders(): SearchProvider[] {
    return this.providers;
  }

  registerProvider(provider: SearchProvider): void {
    this.providers.push(provider);
  }

  async searchEvidence(claimText: string): Promise<EvidenceSource[]> {
    loadEnvironment();
    logger.info(`Searching live web evidence for: "${claimText.slice(0, 60)}..."`);

    const timeout = Number(process.env.SEARCH_TIMEOUT_MS || this.timeoutMs);

    // Dynamically use Tavily if TAVILY_API_KEY is configured in runtime environment and not overridden
    const activeProviders = this.isCustom
      ? this.providers
      : (process.env.TAVILY_API_KEY
          ? (this.providers.some((p) => p.name === 'tavily')
              ? this.providers
              : [new TavilyProvider(), new WikipediaProvider(), new DuckDuckGoProvider()])
          : (this.providers.some((p) => p.name === 'tavily')
              ? [new DuckDuckGoProvider(), new WikipediaProvider()]
              : this.providers));

    // Query all registered providers in parallel with individual timeouts
    const searchPromises = activeProviders.map((p) => p.search(claimText, timeout));
    const settlements = await Promise.allSettled(searchPromises);

    const rawResults: SearchResult[] = [];
    for (const res of settlements) {
      if (res.status === 'fulfilled') {
        rawResults.push(...res.value);
      }
    }

    // Deduplicate by normalized URL
    const seenUrls = new Set<string>();
    const uniqueSources: EvidenceSource[] = [];

    for (const r of rawResults) {
      const normalizedKey = r.url ? r.url.toLowerCase().trim() : r.title.toLowerCase().trim();
      if (!seenUrls.has(normalizedKey)) {
        seenUrls.add(normalizedKey);
        uniqueSources.push({
          title: r.title,
          publisher: r.publisher || 'Web Source',
          url: r.url,
          snippet: r.snippet,
        });
      }
    }

    logger.info(`Retrieved ${uniqueSources.length} unique live evidence sources`);
    return uniqueSources.slice(0, 8);
  }
}

export const liveSearchEngine = new LiveSearchEngine();
