/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
/* Determines which images are already marked with the duplicate tag. */
(function (global) {
  'use strict';
  const IDup = (global.IDup = global.IDup || {});
  const isNode = typeof module !== 'undefined' && module.exports;
  const api = isNode ? require('./immichApi') : IDup.immichApi;
  const { parseNameList } = isNode ? require('./albums') : IDup.albums;

  const findTag = api.findTag;

  // A tag that does not exist yet is not an error: then nothing is tagged.
  async function loadTaggedAssetIds(client, tagName) {
    const tag = findTag(await client.getTags(), tagName);
    if (!tag) return new Set();
    return new Set(await client.getAssetIdsWithTag(tag.id));
  }

  // Union of the images of all given tags (one tag name per line); unknown names are reported.
  async function loadTagsAssets(client, namesText) {
    const names = parseNameList(namesText);
    if (names.length === 0) return { assetIds: new Set(), missing: [] };
    const tags = await client.getTags();
    const found = [];
    const missing = [];
    for (const name of names) {
      const tag = findTag(tags, name);
      if (tag) found.push(tag);
      else missing.push(name);
    }
    const assetIds = new Set();
    for (const tag of found) (await client.getAssetIdsWithTag(tag.id)).forEach((id) => assetIds.add(id));
    return { assetIds, missing };
  }

  // Removes the tag from all images that carry it. The tag itself remains.
  async function removeTagFromAll(client, tagName) {
    const tag = findTag(await client.getTags(), tagName);
    if (!tag) return { ok: 0, failed: [] };
    const ids = await client.getAssetIdsWithTag(tag.id);
    if (ids.length === 0) return { ok: 0, failed: [] };
    const results = await client.untagAssets(tag.id, ids);
    const failed = results
      .filter((r) => !r.success)
      .map((r) => ({ id: r.id, error: new Error(r.error || 'unknown') }));
    return { ok: results.length - failed.length, failed };
  }

  const exported = { findTag, loadTaggedAssetIds, loadTagsAssets, removeTagFromAll };
  if (isNode) module.exports = exported;
  else IDup.tagged = exported;
})(typeof globalThis !== 'undefined' ? globalThis : this);
