import { EvidenceSource, FilteredSource, SourceTier } from '../contracts.js';
import { deduplicator } from './deduplication.js';
import { logger } from '../../utils/logger.js';

// Domain patterns for authoritative, academic, fact-checking, reference encyclopedia, and mainstream sources
const DEFAULT_OFFICIAL_PATTERNS = [
  /whitehouse\.gov$/i,
  /gov\.uk$/i,
  /india\.gov\.in$/i,
  /aph\.gov\.au$/i,
  /nasa\.gov$/i,
  /cdc\.gov$/i,
  /fda\.gov$/i,
];

const DEFAULT_GOVERNMENT_PATTERNS = [
  /\.gov(\.[a-z]{2})?$/i,
  /\.mil$/i,
  /who\.int$/i,
  /un\.org$/i,
  /unfpa\.org$/i,
  /worldbank\.org$/i,
  /imf\.org$/i,
  /oecd\.org$/i,
  /unesco\.org$/i,
];

const DEFAULT_RESEARCH_JOURNAL_PATTERNS = [
  /nature\.com$/i,
  /science\.org$/i,
  /cell\.com$/i,
  /thelancet\.com$/i,
  /nejm\.org$/i,
  /pnas\.org$/i,
  /plos\.org$/i,
  /bmj\.com$/i,
];

const DEFAULT_ACADEMIC_PATTERNS = [
  /\.edu(\.[a-z]{2})?$/i,
  /\.ac\.[a-z]{2}$/i,
  /nature\.com$/i,
  /science\.org$/i,
  /arxiv\.org$/i,
  /ncbi\.nlm\.nih\.gov$/i,
  /sciencedirect\.com$/i,
  /springer\.com$/i,
  /wiley\.com$/i,
  /jstor\.org$/i,
  /ieee\.org$/i,
];

const DEFAULT_REFERENCE_ENCYCLOPEDIA_PATTERNS = [
  /britannica\.com$/i,
  /wikipedia\.org$/i,
  /wikimedia\.org$/i,
  /stanford\.edu\/entries/i,
  /worldhistory\.org$/i,
  /encyclopedia\.com$/i,
  /dictionary\.com$/i,
  /merriam-webster\.com$/i,
];

const DEFAULT_FACT_CHECKER_PATTERNS = [
  /reuters\.com.*fact-check/i,
  /apnews\.com.*fact-check/i,
  /snopes\.com$/i,
  /politifact\.com$/i,
  /factcheck\.org$/i,
  /fullfact\.org$/i,
  /checkyourfact\.com$/i,
  /leadstories\.com$/i,
];

const DEFAULT_MAINSTREAM_PATTERNS = [
  /reuters\.com$/i,
  /apnews\.com$/i,
  /bbc\.(co\.uk|com)$/i,
  /nytimes\.com$/i,
  /wsj\.com$/i,
  /theguardian\.com$/i,
  /bloomberg\.com$/i,
  /washingtonpost\.com$/i,
  /ft\.com$/i,
  /economist\.com$/i,
  /time\.com$/i,
];

const DEFAULT_ORGANIZATION_PATTERNS = [
  /w3\.org$/i,
  /iso\.org$/i,
  /cern\.ch$/i,
  /redcross\.org$/i,
  /amnesty\.org$/i,
  /eff\.org$/i,
];

const DEFAULT_SOCIAL_MEDIA_PATTERNS = [
  /reddit\.com$/i,
  /facebook\.com$/i,
  /twitter\.com$/i,
  /x\.com$/i,
  /quora\.com$/i,
  /instagram\.com$/i,
  /tiktok\.com$/i,
  /pinterest\.com$/i,
  /zhihu\.com$/i,
];

export interface SourceClusterResult {
  sources: EvidenceSource[];
  independentGroupsCount: number;
  summary: string;
}

export class SourceFilter {
  private officialPatterns: RegExp[];
  private governmentPatterns: RegExp[];
  private academicPatterns: RegExp[];
  private researchJournalPatterns: RegExp[];
  private factCheckerPatterns: RegExp[];
  private encyclopediaPatterns: RegExp[];
  private mainstreamPatterns: RegExp[];
  private organizationPatterns: RegExp[];
  private socialMediaPatterns: RegExp[];

