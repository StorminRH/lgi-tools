export const PRODUCTION_SITE_URL = 'https://lgi.tools';

export const SITE_URL: string =
  process.env.NEXT_PUBLIC_SITE_URL ?? PRODUCTION_SITE_URL;
