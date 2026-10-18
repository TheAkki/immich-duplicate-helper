/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
// KI-generiert
const test = require('node:test');
const assert = require('node:assert/strict');
const { createClient, normalizeBaseUrl, chunk, ImmichApiError } = require('../js/immichApi');
const { fakeResponse } = require('./helpers');

function recorder(response) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return typeof response === 'function' ? response(url, init) : response;
  };
  return { calls, fetchImpl };
}

// Answers /server/version itself (version === null: endpoint not available), otherwise delegates to the handler.
function versioned(version, handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/server/version')) {
      return version === null ? fakeResponse({ ok: false, status: 404 }) : fakeResponse({ json: version });
    }
    return handler(url, init);
  };
  return { calls, fetchImpl };
}
const searchCalls = (calls) => calls.filter((c) => c.url.endsWith('/search/metadata'));

test('immichApi', async (t) => {
  await t.test('normalizeBaseUrl', () => {
    assert.equal(normalizeBaseUrl(' immich.local:2283/ '), 'http://immich.local:2283');
    assert.equal(normalizeBaseUrl('https://x.org//'), 'https://x.org');
    assert.throws(() => normalizeBaseUrl('  '), ImmichApiError);
  });

  await t.test('chunk', () => {
    assert.deepEqual(chunk([1, 2, 3], 2), [[1, 2], [3]]);
    assert.deepEqual(chunk([], 2), []);
  });

  await t.test('createClient requires a token', () => {
    assert.throws(() => createClient({ baseUrl: 'http://x', apiKey: '' }), ImmichApiError);
  });

  await t.test('getDuplicates sends the API key and returns JSON', async () => {
    const { calls, fetchImpl } = recorder(fakeResponse({ json: [{ duplicateId: 'g' }] }));
    const c = createClient({ baseUrl: 'http://h:1/', apiKey: 'K', fetchImpl });
    assert.deepEqual(await c.getDuplicates(), [{ duplicateId: 'g' }]);
    assert.equal(calls[0].url, 'http://h:1/api/duplicates');
    assert.equal(calls[0].init.headers['x-api-key'], 'K');
    assert.equal(calls[0].init.body, undefined);
  });

  await t.test('requests never use cached responses', async () => {
    const { calls, fetchImpl } = recorder(fakeResponse({ json: [] }));
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    await c.getDuplicates();
    assert.equal(calls[0].init.cache, 'no-store');
  });

  await t.test('thumbnails may use the browser cache, everything else never does', async () => {
    const { calls, fetchImpl } = recorder(fakeResponse({ json: [], blob: 'B' }));
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    await c.getThumbnail('x');
    await c.getDuplicates();
    assert.equal(calls[0].init.cache, 'default', 'thumbnail');
    assert.equal(calls[1].init.cache, 'no-store', 'duplicates');
  });

  await t.test('getLibraries calls /libraries', async () => {
    const { calls, fetchImpl } = recorder(fakeResponse({ json: [{ id: 'l', importPaths: ['/x'] }] }));
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    assert.deepEqual(await c.getLibraries(), [{ id: 'l', importPaths: ['/x'] }]);
    assert.equal(calls[0].url, 'http://h/api/libraries');
  });

  await t.test('versions: comparison, search mode and display', () => {
    const { compareVersions, searchModeFor, formatVersion } = require('../js/immichApi');
    assert.ok(compareVersions({ major: 3, minor: 2, patch: 0 }, { major: 2, minor: 9, patch: 9 }) > 0);
    assert.ok(compareVersions({ major: 3, minor: 1, patch: 9 }, { major: 3, minor: 2, patch: 0 }) < 0);
    assert.ok(compareVersions({ major: 3, minor: 2, patch: 1 }, { major: 3, minor: 2, patch: 0 }) > 0);
    assert.equal(compareVersions({ major: 1, minor: 1, patch: 1 }, { major: 1, minor: 1, patch: 1 }), 0);
    assert.equal(searchModeFor({ major: 3, minor: 2, patch: 0 }), 'filter');
    assert.equal(searchModeFor({ major: 4, minor: 0, patch: 0 }), 'filter');
    assert.equal(searchModeFor({ major: 2, minor: 5, patch: 6 }), 'legacy');
    assert.equal(searchModeFor(null), 'legacy');
    assert.equal(formatVersion({ major: 3, minor: 3, patch: 0 }), '3.3.0');
    assert.equal(formatVersion(null), '?');
  });

  await t.test('server from 3.2.0: search with filter and cursor, albums queried individually and merged', async () => {
    const pages = {
      al1: [
        { assets: { items: [{ id: 'a' }, { id: 'b' }], nextCursor: 'C2' } },
        { assets: { items: [{ id: 'c' }], nextCursor: null } },
      ],
      al2: [{ assets: { items: [{ id: 'b' }, { id: 'd' }], nextCursor: null } }],
    };
    const { calls, fetchImpl } = versioned({ major: 3, minor: 3, patch: 0 }, (url, init) => {
      const body = JSON.parse(init.body);
      return fakeResponse({ json: pages[body.filter.albumIds.any[0]].shift() });
    });
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    assert.equal(await c.getSearchMode(), 'filter');
    assert.deepEqual((await c.getAssetIdsInAlbums(['al1', 'al2'])).sort(), ['a', 'b', 'c', 'd']);
    const bodies = searchCalls(calls).map((x) => JSON.parse(x.init.body));
    assert.deepEqual(bodies[0], { filter: { albumIds: { any: ['al1'] } }, size: 1000 });
    assert.deepEqual(bodies[1], { filter: { albumIds: { any: ['al1'] } }, size: 1000, cursor: 'C2' });
    assert.equal(calls.filter((x) => x.url.endsWith('/server/version')).length, 1, 'version loaded only once');
  });

  await t.test('server before 3.2.0: flat fields with page counting', async () => {
    const pages = [
      { assets: { items: [{ id: 'a' }], nextPage: '2' } },
      { assets: { items: [{ id: 'b' }], nextPage: null } },
    ];
    const { calls, fetchImpl } = versioned({ major: 1, minor: 130, patch: 0 }, () => fakeResponse({ json: pages.shift() }));
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    assert.equal(await c.getSearchMode(), 'legacy');
    assert.deepEqual(await c.getAssetIdsWithTag('T'), ['a', 'b']);
    const bodies = searchCalls(calls).map((x) => JSON.parse(x.init.body));
    assert.deepEqual(bodies, [{ tagIds: ['T'], page: 1, size: 1000 }, { tagIds: ['T'], page: 2, size: 1000 }]);
  });

  await t.test('version cannot be determined: classic search', async () => {
    const { calls, fetchImpl } = versioned(null, () => fakeResponse({ json: { assets: { items: [{ id: 'a' }], nextPage: null } } }));
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    assert.equal(await c.getServerVersion(), null);
    assert.deepEqual(await c.getAssetIdsInAlbums(['al1']), ['a']);
    assert.deepEqual(JSON.parse(searchCalls(calls)[0].init.body), { albumIds: ['al1'], page: 1, size: 1000 });
  });

  await t.test('getServerVersion returns the server response', async () => {
    const v = { major: 3, minor: 3, patch: 0, prerelease: 0 };
    const { calls, fetchImpl } = versioned(v, () => fakeResponse());
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    assert.deepEqual(await c.getServerVersion(), v);
    assert.equal(calls[0].url, 'http://h/api/server/version');
  });

  await t.test('getTags calls /tags', async () => {
    const { calls, fetchImpl } = recorder(fakeResponse({ json: [{ id: 'T', name: 'duplicate' }] }));
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    assert.deepEqual(await c.getTags(), [{ id: 'T', name: 'duplicate' }]);
    assert.equal(calls[0].url, 'http://h/api/tags');
  });

  await t.test('getAssetDetails reads tags and stack from the asset details in one call', async () => {
    const asset = { id: 'x', tags: [{ name: 'dup', value: 'sys/dup' }], stack: { id: 'S1', primaryAssetId: 'x', assetCount: 3 } };
    const { calls, fetchImpl } = recorder(fakeResponse({ json: asset }));
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    assert.deepEqual(await c.getAssetDetails('x/1'), {
      tagNames: ['sys/dup'],
      stack: { id: 'S1', primaryAssetId: 'x', assetCount: 3 },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://h/api/assets/x%2F1');
    const none = recorder(fakeResponse({ json: { id: 'x' } }));
    const c2 = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl: none.fetchImpl });
    assert.deepEqual(await c2.getAssetDetails('x'), { tagNames: [], stack: null });
    const nullStack = recorder(fakeResponse({ json: { id: 'x', stack: null } }));
    const c3 = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl: nullStack.fetchImpl });
    assert.equal((await c3.getAssetDetails('x')).stack, null);
  });

  await t.test('getOriginalBytes downloads the original as bytes', async () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    const { calls, fetchImpl } = recorder({ ok: true, status: 200, arrayBuffer: async () => buffer });
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    assert.deepEqual([...(await c.getOriginalBytes('a/1'))], [1, 2, 3]);
    assert.equal(calls[0].url, 'http://h/api/assets/a%2F1/original');
  });

  await t.test('untagAssets: DELETE per batch, per-image results merged', async () => {
    const { calls, fetchImpl } = recorder((url, init) => {
      const ids = JSON.parse(init.body).ids;
      return fakeResponse({ json: ids.map((id) => ({ id, success: true })) });
    });
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    const ids = Array.from({ length: 101 }, (_, i) => `id${i}`);
    const results = await c.untagAssets('T/1', ids);
    assert.equal(results.length, 101);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].init.method, 'DELETE');
    assert.equal(calls[0].url, 'http://h/api/tags/T%2F1/assets');
    assert.equal(JSON.parse(calls[0].init.body).ids.length, 100);
  });

  await t.test('getAlbumNames returns the album names of the image', async () => {
    const { calls, fetchImpl } = recorder(fakeResponse({ json: [{ albumName: 'Vacation' }, { albumName: 'Family' }] }));
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    assert.deepEqual(await c.getAlbumNames('a/1'), ['Vacation', 'Family']);
    assert.equal(calls[0].url, 'http://h/api/albums?assetId=a%2F1');
  });

  await t.test('getAlbums calls /albums', async () => {
    const { calls, fetchImpl } = recorder(fakeResponse({ json: [{ id: '1', albumName: 'X' }] }));
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    assert.deepEqual(await c.getAlbums(), [{ id: '1', albumName: 'X' }]);
    assert.equal(calls[0].url, 'http://h/api/albums');
  });

  await t.test('normalizeTagName: default for an empty name', () => {
    const { normalizeTagName } = require('../js/immichApi');
    assert.equal(normalizeTagName('  x '), 'x');
    assert.equal(normalizeTagName(''), 'duplicate');
    assert.equal(normalizeTagName(undefined), 'duplicate');
  });

  await t.test('deleteAssets sends in batches (trash, force=false)', async () => {
    const { calls, fetchImpl } = recorder(fakeResponse());
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    const ids = Array.from({ length: 150 }, (_, i) => `id${i}`);
    await c.deleteAssets(ids);
    assert.equal(calls.length, 2);
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.ids.length, 100);
    assert.equal(body.force, false);
    assert.equal(calls[0].init.method, 'DELETE');
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  });

  await t.test('createStack and getThumbnail', async () => {
    const { calls, fetchImpl } = recorder(fakeResponse({ json: { id: 's' }, blob: 'BLOB' }));
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    assert.deepEqual(await c.createStack(['a', 'b']), { id: 's' });
    assert.deepEqual(JSON.parse(calls[0].init.body), { assetIds: ['a', 'b'] });
    assert.equal(await c.getThumbnail('x/y'), 'BLOB');
    assert.equal(calls[1].url, 'http://h/api/assets/x%2Fy/thumbnail?size=thumbnail');
  });

  // Fake Immich tag endpoints: existingTags for GET /tags, per-image results for PUT /tags/{id}/assets.
  function tagServer({ existingTags = [], resultFor = (id) => ({ id, success: true }) } = {}) {
    return recorder((url, init) => {
      if (url.endsWith('/tags/T1/assets') || url.endsWith('/tags/T9/assets')) {
        return fakeResponse({ json: JSON.parse(init.body).ids.map(resultFor) });
      }
      if (init.method === 'PUT' && url.endsWith('/tags')) {
        return fakeResponse({ json: [{ id: 'T1', name: 'dup', value: 'dup' }] });
      }
      return fakeResponse({ json: existingTags });
    });
  }

  await t.test('tagAssets creates a missing tag and assigns it per image in batches', async () => {
    const { calls, fetchImpl } = tagServer();
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    const ids = Array.from({ length: 101 }, (_, i) => `id${i}`);
    const outcome = await c.tagAssets(' dup ', ids);
    assert.deepEqual(calls.map((x) => `${x.init.method} ${x.url.replace('http://h/api', '')}`), [
      'GET /tags',
      'PUT /tags',
      'PUT /tags/T1/assets',
      'PUT /tags/T1/assets',
    ]);
    assert.deepEqual(JSON.parse(calls[1].init.body), { tags: ['dup'] });
    assert.equal(JSON.parse(calls[2].init.body).ids.length, 100);
    assert.equal(outcome.tag.id, 'T1');
    assert.equal(outcome.results.length, 101);
  });

  await t.test('tagAssets uses an existing tag and does not need to create it', async () => {
    const { calls, fetchImpl } = tagServer({ existingTags: [{ id: 'T9', name: 'dup', value: 'dup' }] });
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    await c.tagAssets('DUP', ['a']);
    assert.deepEqual(calls.map((x) => `${x.init.method} ${x.url.replace('http://h/api', '')}`), ['GET /tags', 'PUT /tags/T9/assets']);
    assert.deepEqual(JSON.parse(calls[1].init.body), { ids: ['a'] });
  });

  await t.test('tagAssets uses the default tag name for an empty name', async () => {
    const { calls, fetchImpl } = tagServer();
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    await c.tagAssets('  ', ['a']);
    const create = calls.find((x) => x.init.method === 'PUT' && x.url.endsWith('/tags'));
    assert.deepEqual(JSON.parse(create.init.body), { tags: ['duplicate'] });
  });

  await t.test('tagAssets reports images that Immich refused, with the reason', async () => {
    const { fetchImpl } = tagServer({
      resultFor: (id) => (id === 'bad' ? { id, success: false, error: 'no_permission' } : { id, success: true }),
    });
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    await assert.rejects(c.tagAssets('dup', ['ok', 'bad']), /did not tag 1 image\(s\) with "dup": no_permission/);
  });

  await t.test('tagAssets treats "already tagged" as success', async () => {
    const { fetchImpl } = tagServer({ resultFor: (id) => ({ id, success: false, error: 'duplicate' }) });
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    const outcome = await c.tagAssets('dup', ['a']);
    assert.equal(outcome.results.length, 1);
  });

  await t.test('tagAssets reports a failure when creating the tag is not permitted', async () => {
    const { fetchImpl } = recorder((url, init) =>
      init.method === 'PUT'
        ? fakeResponse({ ok: false, status: 403, json: { message: 'Missing required permission: tag.create' } })
        : fakeResponse({ json: [] }));
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    await assert.rejects(c.tagAssets('dup', ['a']), /403.*tag\.create/);
  });

  await t.test('findTag: exact path wins, a unique name is accepted, an ambiguous name finds nothing', () => {
    const { findTag } = require('../js/immichApi');
    const tags = [
      { id: '1', name: 'a', value: 'p/a' },
      { id: '2', name: 'duplicate', value: 'duplicate' },
      { id: '3', name: 'duplicate', value: 'folder/duplicate' },
      { id: '4', name: 'x', value: 'one/x' },
      { id: '5', name: 'x', value: 'two/x' },
    ];
    assert.equal(findTag(tags, 'P/A').id, '1', 'path, case-insensitive');
    assert.equal(findTag(tags, 'A').id, '1', 'unique name');
    assert.equal(findTag(tags, '').id, '2', 'the default name matches the root tag, not folder/duplicate');
    assert.equal(findTag(tags, 'folder/duplicate').id, '3');
    assert.equal(findTag(tags, 'x'), null, 'ambiguous name');
    assert.equal(findTag(tags, 'nope'), null);
    assert.equal(findTag([{ id: '9' }], 'x'), null);
  });

  await t.test('HTTP error is thrown as ImmichApiError', async () => {
    const { fetchImpl } = recorder(fakeResponse({ ok: false, status: 401 }));
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl });
    await assert.rejects(c.getDuplicates(), (e) => e instanceof ImmichApiError && e.status === 401);
  });

  await t.test('error text from the Immich body is included in the message', async () => {
    const forbidden = fakeResponse({ ok: false, status: 403, json: { message: 'Missing required permission: asset.delete' } });
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl: recorder(forbidden).fetchImpl });
    await assert.rejects(c.deleteAssets(['a']), /403.*Missing required permission: asset\.delete/);
    const multi = fakeResponse({ ok: false, status: 400, json: { message: ['a', 'b'] } });
    const c2 = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl: recorder(multi).fetchImpl });
    await assert.rejects(c2.getDuplicates(), /400.*a; b/);
  });

  await t.test('unreadable error body is tolerated', async () => {
    const broken = { ok: false, status: 502, statusText: 'Bad Gateway', json: async () => { throw new Error('html'); } };
    const c = createClient({ baseUrl: 'http://h', apiKey: 'K', fetchImpl: recorder(broken).fetchImpl });
    await assert.rejects(c.getDuplicates(), (e) => e.message === 'HTTP 502 Bad Gateway');
  });

  await t.test('global fetch is used without fetchImpl', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => fakeResponse({ json: [] });
    try {
      const c = createClient({ baseUrl: 'http://h', apiKey: 'K' });
      assert.deepEqual(await c.getDuplicates(), []);
    } finally {
      globalThis.fetch = original;
    }
  });
});
