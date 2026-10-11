import { expect, test } from 'vitest';
import { metadata as jobs } from './jobs/page';
import { metadata as landing } from './page';
import { metadata as planner } from './planner/page';

test('industry pages share their own title, copy and path on the default card', () => {
  const pages = [
    [landing, '/industry'],
    [jobs, '/industry/jobs'],
    [planner, '/industry/planner'],
  ] as const;

  for (const [metadata, path] of pages) {
    expect(metadata.alternates).toEqual({ canonical: path });
    expect(metadata.openGraph).toMatchObject({
      title: metadata.title,
      description: metadata.description,
      url: path,
      images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
    });
    expect(metadata.twitter).toMatchObject({
      title: metadata.title,
      description: metadata.description,
      images: ['/opengraph-image'],
    });
  }
});
