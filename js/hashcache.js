/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
/* Cache for content hashes of downloaded originals, kept in memory and in the browser's storage. */
(function (global) {
  'use strict';
  const IDup = (global.IDup = global.IDup || {});
  const isNode = typeof module !== 'undefined' && module.exports;

  // Entries are { version, hash } per asset ID. The version identifies the file state (checksum, size,
  // modification time); a changed version invalidates the entry. The oldest entries are dropped first.
  function createHashCache({ storage, storageKey, maxEntries }) {
    const entries = new Map();

    try {
      const stored = storage ? JSON.parse(storage.getItem(storageKey) || '{}') : {};
      Object.entries(stored).forEach(([id, entry]) => {
        if (entry && typeof entry.hash === 'string') entries.set(id, entry);
      });
    } catch (e) {
      // unreadable storage: start with an empty cache
    }

    function persist() {
      try {
        if (storage) storage.setItem(storageKey, JSON.stringify(Object.fromEntries(entries)));
      } catch (e) {
        // storage full or blocked: the in-memory cache still works
      }
    }

    function get(id, version) {
      const entry = entries.get(id);
      return entry && entry.version === version ? entry.hash : undefined;
    }

    function set(id, version, hash) {
      entries.delete(id);
      entries.set(id, { version, hash });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
      persist();
    }

    function clear() {
      entries.clear();
      persist();
    }

    return { get, set, clear, size: () => entries.size };
  }

  const api = { createHashCache };
  if (isNode) module.exports = api;
  else IDup.hashcache = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
