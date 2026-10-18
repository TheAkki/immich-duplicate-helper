/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
/* KI-generiert: test helpers for building Immich asset DTOs. */
function rawAsset(overrides = {}) {
  return {
    id: 'a1',
    originalFileName: 'IMG_0001.jpg',
    originalPath: '/data/upload/IMG_0001.jpg',
    libraryId: null,
    fileCreatedAt: '2024-05-01T10:00:00.000Z',
    exifInfo: { exifImageWidth: 1000, exifImageHeight: 1000, make: 'Canon' },
    ...overrides,
  };
}

function fakeResponse({ ok = true, status = 200, json, blob } = {}) {
  return { ok, status, statusText: ok ? 'OK' : 'Err', json: async () => json, blob: async () => blob };
}

module.exports = { rawAsset, fakeResponse };
