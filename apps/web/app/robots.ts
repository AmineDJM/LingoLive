import type { MetadataRoute } from 'next';
import { allowIndexing, siteUrl } from '@/lib/site';

/**
 * Everything under the product surface is excluded from indexing.
 *
 * A live session URL, a join code, a saved transcript or the operator console
 * appearing in search results would be a privacy incident, not an SEO problem.
 *
 * A non-production deployment disallows everything: a staging copy of the
 * marketing site competing with production in search results is a real cost.
 */
export default function robots(): MetadataRoute.Robots {
  if (!allowIndexing) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/*/listen',
          '/*/discuss',
          '/*/join',
          '/*/session/',
          '/*/history',
          '/*/settings',
          '/*/account',
          '/*/admin',
          '/*/auth/',
          '/offline',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
