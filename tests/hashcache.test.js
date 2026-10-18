/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
// KI-generiert
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHashCache } = require('../js/hashcache');

const KEY = 'hashes';
const memoryStorage = (initial) => {
  const data = new Map(initial === undefined ? [] : [[KEY, initial]]);
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, v), data };
};
const make = (storage, maxEntries = 3) => createHashCache({ storage, storageKey: KEY, maxEntries });

test('hashcache', async (t) => {
  await t.test('stores a hash per asset and returns it only for the same file version', () => {
    const cache = make(memoryStorage());
    assert.equal(cache.get('a', 'v1'), undefined);
    cache.set('a', 'v1', 'H');
    assert.equal(cache.get('a', 'v1'), 'H');
    assert.equal(cache.get('a', 'v2'), undefined, 'a changed version invalidates the entry');
    assert.equal(cache.get('b', 'v1'), undefined);
  });

  await t.test('persists to the storage and reloads from it (survives a page reload)', () => {
    const storage = memoryStorage();
    make(storage).set('a', 'v1', 'H');
    const reloaded = make(storage);
    assert.equal(reloaded.get('a', 'v1'), 'H');
    assert.equal(reloaded.size(), 1);
  });

  await t.test('drops the oldest entries beyond the maximum, re-setting an entry refreshes it', () => {
    const cache = make(memoryStorage(), 3);
    ['a', 'b', 'c'].forEach((id) => cache.set(id, 'v', id.toUpperCase()));
    cache.set('a', 'v', 'A2');
    cache.set('d', 'v', 'D');
    assert.equal(cache.size(), 3);
    assert.equal(cache.get('b', 'v'), undefined, 'the oldest one was dropped');
    assert.equal(cache.get('a', 'v'), 'A2');
    assert.equal(cache.get('d', 'v'), 'D');
  });

  await t.test('clear empties memory and storage', () => {
    const storage = memoryStorage();
    const cache = make(storage);
    cache.set('a', 'v', 'H');
    cache.clear();
    assert.equal(cache.size(), 0);
    assert.equal(make(storage).size(), 0);
  });

  await t.test('broken or invalid stored data starts an empty cache', () => {
    assert.equal(make(memoryStorage('{kaputt')).size(), 0);
    assert.equal(make(memoryStorage(JSON.stringify({ a: { version: 'v' }, b: null, c: { version: 'v', hash: 'H' } }))).size(), 1);
    assert.equal(make(memoryStorage(JSON.stringify([1, 2]))).size(), 0);
  });

  await t.test('works without storage and when the storage refuses to write', () => {
    const noStorage = make(undefined);
    noStorage.set('a', 'v', 'H');
    assert.equal(noStorage.get('a', 'v'), 'H');
    const full = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    const cache = make(full);
    cache.set('a', 'v', 'H');
    assert.equal(cache.get('a', 'v'), 'H', 'the in-memory cache still works');
    const unreadable = { getItem: () => { throw new Error('blocked'); }, setItem: () => {} };
    assert.equal(make(unreadable).size(), 0);
  });
});