  constructor() {
    this.officialPatterns = [...DEFAULT_OFFICIAL_PATTERNS];
    this.governmentPatterns = [...DEFAULT_GOVERNMENT_PATTERNS];
    this.academicPatterns = [...DEFAULT_ACADEMIC_PATTERNS];
    this.researchJournalPatterns = [...DEFAULT_RESEARCH_JOURNAL_PATTERNS];
    this.factCheckerPatterns = [...DEFAULT_FACT_CHECKER_PATTERNS];
    this.encyclopediaPatterns = [...DEFAULT_REFERENCE_ENCYCLOPEDIA_PATTERNS];
    this.mainstreamPatterns = [...DEFAULT_MAINSTREAM_PATTERNS];
    this.organizationPatterns = [...DEFAULT_ORGANIZATION_PATTERNS];
    this.socialMediaPatterns = [...DEFAULT_SOCIAL_MEDIA_PATTERNS];
  }

  /**
   * Filters and categorizes raw evidence sources based on domain heuristics.
   */
  filterAndRankSources(
    sources: EvidenceSource[],
    mode: 'quick' | 'deep' | 'research' | 'manual' | 'web' = 'deep'
  ): FilteredSource[] {
    logger.info(`SourceFilter: Filtering, normalizing, and ranking ${sources.length} sources (mode=${mode})`);

    const seenUrls = new Set<string>();
    const enriched: FilteredSource[] = [];

    for (const source of sources) {
      const normalizedUrl = source.url ? deduplicator.normalizeUrl(source.url) : '';
      const domain = this.extractDomain(normalizedUrl || source.publisher || '');

      const dedupKey = normalizedUrl || `${domain}_${source.title.toLowerCase().trim()}`;
      if (seenUrls.has(dedupKey)) {
        continue;
      }
      seenUrls.add(dedupKey);

      const tier = this.classifyDomain(domain, normalizedUrl);
      let credibilityScore = this.calculateCredibilityScore(tier);

      // In Research Mode: Boost Academic / Journal / Official; Deprecate General Web
      if (mode === 'research') {
        if (tier === 'ACADEMIC' || tier === 'RESEARCH_JOURNAL' || tier === 'GOVERNMENT' || tier === 'OFFICIAL_SOURCE') {
          credibilityScore = Math.min(100, credibilityScore + 5);
        } else if (tier === 'GENERAL_WEB') {
          credibilityScore = Math.max(30, credibilityScore - 20);
        }
      }

      const isWhitelisted = tier !== 'UNTRUSTED' && tier !== 'SOCIAL_MEDIA';

      enriched.push({
        ...source,
        url: normalizedUrl || source.url,
        domain,
        tier,
        isWhitelisted,
        credibilityScore,
      });
    }

    // Sort by source priority score descending
    enriched.sort((a, b) => b.credibilityScore - a.credibilityScore);

    // In Quick Mode: return top 3
    if (mode === 'quick') {
      return enriched.slice(0, 3);
    }

    return enriched;
  }

