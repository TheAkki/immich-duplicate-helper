/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
// KI-generiert
const test = require('node:test');
const assert = require('node:assert/strict');
const { findTag, loadTaggedAssetIds, loadTagsAssets, removeTagFromAll } = require('../js/tagged');

const TAGS = [
  { id: '1', name: 'vacation', value: 'vacation' },
  { id: '2', name: 'duplicate', value: 'system/Duplicate' },
];

test('tagged', async (t) => {
  await t.test('findTag: by name or path, case-insensitive, default name for empty input', () => {
    assert.equal(findTag(TAGS, 'VACATION').id, '1');
    assert.equal(findTag(TAGS, 'system/duplicate').id, '2');
    assert.equal(findTag(TAGS, '').id, '2');
    assert.equal(findTag(TAGS, 'doesnotexist'), null);
    assert.equal(findTag([{ id: '3' }], 'x'), null);
  });

  await t.test('loadTaggedAssetIds returns the IDs of the found tag', async () => {
    const calls = [];
    const client = {
      getTags: async () => TAGS,
      getAssetIdsWithTag: async (id) => { calls.push(id); return ['a', 'b', 'a']; },
    };
    const ids = await loadTaggedAssetIds(client, 'duplicate');
    assert.deepEqual(calls, ['2']);
    assert.deepEqual([...ids].sort(), ['a', 'b']);
  });

  await t.test('loadTagsAssets: union of several tags, unknown ones reported', async () => {
    const searched = [];
    const client = {
      getTags: async () => TAGS,
      getAssetIdsWithTag: async (id) => { searched.push(id); return id === '1' ? ['a', 'b'] : ['b', 'c']; },
    };
    const r = await loadTagsAssets(client, 'vacation\nDuplicate\nnope');
    assert.deepEqual(searched, ['1', '2']);
    assert.deepEqual([...r.assetIds].sort(), ['a', 'b', 'c']);
    assert.deepEqual(r.missing, ['nope']);
  });

  await t.test('loadTagsAssets: no calls without names; only unknown tags -> no search', async () => {
    const never = { getTags: async () => assert.fail('not expected') };
    assert.equal((await loadTagsAssets(never, '  ')).assetIds.size, 0);
    const client = { getTags: async () => [], getAssetIdsWithTag: async () => assert.fail('not expected') };
    const r = await loadTagsAssets(client, 'x');
    assert.equal(r.assetIds.size, 0);
    assert.deepEqual(r.missing, ['x']);
  });

  await t.test('removeTagFromAll: removes the tag from all images and counts errors', async () => {
    const calls = [];
    const client = {
      getTags: async () => TAGS,
      getAssetIdsWithTag: async () => ['a', 'b', 'c'],
      untagAssets: async (tagId, ids) => {
        calls.push([tagId, ids]);
        return [{ id: 'a', success: true }, { id: 'b', success: true }, { id: 'c', success: false, error: 'no_permission' }];
      },
    };
    const r = await removeTagFromAll(client, 'vacation');
    assert.deepEqual(calls, [['1', ['a', 'b', 'c']]]);
    assert.equal(r.ok, 2);
    assert.deepEqual(r.failed.map((f) => [f.id, f.error.message]), [['c', 'no_permission']]);
  });

  await t.test('removeTagFromAll: missing tag or no images -> no change', async () => {
    const never = { getTags: async () => [], untagAssets: async () => assert.fail('not expected') };
    assert.deepEqual(await removeTagFromAll(never, 'x'), { ok: 0, failed: [] });
    const empty = { getTags: async () => TAGS, getAssetIdsWithTag: async () => [], untagAssets: async () => assert.fail('not expected') };
    assert.deepEqual(await removeTagFromAll(empty, 'vacation'), { ok: 0, failed: [] });
    const unknown = { getTags: async () => TAGS, getAssetIdsWithTag: async () => ['a'], untagAssets: async () => [{ id: 'a', success: false }] };
    assert.equal((await removeTagFromAll(unknown, 'vacation')).failed[0].error.message, 'unknown');
  });

  await t.test('tag does not exist: empty set, no search', async () => {
    const client = { getTags: async () => [], getAssetIdsWithTag: async () => assert.fail('not expected') };
    assert.equal((await loadTaggedAssetIds(client, 'duplicate')).size, 0);
  });
});
