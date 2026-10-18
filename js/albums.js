/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
/* Determines which images are in the configured albums. */
(function (global) {
  'use strict';
  const IDup = (global.IDup = global.IDup || {});
  const isNode = typeof module !== 'undefined' && module.exports;
  const config = isNode ? require('./config') : IDup.config;

  function parseNameList(text) {
    return String(text || '')
      .split(config.LINE_SEPARATOR)
      .map((name) => name.trim())
      .filter(Boolean);
  }

  // Returns { assetIds: Set, missing: [names without a matching album] }. Names match exactly, case-insensitive.
  async function loadAlbumAssets(client, namesText) {
    const names = parseNameList(namesText);
    if (names.length === 0) return { assetIds: new Set(), missing: [] };
    const albums = await client.getAlbums();
    const byName = new Map(albums.map((a) => [a.albumName.toLowerCase(), a.id]));
    const found = names.filter((n) => byName.has(n.toLowerCase()));
    const missing = names.filter((n) => !byName.has(n.toLowerCase()));
    if (found.length === 0) return { assetIds: new Set(), missing };
    const ids = await client.getAssetIdsInAlbums(found.map((n) => byName.get(n.toLowerCase())));
    return { assetIds: new Set(ids), missing };
  }

  const api = { parseNameList, loadAlbumAssets };
  if (isNode) module.exports = api;
  else IDup.albums = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
