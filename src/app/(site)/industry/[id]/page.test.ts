import { expect, test, vi } from 'vitest';
import { generateMetadata } from './page';

const mocks = vi.hoisted(() => ({
  getBlueprintStructure: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => mocks.notFound(),
}));

vi.mock('@/features/industry-planner/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/industry-planner/queries')>()),
  getBlueprintStructure: (id: number) => mocks.getBlueprintStructure(id),
}));

test('blueprint metadata shares the default card and 404s a bad or unknown id', async () => {
  mocks.getBlueprintStructure.mockResolvedValue({ product: { name: 'Rifter' } });
  const metadata = await generateMetadata({ params: Promise.resolve({ id: '691' }) });

  expect(mocks.getBlueprintStructure).toHaveBeenCalledWith(691);
  expect(metadata.title).toBe('Rifter — Industry Planner');
  expect(metadata.alternates).toEqual({ canonical: '/industry/691' });
  expect(metadata.openGraph).toMatchObject({
    title: 'Rifter — Industry Planner',
    url: '/industry/691',
    images: [{ url: '/opengraph-image', width: 1200, height: 630 }],
  });
  expect(metadata.twitter).toMatchObject({
    title: 'Rifter — Industry Planner',
    images: ['/opengraph-image'],
  });

  mocks.getBlueprintStructure.mockResolvedValue(null);
  await expect(generateMetadata({ params: Promise.resolve({ id: '692' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  expect(mocks.getBlueprintStructure).toHaveBeenLastCalledWith(692);

  await expect(generateMetadata({ params: Promise.resolve({ id: '0691' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  expect(mocks.getBlueprintStructure).toHaveBeenCalledTimes(2);
});
