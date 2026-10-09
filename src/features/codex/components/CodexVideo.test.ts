import { readFileSync } from 'node:fs';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { codexVideoEmbed } from '../video-embed';
import { CodexVideo, VideoPlayer } from './CodexVideo';

const state = vi.hoisted(() => ({ playing: false }));

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: () => [state.playing, (next: boolean) => { state.playing = next; }],
}));

const youtube = codexVideoEmbed({ provider: 'youtube', videoId: 'dQw4w9WgXcQ' }, ['lgi.tools']);

test('a YouTube video shows its thumbnail and title and loads nothing from YouTube until played', () => {
  const html = renderToStaticMarkup(createElement(CodexVideo, { title: 'Full clear', embed: youtube }));

  expect(html).toContain('aria-label="Play Full clear (loads YouTube)"');
  expect(html).toContain('src="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"');
  expect(html).toContain('alt=""');
  expect(html).toContain('aspect-[16/9]');
  expect(html).toContain('YouTube video. Nothing loads from youtube.com until you press play.');
  expect(html).not.toContain('<iframe');
  expect(html).not.toContain('youtube-nocookie');
});

test('a Twitch clip shows a plain placeholder instead of a thumbnail', () => {
  const embed = codexVideoEmbed({ provider: 'twitch-clip', videoId: 'Slug' }, ['lgi.tools']);
  const html = renderToStaticMarkup(createElement(CodexVideo, { title: 'Clip', embed }));

  expect(html).not.toContain('<img');
  expect(html).toContain('Twitch video. Nothing loads from twitch.tv until you press play.');
});

test('the player embeds the provider page with autoplay and fullscreen and no sandbox', () => {
  const html = renderToStaticMarkup(createElement(VideoPlayer, { title: 'Full clear', embedSrc: youtube.embedSrc }));

  expect(html).toContain('<iframe');
  expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1"');
  expect(html).toContain('aria-label="Full clear"');
  expect(html).toContain('allow="autoplay; fullscreen; picture-in-picture; encrypted-media"');
  expect(html).toContain('allowFullScreen=""');
  expect(html).not.toContain('sandbox=');
});

test('pressing play swaps the button for the player and keeps the caption so nothing below moves', () => {
  type Facade = ReactElement<{ children: [ReactElement<{ onClick: () => void }>, ReactElement] }>;
  const [playButton] = (CodexVideo({ title: 'Full clear', embed: youtube }) as Facade).props.children;
  playButton.props.onClick();

  const html = renderToStaticMarkup(CodexVideo({ title: 'Full clear', embed: youtube }));
  state.playing = false;

  expect(html).toContain('<iframe');
  expect(html).not.toContain('aria-label="Play Full clear (loads YouTube)"');
  expect(html).toContain('<figcaption');
  expect(html).toContain('YouTube video. Nothing loads from youtube.com until you press play.');
});

test('a mounted player lifts the sitewide grain and Feedback button so Twitch sees an uncovered player and autoplays', () => {
  const html = renderToStaticMarkup(createElement(VideoPlayer, { title: 'Clip', embedSrc: youtube.embedSrc }));
  const css = readFileSync('src/app/globals.css', 'utf8');

  expect(html).toContain('<div data-video-player=""');
  expect(css).toContain('body:has([data-video-player]) :is(.page-grain, [data-site-feedback]) {\n  display: none;\n}');
});
