import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Per-query and near-infinite; crawling them spends budget on pages that
      // duplicate the listings a crawler already has. The pages worth ranking
      // are the restaurants.
      disallow: '/search',
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
