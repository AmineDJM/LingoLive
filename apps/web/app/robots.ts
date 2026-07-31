import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

/**
 * Everything under the product surface is excluded from indexing.
 *
 * A live session URL, a join code, a saved transcript or the operator console
 * appearing in search results would be a privacy incident, not an SEO problem.
 */
export default function robots(): MetadataRoute.Robots {
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
