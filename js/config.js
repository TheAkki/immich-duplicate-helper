/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
/* Central constants and default values. */
(function (global) {
  'use strict';
  const IDup = (global.IDup = global.IDup || {});
  const isNode = typeof module !== 'undefined' && module.exports;

  const config = Object.freeze({
    API_PREFIX: '/api',
    ENDPOINTS: Object.freeze({
      DUPLICATES: '/duplicates',
      ASSETS: '/assets',
      STACKS: '/stacks',
      LIBRARIES: '/libraries',
      ALBUMS: '/albums',
      SEARCH_METADATA: '/search/metadata',
      SERVER_VERSION: '/server/version',
      ORIGINAL_SUFFIX: '/original',
      TAGS: '/tags',
      TAG_ASSETS_SUFFIX: '/assets',
      THUMBNAIL_SUFFIX: '/thumbnail',
    }),
    API_KEY_HEADER: 'x-api-key',
    THUMBNAIL_SIZE: 'thumbnail',
    // false = Immich trash, true = delete permanently
    FORCE_DELETE: false,
    API_BATCH_SIZE: 100,
    MAX_CONCURRENT_REQUESTS: 4,
    // Concurrent downloads for the byte-identical check (originals can be large)
    MAX_CONCURRENT_DOWNLOADS: 2,
    // From this Immich version on the search object "filter" exists (flat fields are deprecated)
    FILTER_SEARCH_MIN_VERSION: Object.freeze({ major: 3, minor: 2, patch: 0 }),
    SEARCH_MODES: Object.freeze({ FILTER: 'filter', LEGACY: 'legacy' }),
    SEARCH_PAGE_SIZE: 1000,
    MAX_SEARCH_PAGES: 1000,
    LINE_SEPARATOR: /\n+/,
    PATTERN_FLAGS: 'i',
    BYTE_UNITS: Object.freeze(['B', 'KB', 'MB', 'GB', 'TB']),
    BYTES_PER_UNIT: 1024,
    // In external libraries Immich derives the checksum from SHA-1 of "path:" + path (not from the file content)
    CHECKSUM_PATH_PREFIX: 'path:',
    IDENTITY: Object.freeze({
      VERDICTS: Object.freeze({ IDENTICAL: 'identical', DIFFERENT: 'different' }),
      METHODS: Object.freeze({ SIZE: 'size', CHECKSUM: 'checksum', CONTENT: 'content' }),
    }),
    CHECKSUM_KINDS: Object.freeze({ FILE: 'file', PATH: 'path', UNKNOWN: 'unknown' }),
    DEFAULT_TAG_NAME: 'duplicate',
    DEFAULT_SCHEME: 'http://',

    TIMESTAMP_TOLERANCE_MS: 1000,
    RESOLUTION_SEPARATOR: '×',
    UNKNOWN_VALUE: '?',
    EXIF_FIELDS: Object.freeze([
      'make',
      'model',
      'lensModel',
      'dateTimeOriginal',
      'latitude',
      'longitude',
      'exposureTime',
      'fNumber',
      'iso',
      'focalLength',
    ]),

    // Order in which active preference rules are evaluated
    RULE_ORDER: Object.freeze([
      'readOnly',
      'externalLibrary',
      'fileSize',
      'originalPattern',
      'duplicatePattern',
      'duplicateAlbum',
      'duplicateTag',
      'resolution',
      'exif',
      'preferredAlbum',
      'preferredTag',
    ]),
    ACTIONS: Object.freeze({ DELETE: 'delete', STACK: 'stack', TAG: 'tag' }),
    ROLES: Object.freeze({
      ORIGINAL: 'original',
      PROPOSAL: 'proposal',
      PROTECTED: 'protected',
      UNRELATED: 'unrelated',
    }),

    DEFAULT_LANGUAGE: 'de',
    FALLBACK_LANGUAGE: 'en',
    STORAGE_KEY: 'immichDuplicate.settings',
    // Content hashes of downloaded originals are kept so that files are not downloaded again
    HASH_CACHE_STORAGE_KEY: 'immichDuplicate.contentHashes',
    HASH_CACHE_MAX_ENTRIES: 5000,
    // Three-state display filters: off, show only the matching groups, hide the matching groups
    FILTER_MODES: Object.freeze({ OFF: 'off', ONLY: 'only', HIDE: 'hide' }),
    UNLIMITED: 'all',
    LIMIT_OPTIONS: Object.freeze(['5', '10', '20', '50', '100', '200', '500', 'all']),
    // A new line or a comma after which another absolute path starts (commas inside paths are preserved)
    PATH_PREFIX_SEPARATOR: /\r?\n|,\s*(?=\/)/,

    DEFAULT_SETTINGS: Object.freeze({
      serverUrl: '',
      language: 'de',
      readOnlyPrefixes: '',
      duplicateAlbums: '',
      preferredAlbums: '',
      duplicateTags: '',
      preferredTags: '',
      duplicateFilePatterns: '',
      originalFilePatterns: '',
      action: 'delete',
      autoVerify: true,
      tagName: 'duplicate',
      skipTagName: 'skip',
      rules: Object.freeze({
        duplicateAlbum: true,
        duplicatePattern: true,
        originalPattern: true,
        preferredAlbum: true,
        duplicateTag: true,
        preferredTag: true,
        externalLibrary: true,
        readOnly: true,
        resolution: true,
        exif: true,
        fileSize: true,
      }),
      hard: Object.freeze({ filename: true, timestamp: true, patternExemptsFilename: true }),
      filters: Object.freeze({
        hideProtectedOnlyGroups: true,
        hideGroupsWithoutProposals: true,
        hideAllTagged: true,
        hideSkipped: true,
        onlySameFilename: false,
        onlyProtectedDuplicates: false,
        sameNameOtherType: 'off',
        sameNameAllProtected: 'off',
        search: '',
        limit: '20',
      }),
    }),
  });

  if (isNode) module.exports = config;
  else IDup.config = config;
})(typeof globalThis !== 'undefined' ? globalThis : this);
