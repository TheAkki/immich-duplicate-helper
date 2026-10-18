/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
/* Converts Immich asset DTOs into the internal model. */
(function (global) {
  'use strict';
  const IDup = (global.IDup = global.IDup || {});
  const isNode = typeof module !== 'undefined' && module.exports;
  const config = isNode ? require('./config') : IDup.config;
  const patterns = isNode ? require('./patterns') : IDup.patterns;
  const sha1 = isNode ? require('./sha1') : IDup.sha1;

  // Normalizes paths for comparison: no quotes or trailing wildcard, "/" as separator,
  // no duplicate or trailing slashes, leading slash added (case is ignored when matching).
  function normalizePath(path) {
    const cleaned = String(path || '')
      .trim()
      .replace(/^["']+|["']+$/g, '')
      .replace(/\\/g, '/')
      .replace(/\/\*+$/, '')
      .replace(/\/{2,}/g, '/')
      .replace(/\/+$/, '');
    return cleaned && !cleaned.startsWith('/') ? `/${cleaned}` : cleaned;
  }

  function toPrefix(text) {
    return { label: String(text).trim().replace(/^["']+|["']+$/g, ''), key: normalizePath(text).toLowerCase() };
  }

  function parsePrefixes(text) {
    return String(text || '')
      .split(config.PATH_PREFIX_SEPARATOR)
      .map(toPrefix)
      .filter((p) => p.key);
  }

  // Returns the first matching entry (as it was entered) or null.
  function findPrefix(path, prefixes) {
    const key = normalizePath(path).toLowerCase();
    const entries = (prefixes || []).map((p) => (typeof p === 'string' ? toPrefix(p) : p)).filter((p) => p.key);
    const hit = entries.find((p) => key === p.key || key.startsWith(`${p.key}/`));
    return hit ? hit.label : null;
  }

  function isUnderPrefix(path, prefixes) {
    return findPrefix(path, prefixes) !== null;
  }

  function parseTimestamp(...candidates) {
    for (const value of candidates) {
      const ms = value ? Date.parse(value) : NaN;
      if (!Number.isNaN(ms)) return ms;
    }
    return null;
  }

  function presentExifFields(exif) {
    if (!exif) return [];
    return config.EXIF_FIELDS.filter((f) => exif[f] !== null && exif[f] !== undefined && exif[f] !== '');
  }

  function formatResolution(width, height) {
    if (!width || !height) return config.UNKNOWN_VALUE;
    return `${width}${config.RESOLUTION_SEPARATOR}${height}`;
  }

  function formatBytes(bytes) {
    if (!bytes) return config.UNKNOWN_VALUE;
    const lastUnit = config.BYTE_UNITS.length - 1;
    let value = bytes;
    let unit = 0;
    while (value >= config.BYTES_PER_UNIT && unit < lastUnit) {
      value /= config.BYTES_PER_UNIT;
      unit += 1;
    }
    const text = unit === 0 ? String(value) : value.toFixed(1);
    return `${text} ${config.BYTE_UNITS[unit]}`;
  }

  // Tag names from the asset DTO; if missing or empty they are loaded on demand.
  function tagNamesOf(tags) {
    return (Array.isArray(tags) ? tags : []).map((tag) => tag.value || tag.name).filter(Boolean);
  }

  // Path hash (external library) vs. hash of the file content: the API does not name the method,
  // so the path hash is recomputed and compared.
  function checksumKindOf(checksum, path) {
    const kinds = config.CHECKSUM_KINDS;
    if (!checksum) return kinds.UNKNOWN;
    return sha1.sha1Base64(config.CHECKSUM_PATH_PREFIX + path) === checksum ? kinds.PATH : kinds.FILE;
  }

  // Stack info {id, primaryAssetId, assetCount} as delivered by Immich, or null. The duplicates endpoint
  // does not include it; the asset details endpoint does.
  function normalizeStack(stack) {
    if (!stack || !stack.id) return null;
    return { id: stack.id, primaryAssetId: stack.primaryAssetId, assetCount: stack.assetCount || 0 };
  }

  // What to show for an image: whether it is in a stack, how many images the stack has, and if it is the primary one.
  function stackSummary(stack, assetId) {
    const info = normalizeStack(stack);
    if (!info) return { inStack: false, count: 0, isPrimary: false };
    return { inStack: true, count: info.assetCount, isPrimary: info.primaryAssetId === assetId };
  }

  const pad2 = (n) => String(n).padStart(2, '0');

  // Date and time in the browser's time zone: YYYY-MM-DD HH:MM:SS.
  function formatTimestamp(ms) {
    if (ms === null || ms === undefined) return config.UNKNOWN_VALUE;
    const d = new Date(ms);
    const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    return `${date} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }

  function libraryImportPaths(libraries) {
    return (libraries || []).flatMap((lib) => parsePrefixes((lib.importPaths || []).join('\n')));
  }

  // libraryId is marked as deprecated in the Immich API; additionally, a path below
  // an import path of a library counts as external.
  function isExternalAsset(raw, path, libraryPaths) {
    return Boolean(raw.libraryId) || isUnderPrefix(path, libraryPaths || []);
  }

  function normalizeAsset(raw, readOnlyPrefixes, context = {}) {
    const { libraryPaths, duplicateAlbumAssetIds, preferredAlbumAssetIds, duplicatePatterns } = context;
    const { duplicateTagAssetIds, preferredTagAssetIds, originalPatterns } = context;
    const exif = raw.exifInfo || null;
    const path = raw.originalPath || '';
    const width = raw.width || (exif && exif.exifImageWidth) || 0;
    const height = raw.height || (exif && exif.exifImageHeight) || 0;
    const exifFields = presentExifFields(exif);
    const fileSize = (exif && exif.fileSizeInByte) || 0;
    const isExternal = isExternalAsset(raw, path, libraryPaths);
    const readOnlyPrefix = findPrefix(path, readOnlyPrefixes);
    const timestamp = parseTimestamp(exif && exif.dateTimeOriginal, raw.fileCreatedAt, raw.localDateTime);
    return {
      id: raw.id,
      fileName: raw.originalFileName || '',
      path,
      isExternal,
      isReadOnly: readOnlyPrefix !== null,
      readOnlyPrefix,
      width,
      height,
      pixels: width * height,
      resolution: formatResolution(width, height),
      timestamp,
      dateLabel: formatTimestamp(timestamp),
      exifFields,
      exifScore: exifFields.length,
      fileSize,
      tagNames: tagNamesOf(raw.tags),
      stackInfo: normalizeStack(raw.stack),
      inDuplicateAlbum: Boolean(duplicateAlbumAssetIds && duplicateAlbumAssetIds.has(raw.id)),
      inDuplicateTag: Boolean(duplicateTagAssetIds && duplicateTagAssetIds.has(raw.id)),
      inPreferredTag: Boolean(preferredTagAssetIds && preferredTagAssetIds.has(raw.id)),
      // Identifies the state of the file; a change invalidates cached content hashes
      version: [raw.checksum || '', fileSize, raw.fileModifiedAt || ''].join('|'),
      checksum: raw.checksum || '',
      checksumKind: checksumKindOf(raw.checksum, path),
      checksumHex: sha1.base64ToHex(raw.checksum || ''),
      inPreferredAlbum: Boolean(preferredAlbumAssetIds && preferredAlbumAssetIds.has(raw.id)),
      matchesDuplicatePattern: patterns.matchesAny(raw.originalFileName || '', duplicatePatterns),
      matchesOriginalPattern: patterns.matchesAny(raw.originalFileName || '', originalPatterns),
      sizeLabel: formatBytes(fileSize),
    };
  }

  function isProtected(asset) {
    return asset.isExternal || asset.isReadOnly;
  }

  const api = { parsePrefixes, normalizePath, findPrefix, isUnderPrefix, normalizeAsset, libraryImportPaths, normalizeStack, stackSummary, formatTimestamp, checksumKindOf, tagNamesOf, formatBytes, isProtected, formatResolution };
  if (isNode) module.exports = api;
  else IDup.assetModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