  /**
   * Feature 13: Source Independence Clustering
   * Identifies syndicated articles, copies, and shared root domains.
   */
  clusterIndependentEvidenceGroups(sources: EvidenceSource[]): SourceClusterResult {
    const groups = new Map<string, EvidenceSource[]>();

    for (const source of sources) {
      const domain = this.extractDomain(source.url || source.publisher || '');
      const rootDomain = this.extractRootDomain(domain);

      // Check for wire syndication signals in title, snippet, or URL
      const combined = (source.title + ' ' + (source.snippet || '') + ' ' + (source.publisher || '') + ' ' + (source.url || '')).toLowerCase();
      let wireKey: string | null = null;
      if (combined.includes('associated press') || combined.includes('ap news') || combined.includes('apnews.com')) {
        wireKey = 'wire_associated_press';
      } else if (combined.includes('reuters')) {
        wireKey = 'wire_reuters';
      } else if (combined.includes('agence france-presse') || combined.includes('afp wire') || combined.includes('afp.com')) {
        wireKey = 'wire_afp';
      } else if (combined.includes('pr newswire') || combined.includes('prnewswire.com')) {
        wireKey = 'wire_pr_newswire';
      } else if (combined.includes('business wire') || combined.includes('businesswire.com')) {
        wireKey = 'wire_business_wire';
      } else if (combined.includes('united press international') || combined.includes('upi wire') || combined.includes('upi.com')) {
        wireKey = 'wire_upi';
      }

      const groupKey = wireKey || rootDomain;

      const existing = groups.get(groupKey) || [];
      existing.push(source);
      groups.set(groupKey, existing);
    }

    const clusteredSources: EvidenceSource[] = [];
    let groupIndex = 1;

    for (const [groupKey, groupItems] of groups.entries()) {
      const groupId = `group_${groupIndex++}`;
      groupItems.forEach((item, idx) => {
        clusteredSources.push({
          ...item,
          evidenceGroupId: groupId,
          isIndependentGroupHead: idx === 0,
        });
      });
    }

    const independentGroupsCount = groups.size;
    const summary = `${sources.length} sources found, ${independentGroupsCount} independent evidence groups.`;

    return {
      sources: clusteredSources,
      independentGroupsCount,
      summary,
    };
  }

  extractDomain(urlOrPublisher: string): string {
    try {
      if (urlOrPublisher.startsWith('http://') || urlOrPublisher.startsWith('https://')) {
        return new URL(urlOrPublisher).hostname.replace(/^www\./, '').toLowerCase();
      }
    } catch {
      // not a valid URL
    }
    return urlOrPublisher.toLowerCase().replace(/^www\./, '').split('/')[0];
  }

  extractRootDomain(domain: string): string {
    const parts = domain.split('.');
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return domain;
  }

  classifyDomain(domain: string, fullUrl: string): SourceTier {
    for (const pat of this.socialMediaPatterns) {
      if (pat.test(domain) || pat.test(fullUrl)) return 'UNTRUSTED';
    }
    for (const pat of this.factCheckerPatterns) {
      if (pat.test(domain) || pat.test(fullUrl)) return 'FACT_CHECKER';
    }
    for (const pat of this.governmentPatterns) {
      if (pat.test(domain) || pat.test(fullUrl)) return 'GOVERNMENT';
    }
    for (const pat of this.officialPatterns) {
      if (pat.test(domain) || pat.test(fullUrl)) return 'OFFICIAL_SOURCE';
    }
    for (const pat of this.academicPatterns) {
      if (pat.test(domain) || pat.test(fullUrl)) return 'ACADEMIC';
    }
    for (const pat of this.researchJournalPatterns) {
      if (pat.test(domain) || pat.test(fullUrl)) return 'RESEARCH_JOURNAL';
    }
    for (const pat of this.encyclopediaPatterns) {
      if (pat.test(domain) || pat.test(fullUrl)) return 'REFERENCE_ENCYCLOPEDIA';
    }
    for (const pat of this.mainstreamPatterns) {
      if (pat.test(domain) || pat.test(fullUrl)) return 'MAINSTREAM_NEWS';
    }
    for (const pat of this.organizationPatterns) {
      if (pat.test(domain) || pat.test(fullUrl)) return 'ORGANIZATION';
    }
    return 'GENERAL_WEB';
  }

  calculateCredibilityScore(tier: SourceTier): number {
    switch (tier) {
      case 'FACT_CHECKER':
        return 98;
      case 'OFFICIAL_SOURCE':
        return 96;
      case 'GOVERNMENT':
        return 95;
      case 'RESEARCH_JOURNAL':
        return 94;
      case 'ACADEMIC':
        return 92;
      case 'REFERENCE_ENCYCLOPEDIA':
        return 90;
      case 'MAINSTREAM_NEWS':
        return 85;
      case 'ORGANIZATION':
        return 82;
      case 'GENERAL_WEB':
        return 65;
      case 'SOCIAL_MEDIA':
      case 'UNTRUSTED':
        return 20;
    }
  }
}

export const sourceFilter = new SourceFilter();
