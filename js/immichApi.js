/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
/* Thin client for the Immich REST API. */
(function (global) {
  'use strict';
  const IDup = (global.IDup = global.IDup || {});
  const isNode = typeof module !== 'undefined' && module.exports;
  const config = isNode ? require('./config') : IDup.config;
  const { tagNamesOf, normalizeStack } = isNode ? require('./assetModel') : IDup.assetModel;

  class ImmichApiError extends Error {
    constructor(message, status) {
      super(message);
      this.name = 'ImmichApiError';
      this.status = status;
    }
  }

  function normalizeBaseUrl(input) {
    const trimmed = String(input || '').trim().replace(/\/+$/, '');
    if (!trimmed) throw new ImmichApiError('Server URL is empty');
    return /^https?:\/\//i.test(trimmed) ? trimmed : config.DEFAULT_SCHEME + trimmed;
  }

  function normalizeTagName(input) {
    return String(input || '').trim() || config.DEFAULT_TAG_NAME;
  }

  // Compares {major, minor, patch}; negative, 0 or positive.
  function compareVersions(a, b) {
    return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
  }

  // Unknown version: classic search, because it is assumed to work on all servers.
  function searchModeFor(version) {
    const modes = config.SEARCH_MODES;
    if (!version) return modes.LEGACY;
    return compareVersions(version, config.FILTER_SEARCH_MIN_VERSION) >= 0 ? modes.FILTER : modes.LEGACY;
  }

  function formatVersion(version) {
    if (!version) return config.UNKNOWN_VALUE;
    return `${version.major}.${version.minor}.${version.patch}`;
  }

  // Finds a tag, case-insensitive: an exact match of the full path (value) wins; otherwise a name that
  // is unique among all tags. An ambiguous name (e.g. "a/x" and "b/x") finds nothing instead of the wrong tag.
  function findTag(tags, tagName) {
    const wanted = normalizeTagName(tagName).toLowerCase();
    const lower = (v) => String(v || '').toLowerCase();
    const byPath = tags.find((tag) => lower(tag.value) === wanted);
    if (byPath) return byPath;
    const byName = tags.filter((tag) => lower(tag.name) === wanted);
    return byName.length === 1 ? byName[0] : null;
  }

  // Per-image results of a bulk call: [{ id, success, error }]. "duplicate" (already tagged) counts as success.
  function failedResults(results) {
    return (Array.isArray(results) ? results : []).filter((r) => !r.success && r.error !== 'duplicate');
  }

  function chunk(items, size) {
    const result = [];
    for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
    return result;
  }

  // Immich returns error texts as JSON {message}; an unreadable body is not an error.
  async function readErrorDetail(response) {
    try {
      const body = await response.json();
      const message = body && body.message;
      return Array.isArray(message) ? message.join('; ') : message || '';
    } catch (e) {
      return '';
    }
  }

  function createClient({ baseUrl, apiKey, fetchImpl }) {
    if (!apiKey) throw new ImmichApiError('Access token is empty');
    const root = normalizeBaseUrl(baseUrl) + config.API_PREFIX;
    const doFetch = fetchImpl || ((...args) => global.fetch(...args));

    async function request(path, { method = 'GET', body, cache = 'no-store' } = {}) {
      const headers = { [config.API_KEY_HEADER]: apiKey, Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await doFetch(root + path, {
        method,
        headers,
        // Never reuse cached answers by default: tags, stacks and albums change while the page is open.
        cache,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok) {
        const detail = await readErrorDetail(response);
        const base = `HTTP ${response.status} ${response.statusText || ''}`.trim();
        throw new ImmichApiError(detail ? `${base}: ${detail}` : base, response.status);
      }
      return response;
    }

    async function getDuplicates() {
      const response = await request(config.ENDPOINTS.DUPLICATES);
      return response.json();
    }

    async function getLibraries() {
      const response = await request(config.ENDPOINTS.LIBRARIES);
      return response.json();
    }

    async function getAlbums() {
      const response = await request(config.ENDPOINTS.ALBUMS);
      return response.json();
    }

    let versionPromise = null;

    // The version is determined once; if that fails it is unknown (null).
    function getServerVersion() {
      if (!versionPromise) {
        versionPromise = request(config.ENDPOINTS.SERVER_VERSION)
          .then((response) => response.json())
          .catch(() => null);
      }
      return versionPromise;
    }

    async function getSearchMode() {
      return searchModeFor(await getServerVersion());
    }

    // One page of the metadata search; returns { ids, next } in the form of the respective mode.
    async function searchPage(mode, key, id, next) {
      const modes = config.SEARCH_MODES;
      const body =
        mode === modes.FILTER
          ? { filter: { [key]: { any: [id] } }, size: config.SEARCH_PAGE_SIZE, ...(next ? { cursor: next } : {}) }
          : { [key]: [id], page: next, size: config.SEARCH_PAGE_SIZE };
      const response = await request(config.ENDPOINTS.SEARCH_METADATA, { method: 'POST', body });
      const { assets } = await response.json();
      const following = mode === modes.FILTER ? assets.nextCursor : parseInt(assets.nextPage, 10) || 0;
      return { ids: assets.items.map((item) => item.id), next: following };
    }

    // key: "albumIds" or "tagIds"; the access path depends on the server version.
    async function searchAssetIds(key, id) {
      const mode = await getSearchMode();
      const ids = [];
      let next = mode === config.SEARCH_MODES.FILTER ? '' : 1;
      for (let i = 0; next !== null && next !== 0 && i < config.MAX_SEARCH_PAGES; i += 1) {
        const page = await searchPage(mode, key, id, next);
        ids.push(...page.ids);
        next = page.next || 0;
      }
      return ids;
    }

    async function getAssetIdsInAlbums(albumIds) {
      const perAlbum = [];
      for (const id of albumIds) perAlbum.push(await searchAssetIds('albumIds', id));
      return [...new Set(perAlbum.flat())];
    }

    const getAssetIdsWithTag = (tagId) => searchAssetIds('tagIds', tagId);

    async function getTags() {
      const response = await request(config.ENDPOINTS.TAGS);
      return response.json();
    }

    // Asset details: unlike the duplicates endpoint they include the tags and the stack.
    async function getAssetDetails(assetId) {
      const response = await request(`${config.ENDPOINTS.ASSETS}/${encodeURIComponent(assetId)}`);
      const asset = await response.json();
      return { tagNames: tagNamesOf(asset.tags), stack: normalizeStack(asset.stack) };
    }

    async function getOriginalBytes(assetId) {
      const path = `${config.ENDPOINTS.ASSETS}/${encodeURIComponent(assetId)}${config.ENDPOINTS.ORIGINAL_SUFFIX}`;
      const response = await request(path);
      return new Uint8Array(await response.arrayBuffer());
    }

    async function getAlbumNames(assetId) {
      const query = `?assetId=${encodeURIComponent(assetId)}`;
      const response = await request(config.ENDPOINTS.ALBUMS + query);
      const albums = await response.json();
      return albums.map((album) => album.albumName);
    }

    async function deleteAssets(ids) {
      for (const batch of chunk(ids, config.API_BATCH_SIZE)) {
        await request(config.ENDPOINTS.ASSETS, {
          method: 'DELETE',
          body: { ids: batch, force: config.FORCE_DELETE },
        });
      }
    }

    async function createStack(assetIds) {
      const response = await request(config.ENDPOINTS.STACKS, { method: 'POST', body: { assetIds } });
      return response.json();
    }

    // Uses an existing tag (needs only tag.read); creates it only if it does not exist yet (needs tag.create).
    async function findOrCreateTag(name) {
      const existing = findTag(await (await request(config.ENDPOINTS.TAGS)).json(), name);
      if (existing) return existing;
      const created = await request(config.ENDPOINTS.TAGS, { method: 'PUT', body: { tags: [name] } });
      return (await created.json())[0];
    }

    // Assigns the tag per image (PUT /tags/{id}/assets), which reports a result for every image. The bulk
    // endpoint PUT /tags/assets silently skips images without access and still answers 200.
    async function tagAssets(tagName, assetIds) {
      const tag = await findOrCreateTag(normalizeTagName(tagName));
      const results = [];
      for (const batch of chunk(assetIds, config.API_BATCH_SIZE)) {
        const path = `${config.ENDPOINTS.TAGS}/${encodeURIComponent(tag.id)}${config.ENDPOINTS.TAG_ASSETS_SUFFIX}`;
        const response = await request(path, { method: 'PUT', body: { ids: batch } });
        results.push(...(await response.json()));
      }
      const failed = failedResults(results);
      if (failed.length) {
        const reasons = [...new Set(failed.map((r) => r.errorMessage || r.error || 'unknown'))].join(', ');
        throw new ImmichApiError(`Immich did not tag ${failed.length} image(s) with "${tag.value || tag.name}": ${reasons}`);
      }
      return { tag, results };
    }

    // Removes the tag from the images; Immich reports the result per image: [{ id, success, error }].
    async function untagAssets(tagId, assetIds) {
      const results = [];
      for (const batch of chunk(assetIds, config.API_BATCH_SIZE)) {
        const path = `${config.ENDPOINTS.TAGS}/${encodeURIComponent(tagId)}${config.ENDPOINTS.TAG_ASSETS_SUFFIX}`;
        const response = await request(path, { method: 'DELETE', body: { ids: batch } });
        results.push(...(await response.json()));
      }
      return results;
    }

    async function getThumbnail(id) {
      const path = `${config.ENDPOINTS.ASSETS}/${encodeURIComponent(id)}${config.ENDPOINTS.THUMBNAIL_SUFFIX}?size=${config.THUMBNAIL_SIZE}`;
      // Thumbnails rarely change: let the browser cache them to save traffic.
      const response = await request(path, { cache: 'default' });
      return response.blob();
    }

    return { getDuplicates, getLibraries, getServerVersion, getSearchMode, getAlbums, getAssetIdsInAlbums, getAssetIdsWithTag, getTags, getAssetDetails, getOriginalBytes, getAlbumNames, deleteAssets, createStack, tagAssets, untagAssets, getThumbnail };
  }

  const api = { createClient, normalizeBaseUrl, normalizeTagName, findTag, compareVersions, searchModeFor, formatVersion, chunk, ImmichApiError };
  if (isNode) module.exports = api;
  else IDup.immichApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
