/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
// KI-generiert
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNameList, loadAlbumAssets } = require('../js/albums');

function fakeClient({ albums = [], ids = [] } = {}) {
  const calls = { search: [] };
  return {
    calls,
    getAlbums: async () => albums,
    getAssetIdsInAlbums: async (albumIds) => {
      calls.search.push(albumIds);
      return ids;
    },
  };
}

test('albums', async (t) => {
  await t.test('parseNameList: one name per line, empty lines are dropped', () => {
    assert.deepEqual(parseNameList(' A \n\nB, C\n'), ['A', 'B, C']);
    assert.deepEqual(parseNameList(undefined), []);
  });

  await t.test('no API calls without names', async () => {
    const client = { getAlbums: async () => assert.fail('not expected') };
    const r = await loadAlbumAssets(client, '  ');
    assert.equal(r.assetIds.size, 0);
    assert.deepEqual(r.missing, []);
  });

  await t.test('names are mapped to album IDs (case-insensitive); missing ones are reported', async () => {
    const client = fakeClient({
      albums: [{ id: '1', albumName: 'WhatsApp' }, { id: '2', albumName: 'Vacation' }],
      ids: ['x', 'y', 'x'],
    });
    const r = await loadAlbumAssets(client, 'whatsapp\nDoesNotExist');
    assert.deepEqual(client.calls.search, [['1']]);
    assert.deepEqual([...r.assetIds].sort(), ['x', 'y']);
    assert.deepEqual(r.missing, ['DoesNotExist']);
  });

  await t.test('no album found -> no search', async () => {
    const client = fakeClient({ albums: [{ id: '1', albumName: 'A' }] });
    const r = await loadAlbumAssets(client, 'B');
    assert.equal(client.calls.search.length, 0);
    assert.equal(r.assetIds.size, 0);
    assert.deepEqual(r.missing, ['B']);
  });
});
