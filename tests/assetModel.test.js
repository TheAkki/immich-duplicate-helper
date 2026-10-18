/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
// KI-generiert
const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../js/assetModel');
const { rawAsset } = require('./helpers');

test('assetModel', async (t) => {
  await t.test('parsePrefixes splits on lines/commas and drops empty entries and slashes', () => {
    const labels = (text) => m.parsePrefixes(text).map((p) => p.label);
    assert.deepEqual(labels('/a/\n/b, /c\n\n'), ['/a/', '/b', '/c']);
    assert.deepEqual(labels(undefined), []);
    assert.deepEqual(labels('/a/House, Garden\r\n/b'), ['/a/House, Garden', '/b'], 'a comma inside the path is preserved');
  });

  await t.test('read-only paths: tolerant spellings match the example path (with a space)', () => {
    const path = '/media/extCollections/House/ConstructionDiary/2021/2021 09/IMG_20210910_161631.jpg';
    const variants = [
      '/media/extCollections',
      '/media/extCollections/',
      '"/media/extCollections"',
      "'/media/extCollections'",
      '/media/extcollections',
      '/media//extCollections',
      'media/extCollections',
      '/media/extCollections/*',
      '/media\\extCollections',
      '/x\n/media/extCollections',
      '/media/extCollections/House/ConstructionDiary/2021/2021 09',
    ];
    for (const v of variants) assert.equal(m.isUnderPrefix(path, m.parsePrefixes(v)), true, v);
    for (const v of ['/media/ext', '/media/extCollections2', '/other', '', '/']) {
      assert.equal(m.isUnderPrefix(path, m.parsePrefixes(v)), false, `no match: ${v}`);
    }
  });

  await t.test('findPrefix names the matching entry; strings are accepted as well', () => {
    assert.equal(m.findPrefix('/a/b.jpg', m.parsePrefixes('/x\n"/A/"')), '/A/');
    assert.equal(m.findPrefix('/a/b.jpg', ['/a']), '/a');
    assert.equal(m.findPrefix('/a/b.jpg', ['/zz', '']), null);
    assert.equal(m.findPrefix('/a/b.jpg', undefined), null);
  });

  await t.test('asset remembers the read-only entry', () => {
    const a = m.normalizeAsset(rawAsset({ originalPath: '/ro/x.jpg' }), m.parsePrefixes('/ro'));
    assert.equal(a.isReadOnly, true);
    assert.equal(a.readOnlyPrefix, '/ro');
    assert.equal(m.normalizeAsset(rawAsset(), []).readOnlyPrefix, null);
  });

  await t.test('isUnderPrefix respects directory boundaries', () => {
    assert.equal(m.isUnderPrefix('/a/b.jpg', ['/a']), true);
    assert.equal(m.isUnderPrefix('/a', ['/a']), true);
    assert.equal(m.isUnderPrefix('/ab/b.jpg', ['/a']), false);
    assert.equal(m.isUnderPrefix('/x', []), false);
  });

  await t.test('normalizeAsset computes fields', () => {
    const a = m.normalizeAsset(rawAsset({ libraryId: 'lib' }), ['/data/upload']);
    assert.equal(a.isExternal, true);
    assert.equal(a.isReadOnly, true);
    assert.equal(a.pixels, 1000000);
    assert.equal(a.resolution, '1000×1000');
    assert.deepEqual(a.exifFields, ['make']);
    assert.equal(a.exifScore, 1);
    assert.equal(a.timestamp, Date.parse('2024-05-01T10:00:00.000Z'));
    assert.equal(m.isProtected(a), true);
  });

  await t.test('normalizeAsset is robust without exif/path/date', () => {
    const a = m.normalizeAsset({ id: 'x' }, undefined);
    assert.equal(a.pixels, 0);
    assert.equal(a.resolution, '?');
    assert.equal(a.timestamp, null);
    assert.equal(a.fileName, '');
    assert.equal(m.isProtected(a), false);
  });

  await t.test('formatBytes: units and unknown', () => {
    assert.equal(m.formatBytes(0), '?');
    assert.equal(m.formatBytes(512), '512 B');
    assert.equal(m.formatBytes(1536), '1.5 KB');
    assert.equal(m.formatBytes(5 * 1024 * 1024), '5.0 MB');
    assert.equal(m.formatBytes(3 * 1024 ** 5), '3072.0 TB');
  });

  await t.test('file size is taken from exif', () => {
    const a = m.normalizeAsset(rawAsset({ exifInfo: { fileSizeInByte: 2048 } }), []);
    assert.equal(a.fileSize, 2048);
    assert.equal(a.sizeLabel, '2.0 KB');
    assert.equal(m.normalizeAsset({ id: 'x' }, []).fileSize, 0);
  });

  await t.test('tags: names from the DTO (value before name), missing or empty gives []', () => {
    const tags = [{ name: 'a', value: 'parent/a' }, { name: 'b' }, {}];
    assert.deepEqual(m.tagNamesOf(tags), ['parent/a', 'b']);
    assert.deepEqual(m.tagNamesOf(undefined), []);
    assert.deepEqual(m.tagNamesOf('x'), []);
    assert.deepEqual(m.normalizeAsset(rawAsset({ tags }), []).tagNames, ['parent/a', 'b']);
    assert.deepEqual(m.normalizeAsset(rawAsset(), []).tagNames, []);
  });

  await t.test('checksum and tag membership', () => {
    const a = m.normalizeAsset(rawAsset({ id: 'x', checksum: 'abc=' }), [], {
      duplicateTagAssetIds: new Set(['x']),
      preferredTagAssetIds: new Set(['y']),
    });
    assert.equal(a.checksum, 'abc=');
    assert.equal(a.inDuplicateTag, true);
    assert.equal(a.inPreferredTag, false);
    const none = m.normalizeAsset({ id: 'z' }, []);
    assert.equal(none.checksum, '');
    assert.equal(none.inDuplicateTag, false);
  });

  await t.test('checksum kind: path hash (external library) vs. file hash', () => {
    const { sha1Base64 } = require('../js/sha1');
    const path = '/media/ext/IMG_1.jpg';
    const pathHash = sha1Base64('path:' + path);
    const external = m.normalizeAsset(rawAsset({ originalPath: path, checksum: pathHash }), []);
    assert.equal(external.checksumKind, 'path');
    const uploaded = m.normalizeAsset(rawAsset({ originalPath: '/data/library/IMG_1.jpg', checksum: 'qZk+NkcGgWq6PiVxeFDCbJzQ2J0=' }), []);
    assert.equal(uploaded.checksumKind, 'file');
    assert.equal(uploaded.checksumHex, 'a9993e364706816aba3e25717850c26c9cd0d89d');
    assert.equal(m.normalizeAsset({ id: 'x' }, []).checksumKind, 'unknown');
    assert.equal(m.checksumKindOf('', path), 'unknown');
  });

  await t.test('formatTimestamp: local time as YYYY-MM-DD HH:MM:SS, unknown as ?', () => {
    assert.equal(m.formatTimestamp(new Date(2023, 1, 14, 20, 7, 50).getTime()), '2023-02-14 20:07:50');
    assert.equal(m.formatTimestamp(new Date(2024, 11, 3, 4, 5, 6).getTime()), '2024-12-03 04:05:06');
    assert.equal(m.formatTimestamp(null), '?');
    assert.equal(m.formatTimestamp(undefined), '?');
  });

  await t.test('asset contains the date that rules and the tie-break use as well', () => {
    const ms = new Date(2023, 1, 15, 23, 5, 36).getTime();
    const a = m.normalizeAsset(rawAsset({ exifInfo: { dateTimeOriginal: new Date(ms).toISOString() } }), []);
    assert.equal(a.timestamp, ms);
    assert.equal(a.dateLabel, '2023-02-15 23:05:36');
    assert.equal(m.normalizeAsset({ id: 'x' }, []).dateLabel, '?');
  });

  await t.test('stack info is normalized and summarized per image', () => {
    const stack = { id: 'S', primaryAssetId: 'p', assetCount: 3 };
    assert.deepEqual(m.normalizeStack(stack), stack);
    assert.deepEqual(m.normalizeStack({ id: 'S' }), { id: 'S', primaryAssetId: undefined, assetCount: 0 });
    assert.equal(m.normalizeStack(null), null);
    assert.equal(m.normalizeStack(undefined), null);
    assert.equal(m.normalizeStack({}), null);
    assert.deepEqual(m.stackSummary(stack, 'p'), { inStack: true, count: 3, isPrimary: true });
    assert.deepEqual(m.stackSummary(stack, 'q'), { inStack: true, count: 3, isPrimary: false });
    assert.deepEqual(m.stackSummary(null, 'p'), { inStack: false, count: 0, isPrimary: false });
    assert.deepEqual(m.normalizeAsset(rawAsset({ stack }), []).stackInfo, stack);
    assert.equal(m.normalizeAsset(rawAsset(), []).stackInfo, null);
  });

  await t.test('version identifies the file state: checksum, size and modification time', () => {
    const base = rawAsset({ checksum: 'C', fileModifiedAt: '2024-01-01T00:00:00Z', exifInfo: { fileSizeInByte: 10 } });
    const v1 = m.normalizeAsset(base, []).version;
    assert.equal(v1, 'C|10|2024-01-01T00:00:00Z');
    assert.equal(m.normalizeAsset(base, []).version, v1, 'stable');
    assert.notEqual(m.normalizeAsset({ ...base, checksum: 'D' }, []).version, v1);
    assert.notEqual(m.normalizeAsset({ ...base, fileModifiedAt: '2025-01-01T00:00:00Z' }, []).version, v1);
    assert.notEqual(m.normalizeAsset({ ...base, exifInfo: { fileSizeInByte: 11 } }, []).version, v1);
    assert.equal(m.normalizeAsset({ id: 'x' }, []).version, '|0|');
  });

  await t.test('libraryImportPaths collects the import paths of all libraries', () => {
    const libs = [{ importPaths: ['/mnt/a/', '/mnt/b'] }, { importPaths: [] }, {}];
    assert.deepEqual(m.libraryImportPaths(libs).map((p) => p.label), ['/mnt/a/', '/mnt/b']);
    assert.equal(m.isUnderPrefix('/mnt/a/x.jpg', m.libraryImportPaths(libs)), true);
    assert.deepEqual(m.libraryImportPaths(undefined), []);
  });

  await t.test('external is also detected via a path below an import path (without libraryId)', () => {
    const inLib = m.normalizeAsset(rawAsset({ originalPath: '/mnt/a/x.jpg' }), [], { libraryPaths: ['/mnt/a'] });
    const outside = m.normalizeAsset(rawAsset({ originalPath: '/mnt/ab/x.jpg' }), [], { libraryPaths: ['/mnt/a'] });
    assert.equal(inLib.isExternal, true);
    assert.equal(outside.isExternal, false);
  });

  await t.test('resolution: width/height of the asset take precedence over exif', () => {
    const a = m.normalizeAsset(rawAsset({ width: 4000, height: 3000 }), []);
    assert.equal(a.resolution, '4000×3000');
    assert.equal(a.pixels, 12000000);
  });

  await t.test('exif dateTimeOriginal takes precedence; an invalid date is skipped', () => {
    const a = m.normalizeAsset(
      rawAsset({ fileCreatedAt: 'kaputt', exifInfo: { dateTimeOriginal: '2020-01-01T00:00:00Z' } }),
      []
    );
    assert.equal(a.timestamp, Date.parse('2020-01-01T00:00:00Z'));
    const b = m.normalizeAsset(rawAsset({ fileCreatedAt: 'kaputt', exifInfo: null }), []);
    assert.equal(b.timestamp, null);
  });
});
