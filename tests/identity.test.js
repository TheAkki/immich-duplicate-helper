/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
// KI-generiert
const test = require('node:test');
const assert = require('node:assert/strict');
const { quickCheck, compareContents, createContentHasher } = require('../js/identity');
const { sha1BytesBase64 } = require('../js/sha1');

const asset = (o) => ({ id: 'x', fileSize: 0, checksum: '', checksumKind: 'unknown', ...o });
const bytes = (...v) => new Uint8Array(v);
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('identity', async (t) => {
  await t.test('quickCheck: different size -> not byte-identical', () => {
    assert.deepEqual(quickCheck(asset({ fileSize: 10 }), asset({ fileSize: 11 })), { verdict: 'different', method: 'size' });
  });

  await t.test('quickCheck: two file checksums decide', () => {
    const a = asset({ fileSize: 5, checksum: 'A', checksumKind: 'file' });
    assert.deepEqual(quickCheck(a, { ...a, id: 'y' }), { verdict: 'identical', method: 'checksum' });
    assert.deepEqual(quickCheck(a, { ...a, checksum: 'B' }), { verdict: 'different', method: 'checksum' });
  });

  await t.test('quickCheck: path hash or unknown size does not decide', () => {
    const file = asset({ fileSize: 5, checksum: 'A', checksumKind: 'file' });
    const path = asset({ fileSize: 5, checksum: 'P', checksumKind: 'path' });
    assert.equal(quickCheck(file, path), null);
    assert.equal(quickCheck(path, path), null);
    assert.equal(quickCheck(asset({ fileSize: 0 }), asset({ fileSize: 7 })), null);
  });

  await t.test('compareContents: no hashing if quickCheck decides', async () => {
    const hashOf = async () => assert.fail('not expected');
    const r = await compareContents(hashOf, asset({ fileSize: 1 }), asset({ fileSize: 2 }));
    assert.equal(r.method, 'size');
  });

  await t.test('compareContents: hashes both files one after the other and compares them', async () => {
    const order = [];
    const hashes = { a: 'H1', b: 'H1', c: 'H2' };
    const hashOf = async (a) => { order.push(a.id); return hashes[a.id]; };
    const path = (id) => asset({ id, fileSize: 3, checksum: 'P', checksumKind: 'path' });
    assert.deepEqual(await compareContents(hashOf, path('a'), path('b')), { verdict: 'identical', method: 'content' });
    assert.deepEqual(order, ['a', 'b']);
    const diff = await compareContents(hashOf, path('a'), { ...path('c'), fileSize: 0 });
    assert.deepEqual(diff, { verdict: 'different', method: 'content' });
  });

  await t.test('content hasher: each original is downloaded once and then served from the cache', async () => {
    const downloads = [];
    const data = { a: bytes(1, 2, 3), b: bytes(1, 2, 3), c: bytes(9, 9) };
    const stored = new Map();
    const cache = {
      get: (id, version) => (stored.get(id) && stored.get(id).version === version ? stored.get(id).hash : undefined),
      set: (id, version, hash) => stored.set(id, { version, hash }),
    };
    const hashOf = createContentHasher({ fetchBytes: async (id) => { downloads.push(id); return data[id]; }, cache });
    const path = (id) => asset({ id, version: 'v1', fileSize: 3, checksum: 'P', checksumKind: 'path' });
    // the original "a" is compared with two copies: it is downloaded only once
    assert.equal((await compareContents(hashOf, path('a'), path('b'))).verdict, 'identical');
    assert.equal((await compareContents(hashOf, path('a'), path('c'))).verdict, 'different');
    assert.deepEqual(downloads, ['a', 'b', 'c']);
    assert.equal(await hashOf(path('a')), sha1BytesBase64(data.a));
    assert.deepEqual(downloads, ['a', 'b', 'c'], 'no further download');
  });

  await t.test('content hasher: concurrent requests share one download; a changed file version downloads again', async () => {
    let downloads = 0;
    const stored = new Map();
    const cache = {
      get: (id, version) => (stored.get(id) && stored.get(id).version === version ? stored.get(id).hash : undefined),
      set: (id, version, hash) => stored.set(id, { version, hash }),
    };
    const hashOf = createContentHasher({
      fetchBytes: async () => { downloads += 1; await tick(); return bytes(1); },
      cache,
    });
    const file = (version) => asset({ id: 'x', version });
    const [h1, h2] = await Promise.all([hashOf(file('v1')), hashOf(file('v1'))]);
    assert.equal(h1, h2);
    assert.equal(downloads, 1);
    await hashOf(file('v1'));
    assert.equal(downloads, 1, 'cached');
    await hashOf(file('v2'));
    assert.equal(downloads, 2, 'the file changed (new version)');
  });

  await t.test('content hasher: a failed download is not cached and can be retried', async () => {
    let calls = 0;
    const stored = new Map();
    const cache = { get: (id) => stored.get(id), set: (id, v, hash) => stored.set(id, hash) };
    const hashOf = createContentHasher({
      fetchBytes: async () => { calls += 1; if (calls === 1) throw new Error('403'); return bytes(7); },
      cache,
    });
    await assert.rejects(hashOf(asset({ id: 'x', version: 'v' })), /403/);
    assert.equal(typeof (await hashOf(asset({ id: 'x', version: 'v' }))), 'string');
    assert.equal(calls, 2);
  });

  await t.test('cardClass: only non-identical pairs color the card', () => {
    const { cardClass } = require('../js/identity');
    assert.equal(cardClass({ verdict: 'different', method: 'size' }), 'verify-different');
    assert.equal(cardClass({ verdict: 'identical', method: 'content' }), '');
    assert.equal(cardClass(undefined), '');
    assert.equal(cardClass(null), '');
  });

  await t.test('createVerifier: the same pair is checked only once, another pair anew', async () => {
    const { createVerifier } = require('../js/identity');
    let calls = 0;
    const verifier = createVerifier(async () => { calls += 1; return { verdict: 'identical', method: 'content' }; });
    const o = { id: 'o' };
    const [r1, r2] = await Promise.all([verifier.verify(o, { id: 'a' }), verifier.verify(o, { id: 'a' })]);
    assert.equal(r1, r2);
    assert.equal(calls, 1);
    await verifier.verify(o, { id: 'b' });
    assert.equal(calls, 2);
    verifier.clear();
    await verifier.verify(o, { id: 'a' });
    assert.equal(calls, 3);
  });

  await t.test('createVerifier: a changed file version is a new pair', async () => {
    const { createVerifier } = require('../js/identity');
    let calls = 0;
    const verifier = createVerifier(async () => { calls += 1; return { verdict: 'identical', method: 'content' }; });
    await verifier.verify({ id: 'o', version: 'v1' }, { id: 'a', version: 'v1' });
    await verifier.verify({ id: 'o', version: 'v1' }, { id: 'a', version: 'v1' });
    assert.equal(calls, 1);
    await verifier.verify({ id: 'o', version: 'v2' }, { id: 'a', version: 'v1' });
    assert.equal(calls, 2);
  });

  await t.test('createVerifier: errors are not remembered, retrying is possible', async () => {
    const { createVerifier } = require('../js/identity');
    let calls = 0;
    const verifier = createVerifier(async () => {
      calls += 1;
      if (calls === 1) throw new Error('403');
      return { verdict: 'different', method: 'size' };
    });
    await assert.rejects(verifier.verify({ id: 'o' }, { id: 'a' }), /403/);
    await tick();
    assert.equal((await verifier.verify({ id: 'o' }, { id: 'a' })).verdict, 'different');
    assert.equal(calls, 2);
  });

  await t.test('compareContents passes errors on', async () => {
    const hashOf = async () => { throw new Error('403'); };
    const path = (id) => asset({ id, checksumKind: 'path', checksum: 'P' });
    await assert.rejects(compareContents(hashOf, path('a'), path('b')), /403/);
  });
});
