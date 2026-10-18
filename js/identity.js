/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
/* Checks whether two images are byte-identical, avoiding a download where possible. */
(function (global) {
  'use strict';
  const IDup = (global.IDup = global.IDup || {});
  const isNode = typeof module !== 'undefined' && module.exports;
  const config = isNode ? require('./config') : IDup.config;
  const sha1 = isNode ? require('./sha1') : IDup.sha1;

  const { VERDICTS, METHODS } = config.IDENTITY;

  // Result without a download, otherwise null. Path hashes (external library) say nothing about the content.
  function quickCheck(a, b) {
    if (a.fileSize > 0 && b.fileSize > 0 && a.fileSize !== b.fileSize) {
      return { verdict: VERDICTS.DIFFERENT, method: METHODS.SIZE };
    }
    const kinds = config.CHECKSUM_KINDS;
    if (a.checksumKind === kinds.FILE && b.checksumKind === kinds.FILE) {
      const same = a.checksum === b.checksum;
      return { verdict: same ? VERDICTS.IDENTICAL : VERDICTS.DIFFERENT, method: METHODS.CHECKSUM };
    }
    return null;
  }

  // Content hash of an original: taken from the cache, otherwise downloaded and hashed once. Concurrent
  // requests for the same asset share one download, and a hash is reused for every pair the asset is in.
  function createContentHasher({ fetchBytes, cache }) {
    const pending = new Map();
    return function hashOf(asset) {
      const cached = cache.get(asset.id, asset.version);
      if (cached !== undefined) return Promise.resolve(cached);
      if (!pending.has(asset.id)) {
        const promise = fetchBytes(asset.id)
          .then((bytes) => {
            const hash = sha1.sha1BytesBase64(bytes);
            cache.set(asset.id, asset.version, hash);
            return hash;
          })
          .finally(() => pending.delete(asset.id));
        pending.set(asset.id, promise);
      }
      return pending.get(asset.id);
    };
  }

  // Compares the contents via their hashes, one file after the other (to save memory).
  async function compareContents(hashOf, a, b) {
    const quick = quickCheck(a, b);
    if (quick) return quick;
    const hashA = await hashOf(a);
    const hashB = await hashOf(b);
    return { verdict: hashA === hashB ? VERDICTS.IDENTICAL : VERDICTS.DIFFERENT, method: METHODS.CONTENT };
  }

  // Remembers results per pair (original, copy) so that redrawing does not download again.
  // Failed checks are forgotten and can be repeated.
  function createVerifier(compare) {
    const cache = new Map();
    function verify(original, asset) {
      const key = `${original.id}:${original.version}|${asset.id}:${asset.version}`;
      if (!cache.has(key)) {
        const promise = compare(original, asset);
        promise.catch(() => cache.delete(key));
        cache.set(key, promise);
      }
      return cache.get(key);
    }
    return { verify, clear: () => cache.clear() };
  }

  // CSS class for the card: pairs that are not byte-identical get a red background.
  function cardClass(result) {
    return result && result.verdict === VERDICTS.DIFFERENT ? 'verify-different' : '';
  }

  const api = { quickCheck, compareContents, createContentHasher, createVerifier, cardClass };
  if (isNode) module.exports = api;
  else IDup.identity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
