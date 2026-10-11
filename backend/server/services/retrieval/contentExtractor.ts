import * as cheerio from 'cheerio';
import { logger } from '../../utils/logger.js';

export interface ExtractedDocument {
  title: string;
  author?: string;
  publishedAt?: string;
  canonicalUrl: string;
  text: string;
}

export class ContentExtractor {
  /**
   * Extracts clean article content, structural text, and metadata from raw HTML.
   */
  extractContent(rawHtml: string, sourceUrl: string): ExtractedDocument {
    try {
      const $ = cheerio.load(rawHtml);

      // 1. Extract metadata before removing elements
      const canonicalUrl =
        $('link[rel="canonical"]').attr('href') ||
        $('meta[property="og:url"]').attr('content') ||
        sourceUrl;

      const title =
        $('meta[property="og:title"]').attr('content') ||
        $('meta[name="twitter:title"]').attr('content') ||
        $('title').text().trim() ||
        $('h1').first().text().trim() ||
        'Untitled Document';

      const author =
        $('meta[name="author"]').attr('content') ||
        $('meta[property="article:author"]').attr('content') ||
        $('meta[name="twitter:creator"]').attr('content') ||
        $('[rel="author"]').first().text().trim() ||
        $('.author, .byline').first().text().trim() ||
        undefined;

      const publishedAt =
        $('meta[property="article:published_time"]').attr('content') ||
        $('meta[name="publication_date"]').attr('content') ||
        $('meta[name="date"]').attr('content') ||
        $('time[datetime]').first().attr('datetime') ||
        $('time').first().text().trim() ||
        undefined;

      // 2. Remove boilerplate, interactive, and non-content elements
      const elementsToRemove = [
        'script',
        'style',
        'noscript',
        'iframe',
        'svg',
        'canvas',
        'form',
        'input',
        'button',
        'nav',
        'header',
        'footer',
        'aside',
        '.nav',
        '.navbar',
        '.header',
        '.footer',
        '.menu',
        '#menu',
        '.sidebar',
        '#sidebar',
        '.cookie',
        '.consent',
        '#cookie-banner',
        '.cookie-banner',
        '.advertisement',
        '.ads',
        '.ad',
        'ins.adsbygoogle',
        '.social',
        '.share',
        '.social-share',
        '.comments',
        '#comments',
        '.related-articles',
      ];

      $(elementsToRemove.join(', ')).remove();

      // 3. Find primary content container (article / main / or body)
      let $contentRoot = $('article, main, [role="main"], .article-body, .post-content, #content').first();
      if ($contentRoot.length === 0) {
        $contentRoot = $('body');
      }

      // 4. Extract meaningful textual paragraphs, headings, and lists
      const textBlocks: string[] = [];

      $contentRoot.find('h1, h2, h3, h4, h5, h6, p, li, blockquote').each((_, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim();
        // Skip tiny fragments or typical UI debris
        if (text.length > 20) {
          textBlocks.push(text);
        }
      });

      // Fallback: If structured blocks are few, get direct clean text from content root
      let combinedText = textBlocks.join('\n\n');
      if (combinedText.length < 100) {
        combinedText = $contentRoot
          .text()
          .replace(/\s+/g, ' ')
          .replace(/(?<=[.?!])\s+/g, '\n\n')
          .trim();
      }

      return {
        title: title.replace(/\s+/g, ' ').trim(),
        author: author ? author.replace(/\s+/g, ' ').trim() : undefined,
        publishedAt,
        canonicalUrl,
        text: combinedText,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`ContentExtractor error on ${sourceUrl}: ${msg}`);
      return {
        title: 'Document',
        canonicalUrl: sourceUrl,
        text: '',
      };
    }
  }
}

export const contentExtractor = new ContentExtractor();
