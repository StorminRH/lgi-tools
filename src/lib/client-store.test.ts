import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { createClientStore, useClientStore } from './client-store';

test('set publishes a changed value to subscribers and skips an identical one', () => {
  const store = createClientStore('held');
  const listener = vi.fn();
  const unsubscribe = store.subscribe(listener);

  store.set('held');
  expect(listener).not.toHaveBeenCalled();

  store.set('live');
  expect(store.get()).toBe('live');
  expect(listener).toHaveBeenCalledTimes(1);

  unsubscribe();
  store.set('later');
  expect(listener).toHaveBeenCalledTimes(1);
});

test('server renders, like hydration, read the server value even after a publish', () => {
  const store = createClientStore('held');
  store.set('live');
  function Reader() {
    return createElement('span', null, useClientStore(store));
  }
  expect(renderToStaticMarkup(createElement(Reader))).toBe('<span>held</span>');
});
