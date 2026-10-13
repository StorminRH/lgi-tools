import { expect, onTestFinished, test, vi } from 'vitest';

const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', () => rt.react);

import { createClientResource, useClientResource, type ResourceState } from './client-resource';

const offline = () => Promise.reject(new Error('offline'));

test('callers share one load, a rejected load is forgotten so the next call reads again, and a loaded value is kept', async () => {
  vi.useFakeTimers();
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const read = vi.fn<() => Promise<string>>().mockImplementationOnce(offline).mockResolvedValueOnce('index');
  const resource = createClientResource(read);
  const server = resource.serverValue;

  const first = resource.load();
  const second = resource.load();
  expect(second).toBe(first);
  await expect(first).rejects.toThrow('offline');
  expect(read).toHaveBeenCalledOnce();
  expect(resource.get()).toEqual({ value: null, failed: true });
  // Nobody is subscribed, so a failed load leaves no retry behind.
  expect(vi.getTimerCount()).toBe(0);

  await expect(resource.load()).resolves.toBe('index');
  await expect(resource.load()).resolves.toBe('index');
  expect(read).toHaveBeenCalledTimes(2);
  expect(resource.get()).toEqual({ value: 'index', failed: false });
  // The server and hydration keep rendering the unloaded state.
  expect(resource.serverValue).toBe(server);
  expect(server).toEqual({ value: null, failed: false });
});

test('subscribers start one load and share one retry timer, and the failure holds through retries until a load succeeds', async () => {
  vi.useFakeTimers();
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const read = vi.fn<() => Promise<string>>()
    .mockImplementationOnce(offline)
    .mockImplementationOnce(offline)
    .mockResolvedValueOnce('index');
  const resource = createClientResource(read);
  const heard: ResourceState<string>[] = [];
  const first = resource.subscribe(() => heard.push(resource.get()));
  const second = resource.subscribe(() => {});
  expect(read).toHaveBeenCalledOnce();

  await vi.advanceTimersByTimeAsync(0);
  expect(resource.get()).toEqual({ value: null, failed: true });
  expect(vi.getTimerCount()).toBe(1);
  const third = resource.subscribe(() => {});
  expect(read).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(1);

  await vi.advanceTimersByTimeAsync(14_999);
  expect(read).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect(read).toHaveBeenCalledTimes(2);
  expect(resource.get().failed).toBe(true);

  await vi.advanceTimersByTimeAsync(15_000);
  expect(read).toHaveBeenCalledTimes(3);
  expect(resource.get()).toEqual({ value: 'index', failed: false });
  expect(heard).toEqual([
    { value: null, failed: true },
    { value: 'index', failed: false },
  ]);
  expect(vi.getTimerCount()).toBe(0);

  first();
  second();
  third();
  const later = resource.subscribe(() => {});
  expect(read).toHaveBeenCalledTimes(3);
  later();
});

test('the last subscriber to leave clears the retry, the next first subscriber loads at once, and a caller that loads makes a waiting retry moot', async () => {
  vi.useFakeTimers();
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const read = vi.fn<() => Promise<string>>()
    .mockImplementationOnce(offline)
    .mockImplementationOnce(offline)
    .mockResolvedValueOnce('index');
  const resource = createClientResource(read);
  const first = resource.subscribe(() => {});
  const second = resource.subscribe(() => {});
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(1);

  first();
  first();
  expect(vi.getTimerCount()).toBe(1);
  second();
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(read).toHaveBeenCalledOnce();

  const returning = resource.subscribe(() => {});
  expect(read).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(1);

  await expect(resource.load()).resolves.toBe('index');
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(read).toHaveBeenCalledTimes(3);
  expect(resource.get()).toEqual({ value: 'index', failed: false });
  returning();
});

test('a disabled reader neither loads nor listens, enabling it loads, and a reader mounted after the load has the value on its first render', async () => {
  onTestFinished(() => rt.unmount());
  const read = vi.fn(async () => 'index');
  const resource = createClientResource(read);

  expect(rt.render(useClientResource, resource, false)).toEqual({ value: null, failed: false });
  expect(read).not.toHaveBeenCalled();
  expect(rt.render(useClientResource, resource, true).value).toBeNull();
  expect(read).toHaveBeenCalledOnce();
  await resource.load();
  expect(rt.render(useClientResource, resource, true).value).toBe('index');

  rt.unmount();
  expect(rt.render(useClientResource, resource).value).toBe('index');
  expect(read).toHaveBeenCalledOnce();
});
