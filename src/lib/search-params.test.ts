import { expect, test } from 'vitest';
import { withSearchParams } from './search-params';

test('a patch sets and deletes keys, keeps the rest in order, and drops an empty query', () => {
  expect(withSearchParams('/industry', '', { profile: 'caps' })).toBe('/industry?profile=caps');
  expect(withSearchParams('/industry', 'profile=rx&from=nav', { profile: 'caps' })).toBe(
    '/industry?profile=caps&from=nav',
  );
  expect(withSearchParams('/industry', '?profile=rx&character=102&from=nav', { profile: 'caps', character: null })).toBe(
    '/industry?profile=caps&from=nav',
  );
  expect(withSearchParams('/atlas', '?tab=scanner', { map: 'map-a', panel: 'signatures' })).toBe(
    '/atlas?tab=scanner&map=map-a&panel=signatures',
  );
  expect(withSearchParams('/atlas', '?map=map-a', { map: null })).toBe('/atlas');
  expect(withSearchParams('/atlas', '', { map: null })).toBe('/atlas');
  expect(withSearchParams('/sites', '', {})).toBe('/sites');
});

test('the current query can come from anything that prints one, such as useSearchParams output', () => {
  expect(withSearchParams('/atlas', new URLSearchParams('map=old&panel=signatures'), { map: 'map-b' })).toBe(
    '/atlas?map=map-b&panel=signatures',
  );
  expect(withSearchParams('/atlas', { toString: () => 'tab=scanner&map=map-a' }, { map: null })).toBe(
    '/atlas?tab=scanner',
  );
});

test('empty values print as bare keys while encoded values and separators survive', () => {
  expect(withSearchParams('/', '?demo&character=7', { character: null })).toBe('/?demo');
  expect(withSearchParams('/', '?demo=&x=1', { character: '8' })).toBe('/?demo&x=1&character=8');
  expect(withSearchParams('/', '', { flag: '' })).toBe('/?flag');
  expect(withSearchParams('/atlas', '', { map: 'map/one' })).toBe('/atlas?map=map%2Fone');
  expect(withSearchParams('/', '', { q: 'a=b', note: 'two words&more' })).toBe('/?q=a%3Db&note=two+words%26more');
});

test('a hash is appended only when one is passed', () => {
  expect(withSearchParams('/industry', '?profile=p1', { panel: 'structures' }, '#rail')).toBe(
    '/industry?profile=p1&panel=structures#rail',
  );
  expect(withSearchParams('/industry', '?panel=structures', { panel: null }, '#rail')).toBe('/industry#rail');
  expect(withSearchParams('/industry', '?profile=p1', { panel: null }, '')).toBe('/industry?profile=p1');
  expect(withSearchParams('/industry', '?profile=p1', { panel: null })).toBe('/industry?profile=p1');
});
