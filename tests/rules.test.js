/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
// KI-generiert
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../js/rules');
const model = require('../js/assetModel');
const { rawAsset } = require('./helpers');

const norm = (o, prefixes = []) => model.normalizeAsset(rawAsset(o), prefixes);
const ALL = { originalPattern: true, duplicateTag: true, preferredTag: true, duplicatePattern: true, preferredAlbum: true, duplicateAlbum: true, externalLibrary: true, readOnly: true, resolution: true, exif: true };
const NONE = { originalPattern: false, duplicateTag: false, preferredTag: false, duplicatePattern: false, preferredAlbum: false, duplicateAlbum: false, externalLibrary: false, readOnly: false, resolution: false, exif: false };
const HARD = { filename: true, timestamp: true };
const settings = (o = {}) => ({ rules: ALL, hard: HARD, readOnlyPrefixes: '', ...o });

test('rules', async (t) => {
  await t.test('compareAssets: rule order external library before resolution', () => {
    const ext = norm({ id: 'e', libraryId: 'l', exifInfo: { exifImageWidth: 10, exifImageHeight: 10 } });
    const big = norm({ id: 'b', exifInfo: { exifImageWidth: 99, exifImageHeight: 99 } });
    assert.ok(rules.compareAssets(ext, big, ALL) > 0);
    assert.ok(rules.compareAssets(big, ext, { ...NONE, resolution: true }) > 0);
  });

  await t.test('compareAssets: readOnly and exif', () => {
    const ro = norm({ id: 'r' }, ['/data']);
    const rw = norm({ id: 'w' });
    assert.ok(rules.compareAssets(ro, rw, { ...NONE, readOnly: true }) > 0);
    const rich = norm({ id: 'x', exifInfo: { make: 'a', model: 'b' } });
    const poor = norm({ id: 'y', exifInfo: {} });
    assert.ok(rules.compareAssets(rich, poor, { ...NONE, exif: true }) > 0);
  });

  await t.test('larger file rule including reason', () => {
    const big = norm({ id: 'b', exifInfo: { fileSizeInByte: 4096 } });
    const small = norm({ id: 's', exifInfo: { fileSizeInByte: 1024 } });
    assert.ok(rules.compareAssets(big, small, { ...NONE, fileSize: true }) > 0);
    const reasons = rules.explain(big, small, { ...NONE, fileSize: true });
    assert.deepEqual(reasons, [{ key: 'reason.fileSize', params: { orig: '4.0 KB', cand: '1.0 KB' } }]);
  });

  await t.test('duplicate album: image in the album loses against an image outside, with reason', () => {
    const inAlbum = model.normalizeAsset(rawAsset({ id: 'w' }), [], { duplicateAlbumAssetIds: new Set(['w']) });
    const outside = model.normalizeAsset(rawAsset({ id: 'o' }), [], { duplicateAlbumAssetIds: new Set(['w']) });
    assert.equal(inAlbum.inDuplicateAlbum, true);
    assert.equal(outside.inDuplicateAlbum, false);
    assert.ok(rules.compareAssets(outside, inAlbum, { ...NONE, duplicateAlbum: true }) > 0);
    assert.deepEqual(rules.explain(outside, inAlbum, { ...NONE, duplicateAlbum: true }), [
      { key: 'reason.duplicateAlbum', params: {} },
    ]);
  });

  await t.test('duplicate album takes precedence over resolution; plan proposes the album image', () => {
    const group = {
      duplicateId: 'g',
      assets: [
        rawAsset({ id: 'big', width: 4000, height: 3000 }),
        rawAsset({ id: 'small', width: 100, height: 100 }),
      ],
    };
    const [plan] = rules.buildPlan([group], settings(), { duplicateAlbumAssetIds: new Set(['big']) });
    assert.equal(plan.original.id, 'small');
    assert.deepEqual(plan.proposals.map((p) => p.asset.id), ['big']);
    const [none] = rules.buildPlan([group], settings());
    assert.equal(none.original.id, 'big');
  });

  await t.test('file name pattern: matching name becomes the preferred duplicate, with reason', () => {
    const { compilePatterns } = require('../js/patterns');
    const { regexes } = compilePatterns('^IMG-\\d{8}-WA');
    const wa = model.normalizeAsset(rawAsset({ id: 'w', originalFileName: 'IMG-20240101-WA0001.jpg' }), [], { duplicatePatterns: regexes });
    const cam = model.normalizeAsset(rawAsset({ id: 'c', originalFileName: 'DSC_0001.jpg' }), [], { duplicatePatterns: regexes });
    assert.equal(wa.matchesDuplicatePattern, true);
    assert.equal(cam.matchesDuplicatePattern, false);
    const only = { ...NONE, duplicatePattern: true };
    assert.ok(rules.compareAssets(cam, wa, only) > 0);
    assert.deepEqual(rules.explain(cam, wa, only), [{ key: 'reason.duplicatePattern', params: {} }]);
  });

  await t.test('preferred album: image in the album wins, with reason', () => {
    const ctx = { preferredAlbumAssetIds: new Set(['p']) };
    const inAlbum = model.normalizeAsset(rawAsset({ id: 'p' }), [], ctx);
    const outside = model.normalizeAsset(rawAsset({ id: 'q' }), [], ctx);
    const only = { ...NONE, preferredAlbum: true };
    assert.ok(rules.compareAssets(inAlbum, outside, only) > 0);
    assert.deepEqual(rules.explain(inAlbum, outside, only), [{ key: 'reason.preferredAlbum', params: {} }]);
  });

  await t.test('tag rules: preferred tag wins, duplicate tag loses, with reason', () => {
    const ctx = { preferredTagAssetIds: new Set(['p']), duplicateTagAssetIds: new Set(['d']) };
    const p = model.normalizeAsset(rawAsset({ id: 'p' }), [], ctx);
    const d = model.normalizeAsset(rawAsset({ id: 'd' }), [], ctx);
    const plain = model.normalizeAsset(rawAsset({ id: 'n' }), [], ctx);
    const prefer = { ...NONE, preferredTag: true };
    assert.ok(rules.compareAssets(p, plain, prefer) > 0);
    assert.deepEqual(rules.explain(p, plain, prefer), [{ key: 'reason.preferredTag', params: {} }]);
    const dup = { ...NONE, duplicateTag: true };
    assert.ok(rules.compareAssets(plain, d, dup) > 0);
    assert.deepEqual(rules.explain(plain, d, dup), [{ key: 'reason.duplicateTag', params: {} }]);
  });

  await t.test('order: duplicate pattern before resolution, preferred album only after file size', () => {
    const config = require('../js/config');
    const order = config.RULE_ORDER;
    assert.ok(order.indexOf('duplicatePattern') < order.indexOf('resolution'));
    assert.ok(order.indexOf('preferredAlbum') > order.indexOf('fileSize'));
  });

  await t.test('original pattern: matching name wins, with reason; no difference without a match', () => {
    const { regexes } = require('../js/patterns').compilePatterns('^\\d{8}_\\d{6}');
    const ctx = { originalPatterns: regexes };
    const cam = model.normalizeAsset(rawAsset({ id: 'c', originalFileName: '20230214_200750.jpg' }), [], ctx);
    const other = model.normalizeAsset(rawAsset({ id: 'o', originalFileName: 'threema-1.jpg' }), [], ctx);
    assert.equal(cam.matchesOriginalPattern, true);
    assert.equal(other.matchesOriginalPattern, false);
    const only = { ...NONE, originalPattern: true };
    assert.ok(rules.compareAssets(cam, other, only) > 0);
    assert.deepEqual(rules.explain(cam, other, only), [{ key: 'reason.originalPattern', params: {} }]);
    const none = model.normalizeAsset(rawAsset({ id: 'n', originalFileName: 'x.jpg' }), []);
    assert.equal(none.matchesOriginalPattern, false);
  });

  await t.test('original pattern: file size comes first, pattern before duplicate pattern', () => {
    const order = require('../js/config').RULE_ORDER;
    assert.ok(order.indexOf('fileSize') < order.indexOf('originalPattern'));
    assert.ok(order.indexOf('originalPattern') < order.indexOf('duplicatePattern'));
  });

  await t.test('order: file size before file name pattern before duplicate album', () => {
    const order = require('../js/config').RULE_ORDER;
    assert.ok(order.indexOf('fileSize') < order.indexOf('duplicatePattern'));
    assert.ok(order.indexOf('duplicatePattern') < order.indexOf('duplicateAlbum'));
    assert.ok(order.indexOf('fileSize') < order.indexOf('preferredAlbum'));
  });

  await t.test('larger file wins over duplicate album membership', () => {
    const ctx = { duplicateAlbumAssetIds: new Set(['big']) };
    const big = model.normalizeAsset(rawAsset({ id: 'big', exifInfo: { fileSizeInByte: 9000 } }), [], ctx);
    const small = model.normalizeAsset(rawAsset({ id: 'small', exifInfo: { fileSizeInByte: 100 } }), [], ctx);
    assert.ok(rules.compareAssets(big, small, { ...ALL, fileSize: true }) > 0);
  });

  await t.test('file size beats file name pattern; with equal size the pattern decides', () => {
    const { regexes } = require('../js/patterns').compilePatterns('^IMG-');
    const ctx = { duplicatePatterns: regexes };
    const wa = model.normalizeAsset(rawAsset({ id: 'w', originalFileName: 'IMG-1.jpg', exifInfo: { fileSizeInByte: 9000 } }), [], ctx);
    const cam = model.normalizeAsset(rawAsset({ id: 'c', originalFileName: 'DSC.jpg', exifInfo: { fileSizeInByte: 100 } }), [], ctx);
    const withSize = { ...ALL, fileSize: true };
    assert.ok(rules.compareAssets(wa, cam, withSize) > 0, 'larger file wins despite the duplicate pattern');
    const waSame = model.normalizeAsset(rawAsset({ id: 'w', originalFileName: 'IMG-1.jpg', exifInfo: { fileSizeInByte: 100 } }), [], ctx);
    assert.ok(rules.compareAssets(cam, waSame, withSize) > 0, 'with equal size the pattern decides');
  });

  await t.test('order: read-only first, then external library, both before file size and pattern', () => {
    const order = require('../js/config').RULE_ORDER;
    assert.deepEqual(order.slice(0, 2), ['readOnly', 'externalLibrary']);
    assert.ok(order.indexOf('externalLibrary') < order.indexOf('duplicatePattern'));
    assert.ok(order.indexOf('externalLibrary') < order.indexOf('fileSize'));
  });

  await t.test('protected image wins despite a smaller file and duplicate pattern', () => {
    const { regexes } = require('../js/patterns').compilePatterns('^IMG_');
    const ctx = { duplicatePatterns: regexes };
    const external = model.normalizeAsset(
      rawAsset({ id: 'e', libraryId: 'lib', originalFileName: 'IMG_1.jpg', exifInfo: { fileSizeInByte: 100 } }), [], ctx);
    const upload = model.normalizeAsset(
      rawAsset({ id: 'u', originalFileName: 'DSC.jpg', exifInfo: { fileSizeInByte: 9000 } }), [], ctx);
    const readOnly = model.normalizeAsset(rawAsset({ id: 'r', originalPath: '/ro/x.jpg' }), ['/ro'], ctx);
    const all = { ...ALL, fileSize: true };
    assert.ok(rules.compareAssets(external, upload, all) > 0);
    assert.ok(rules.compareAssets(readOnly, external, all) > 0, 'read-only before external library');
  });

  await t.test('tie-break: older image, then ID, then equal', () => {
    const old = norm({ id: 'b', fileCreatedAt: '2020-01-01T00:00:00Z' });
    const young = norm({ id: 'a', fileCreatedAt: '2024-01-01T00:00:00Z' });
    assert.ok(rules.compareAssets(old, young, NONE) > 0);
    const same1 = norm({ id: 'a' });
    const same2 = norm({ id: 'b' });
    assert.ok(rules.compareAssets(same1, same2, NONE) > 0);
    assert.equal(rules.compareAssets(same1, same1, NONE), 0);
  });

  await t.test('compareAssets/pickOriginal without a rules object and with an empty list', () => {
    assert.equal(rules.pickOriginal([], ALL), null);
    assert.equal(rules.compareAssets(norm({ id: 'a' }), norm({ id: 'a' }), undefined), 0);
  });

  await t.test('matchesHardRules: file name (case-insensitive) and timestamp with tolerance', () => {
    const a = norm({ originalFileName: 'A.JPG' });
    const b = norm({ originalFileName: 'a.jpg', fileCreatedAt: '2024-05-01T10:00:00.500Z' });
    assert.equal(rules.matchesHardRules(a, b, HARD), true);
    const c = norm({ originalFileName: 'other.jpg' });
    assert.equal(rules.matchesHardRules(a, c, HARD), false);
    const d = norm({ originalFileName: 'A.JPG', fileCreatedAt: '2024-05-01T11:00:00Z' });
    assert.equal(rules.matchesHardRules(a, d, HARD), false);
    assert.equal(rules.matchesHardRules(a, d, { filename: true }), true);
    assert.equal(rules.matchesHardRules(a, d, { timestamp: true }, 4000000), true);
    assert.equal(rules.matchesHardRules(a, d, undefined), true);
  });

  await t.test('matchesHardRules: duplicate pattern lifts the file name rule (both directions, can be switched off)', () => {
    const { regexes } = require('../js/patterns').compilePatterns('^threema-');
    const ctx = { duplicatePatterns: regexes };
    const wa = model.normalizeAsset(rawAsset({ originalFileName: 'threema-1.jpg' }), [], ctx);
    const cam = model.normalizeAsset(rawAsset({ originalFileName: '2023.jpg' }), [], ctx);
    const hard = { filename: true, timestamp: true, patternExemptsFilename: true };
    assert.equal(rules.matchesHardRules(cam, wa, hard), true);
    assert.equal(rules.matchesHardRules(wa, cam, hard), true);
    assert.equal(rules.matchesHardRules(cam, wa, { ...hard, patternExemptsFilename: false }), false);
    const other = model.normalizeAsset(rawAsset({ originalFileName: 'x.jpg' }), [], ctx);
    assert.equal(rules.matchesHardRules(cam, other, hard), false, 'without a pattern match the file name rule applies');
    const late = model.normalizeAsset(rawAsset({ originalFileName: 'threema-1.jpg', fileCreatedAt: '2030-01-01T00:00:00Z' }), [], ctx);
    assert.equal(rules.matchesHardRules(cam, late, hard), false, 'the timestamp rule remains');
  });

  await t.test('matchesHardRules: a missing timestamp does not satisfy the timestamp rule', () => {
    const a = norm({});
    const none = model.normalizeAsset({ id: 'z', originalFileName: 'IMG_0001.jpg' }, []);
    assert.equal(rules.matchesHardRules(a, none, { timestamp: true }), false);
  });

  await t.test('buildGroupPlan: proposal with reason, original, protected, unrelated', () => {
    const group = {
      duplicateId: 'g',
      assets: [
        rawAsset({ id: 'orig', libraryId: 'lib', originalPath: '/safe/orig.jpg', exifInfo: { exifImageWidth: 4000, exifImageHeight: 3000, make: 'c', model: 'm' } }),
        rawAsset({ id: 'small', exifInfo: { exifImageWidth: 800, exifImageHeight: 600 } }),
        rawAsset({ id: 'ro', originalPath: '/safe/x.jpg' }),
        rawAsset({ id: 'series', originalFileName: 'IMG_0002.jpg' }),
      ],
    };
    const plan = rules.buildGroupPlan(group, settings({ readOnlyPrefixes: '/safe' }));
    assert.equal(plan.original.id, 'orig');
    assert.equal(plan.entries[0].role, 'original');
    const role = (id) => plan.entries.find((e) => e.asset.id === id).role;
    assert.equal(role('small'), 'proposal');
    assert.equal(role('ro'), 'protected');
    assert.equal(role('series'), 'unrelated');
    assert.deepEqual(plan.proposals.map((p) => p.asset.id), ['small']);
    const keys = plan.proposals[0].reasons.map((r) => r.key);
    assert.deepEqual(keys, ['reason.readOnly', 'reason.externalLibrary', 'reason.resolution', 'reason.exif']);
    assert.deepEqual(plan.proposals[0].reasons[2].params, { orig: '4000×3000', cand: '800×600' });
  });

  await t.test('stackable contains proposals and protected copies, not the original or series images', () => {
    const group = {
      duplicateId: 'g',
      assets: [
        rawAsset({ id: 'a0', originalPath: '/safe/a0.jpg' }),
        rawAsset({ id: 'b1', originalPath: '/safe/b1.jpg' }),
        rawAsset({ id: 'b2' }),
        rawAsset({ id: 'c1', originalFileName: 'other.jpg' }),
      ],
    };
    const plan = rules.buildGroupPlan(group, settings({ readOnlyPrefixes: '/safe' }));
    const roles = Object.fromEntries(plan.entries.map((e) => [e.asset.id, e.role]));
    assert.equal(roles.c1, 'unrelated');
    const ids = (list) => list.map((e) => e.asset.id).sort();
    assert.deepEqual(ids(plan.stackable), ids(plan.entries.filter((e) => ['proposal', 'protected'].includes(e.role))));
    assert.ok(plan.stackable.every((e) => e.asset.id !== plan.original.id && e.asset.id !== 'c1'));
    assert.ok(plan.stackable.some((e) => e.role === 'protected'));
    assert.equal(rules.targetsFor(plan, 'stack'), plan.stackable);
    assert.equal(rules.targetsFor(plan, 'delete'), plan.proposals);
    assert.equal(rules.targetsFor(plan, 'tag'), plan.proposals);
    assert.equal(rules.targetsFor(plan, undefined), plan.proposals);
    assert.deepEqual(rules.buildGroupPlan({ duplicateId: 'e' }, settings()).stackable, []);
  });

  await t.test('buildGroupPlan: completely equal images -> tie-break reason', () => {
    const group = { duplicateId: 'g', assets: [rawAsset({ id: 'a' }), rawAsset({ id: 'b' })] };
    const plan = rules.buildGroupPlan(group, settings());
    assert.equal(plan.proposals.length, 1);
    assert.equal(plan.proposals[0].reasons[0].key, 'reason.tieBreak');
  });

  await t.test('buildPlan: library import paths protect images without libraryId', () => {
    const group = {
      duplicateId: 'g',
      assets: [
        rawAsset({ id: 'orig', originalPath: '/mnt/lib/IMG_0001.jpg' }),
        rawAsset({ id: 'copy', originalPath: '/data/upload/IMG_0001.jpg' }),
      ],
    };
    const [plan] = rules.buildPlan([group], settings(), { libraryPaths: ['/mnt/lib'] });
    assert.equal(plan.original.id, 'orig');
    assert.equal(plan.original.isExternal, true);
    assert.deepEqual(plan.proposals.map((p) => p.asset.id), ['copy']);
  });

  await t.test('noExternalDetected: warning only with active rule, groups and no external images', () => {
    const plans = rules.buildPlan([{ duplicateId: 'g', assets: [rawAsset({ id: 'a' }), rawAsset({ id: 'b' })] }], settings());
    assert.equal(rules.noExternalDetected(plans, settings()), true);
    assert.equal(rules.noExternalDetected(plans, settings({ rules: NONE })), false);
    assert.equal(rules.noExternalDetected(plans, {}), false);
    assert.equal(rules.noExternalDetected([], settings()), false);
    const ext = rules.buildPlan([{ duplicateId: 'g', assets: [rawAsset({ id: 'a', libraryId: 'l' })] }], settings());
    assert.equal(rules.noExternalDetected(ext, settings()), false);
  });

  await t.test('buildGroupPlan: empty group and buildPlan', () => {
    const plan = rules.buildGroupPlan({ duplicateId: 'e' }, settings());
    assert.equal(plan.original, null);
    assert.deepEqual(plan.entries, []);
    assert.equal(rules.buildPlan([{ duplicateId: 'e' }, { duplicateId: 'f', assets: [] }], settings()).length, 2);
  });
});
