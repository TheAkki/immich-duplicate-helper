/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
// KI-generiert
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../js/rules');
const { applyFilters } = require('../js/filters');
const { rawAsset } = require('./helpers');

const S = {
  rules: { resolution: true },
  hard: { filename: true },
  readOnlyPrefixes: '/ro',
};
const plan = (assets) => rules.buildGroupPlan({ duplicateId: 'g', assets }, S);

test('filters', async (t) => {
  const onlyRo = plan([
    rawAsset({ id: 'a', originalPath: '/ro/a.jpg' }),
    rawAsset({ id: 'b', originalPath: '/ro/b.jpg' }),
  ]);
  const normal = plan([
    rawAsset({ id: 'c', originalPath: '/x/IMG_0001.jpg' }),
    rawAsset({ id: 'd', originalPath: '/y/IMG_0001.jpg' }),
  ]);
  const single = plan([rawAsset({ id: 'e', originalFileName: 'single.jpg' })]);
  const all = [onlyRo, normal, single];

  await t.test('everything stays without filters', () => {
    assert.equal(applyFilters(all, undefined).length, 3);
    assert.equal(applyFilters(all, {}).length, 3);
  });

  await t.test('hide groups that consist only of read-only images', () => {
    const r = applyFilters(all, { hideProtectedOnlyGroups: true });
    assert.deepEqual(r, [normal, single]);
  });

  await t.test('hide groups without proposals', () => {
    assert.deepEqual(applyFilters(all, { hideGroupsWithoutProposals: true }), [normal]);
  });

  await t.test('search in file name and path, case-insensitive', () => {
    assert.deepEqual(applyFilters(all, { search: 'SINGLE' }), [single]);
    assert.deepEqual(applyFilters(all, { search: '/y/' }), [normal]);
    assert.deepEqual(applyFilters(all, { search: 'nichts' }), []);
    assert.equal(applyFilters(all, { search: '   ' }).length, 3);
  });

  await t.test('hide groups whose proposals are all already tagged', () => {
    const tagged = new Set(['d']);
    const opts = { hideAllTagged: true };
    assert.deepEqual(applyFilters(all, opts, { taggedAssetIds: tagged }), [onlyRo, single]);
    assert.deepEqual(applyFilters(all, opts, { taggedAssetIds: new Set(['c']) }), all, 'a tagged original does not count');
    assert.deepEqual(applyFilters(all, opts), all, 'everything stays without tag data');
    assert.deepEqual(applyFilters(all, {}, { taggedAssetIds: tagged }), all, 'filter off');
  });

  await t.test('skip tag: group is only hidden if all deletable images are tagged (the original does not count)', () => {
    const opts = { hideSkipped: true };
    const original = normal.original.id;
    const copies = normal.entries.filter((e) => e.asset.id !== original).map((e) => e.asset.id);
    assert.deepEqual(applyFilters(all, opts, { skipAssetIds: new Set(copies) }), [onlyRo, single]);
    assert.deepEqual(applyFilters(all, opts, { skipAssetIds: new Set([original]) }), all, 'only the original is tagged');
    assert.deepEqual(applyFilters(all, {}, { skipAssetIds: new Set(copies) }), all, 'filter off');
    assert.deepEqual(applyFilters(all, opts), all, 'without data');
  });

  await t.test('only groups with identical file names: original and copy are named the same (case-insensitive)', () => {
    const opts = { onlySameFilename: true };
    const same = plan([
      rawAsset({ id: 'p', originalFileName: 'IMG_1.JPG', originalPath: '/a/IMG_1.JPG' }),
      rawAsset({ id: 'q', originalFileName: 'img_1.jpg', originalPath: '/b/img_1.jpg' }),
    ]);
    const different = plan([
      rawAsset({ id: 'r', originalFileName: 'a.jpg' }),
      rawAsset({ id: 's', originalFileName: 'b.jpg' }),
    ]);
    const group = [same, different, single];
    assert.deepEqual(applyFilters(group, opts), [same]);
    assert.deepEqual(applyFilters(group, {}), group, 'filter off');
    const empty = rules.buildGroupPlan({ duplicateId: 'x' }, S);
    assert.deepEqual(applyFilters([empty], opts), [], 'an empty group has no same-named copy');
  });

  await t.test('identical file names stays a plain filter: protected pairs do not matter for it', () => {
    const opts = { onlySameFilename: true };
    const bothExternal = plan([
      rawAsset({ id: 'a', originalFileName: '20211113_110239.jpg', libraryId: 'lib' }),
      rawAsset({ id: 'b', originalFileName: '20211113_110239.jpg', libraryId: 'lib2' }),
      rawAsset({ id: 'c', originalFileName: 'other.jpg' }),
    ]);
    const differentNames = plan([
      rawAsset({ id: 'd', originalFileName: 'd.jpg' }),
      rawAsset({ id: 'e', originalFileName: 'e.jpg' }),
    ]);
    assert.deepEqual(applyFilters([bothExternal, differentNames], opts), [bothExternal]);
  });

  await t.test('same name, all protected: hide / only / off (example 20211113_110239.jpg)', () => {
    const small = { exifInfo: { exifImageWidth: 100, exifImageHeight: 100 } };
    const big = { exifInfo: { exifImageWidth: 4000, exifImageHeight: 3000 } };
    const bothExternal = plan([
      rawAsset({ id: 'a', originalFileName: '20211113_110239.jpg', libraryId: 'lib', ...small }),
      rawAsset({ id: 'b', originalFileName: '20211113_110239.jpg', libraryId: 'lib2', ...small }),
      rawAsset({ id: 'c', originalFileName: 'other.jpg', ...small }),
    ]);
    const otherIsOriginal = plan([
      rawAsset({ id: 'a2', originalFileName: 'same.jpg', libraryId: 'lib', ...small }),
      rawAsset({ id: 'b2', originalFileName: 'same.jpg', libraryId: 'lib', ...small }),
      rawAsset({ id: 'c2', originalFileName: 'other.jpg', ...big }),
    ]);
    assert.equal(otherIsOriginal.original.id, 'c2', 'the original has a different name');
    const deletable = plan([
      rawAsset({ id: 'o', originalFileName: 'B.jpg', libraryId: 'lib' }),
      rawAsset({ id: 'c', originalFileName: 'b.jpg' }),
    ]);
    const noSameName = plan([
      rawAsset({ id: 'n1', originalFileName: 'n1.jpg', libraryId: 'lib' }),
      rawAsset({ id: 'n2', originalFileName: 'n2.jpg', libraryId: 'lib' }),
    ]);
    const groups = [bothExternal, otherIsOriginal, deletable, noSameName];
    assert.deepEqual(applyFilters(groups, { sameNameAllProtected: 'hide' }), [deletable, noSameName]);
    assert.deepEqual(applyFilters(groups, { sameNameAllProtected: 'only' }), [bothExternal, otherIsOriginal]);
    assert.deepEqual(applyFilters(groups, { sameNameAllProtected: 'off' }), groups);
    assert.deepEqual(applyFilters(groups, {}), groups);
  });

  await t.test('same name, all protected: needs every same-named file protected, in every set', () => {
    const copyExternal = plan([
      rawAsset({ id: 'o2', originalFileName: 'C.jpg' }),
      rawAsset({ id: 'c2', originalFileName: 'c.jpg', libraryId: 'lib' }),
    ]);
    const twoSets = plan([
      rawAsset({ id: 'x1', originalFileName: 'x.jpg', libraryId: 'lib' }),
      rawAsset({ id: 'x2', originalFileName: 'x.jpg', libraryId: 'lib' }),
      rawAsset({ id: 'y1', originalFileName: 'y.jpg' }),
      rawAsset({ id: 'y2', originalFileName: 'Y.JPG' }),
    ]);
    const readOnly = plan([
      rawAsset({ id: 'r1', originalFileName: 'r.jpg', originalPath: '/ro/a/r.jpg' }),
      rawAsset({ id: 'r2', originalFileName: 'r.jpg', originalPath: '/ro/b/r.jpg' }),
    ]);
    const opts = { sameNameAllProtected: 'hide' };
    assert.deepEqual(applyFilters([copyExternal, twoSets, readOnly], opts), [copyExternal, twoSets]);
    assert.deepEqual(applyFilters([copyExternal, twoSets, readOnly], { sameNameAllProtected: 'only' }), [readOnly]);
  });

  await t.test('same name, all protected: "only" overrides the filters that hide groups without proposals', () => {
    const pair = plan([
      rawAsset({ id: 'a', originalFileName: 'x.jpg', originalPath: '/ro/a/x.jpg' }),
      rawAsset({ id: 'b', originalFileName: 'x.jpg', originalPath: '/ro/b/x.jpg' }),
    ]);
    const defaults = { hideGroupsWithoutProposals: true, hideProtectedOnlyGroups: true };
    assert.deepEqual(applyFilters([pair], defaults), [], 'default filters hide it');
    assert.deepEqual(applyFilters([pair], { ...defaults, sameNameAllProtected: 'only' }), [pair]);
    assert.deepEqual(applyFilters([pair], { ...defaults, sameNameAllProtected: 'hide' }), []);
  });

  await t.test('skip filter: protected images and the original do not count, all deletable ones must be tagged', () => {
    const opts = { hideSkipped: true };
    const group = plan([
      rawAsset({ id: 'a1', originalFileName: 'a.jpg', originalPath: '/ro/a.jpg' }),
      rawAsset({ id: 'a2', originalFileName: 'b.jpg', originalPath: '/ro/b.jpg' }),
      rawAsset({ id: 'k', originalFileName: 'c.jpg', originalPath: '/data/c.jpg' }),
    ]);
    assert.equal(group.original.id, 'a1');
    assert.deepEqual(applyFilters([group], opts, { skipAssetIds: new Set(['k']) }), [], 'the only deletable file is tagged');
    assert.deepEqual(applyFilters([group], opts, { skipAssetIds: new Set(['a1', 'a2']) }), [group], 'deletable file without a tag');
    assert.deepEqual(applyFilters([group], opts), [group], 'without tag data');
    const open = plan([
      rawAsset({ id: 'a0', originalFileName: 'q.jpg', originalPath: '/ro/q.jpg' }),
      rawAsset({ id: 'b1', originalFileName: 'q.jpg', originalPath: '/data/1/q.jpg' }),
      rawAsset({ id: 'b2', originalFileName: 'q.jpg', originalPath: '/data/2/q.jpg' }),
    ]);
    assert.equal(open.original.id, 'a0');
    assert.deepEqual(applyFilters([open], opts, { skipAssetIds: new Set(['b1']) }), [open], 'one of two deletable files is tagged');
    assert.deepEqual(applyFilters([open], opts, { skipAssetIds: new Set(['b1', 'b2']) }), []);
  });

  await t.test('skip filter: without deletable images the original and all protected images must be tagged', () => {
    const opts = { hideSkipped: true };
    const protectedOnly = plan([
      rawAsset({ id: 'a', originalFileName: 'a.jpg', originalPath: '/ro/a.jpg' }),
      rawAsset({ id: 'b', originalFileName: 'b.jpg', originalPath: '/ro/b.jpg' }),
    ]);
    assert.deepEqual(applyFilters([protectedOnly], opts, { skipAssetIds: new Set(['a', 'b']) }), []);
    assert.deepEqual(applyFilters([protectedOnly], opts, { skipAssetIds: new Set(['a']) }), [protectedOnly], 'a protected image without a tag');
    assert.deepEqual(applyFilters([protectedOnly], opts, { skipAssetIds: new Set(['b']) }), [protectedOnly], 'the original without a tag');
    assert.deepEqual(applyFilters([protectedOnly], opts, { skipAssetIds: new Set() }), [protectedOnly]);
    assert.deepEqual(applyFilters([protectedOnly], {}, { skipAssetIds: new Set(['a', 'b']) }), [protectedOnly], 'filter off');
    const empty = rules.buildGroupPlan({ duplicateId: 'x' }, S);
    assert.deepEqual(applyFilters([empty], opts, { skipAssetIds: new Set() }), [empty]);
  });

  await t.test('skip filter: writable original with protected copies and no deletable image', () => {
    const opts = { hideSkipped: true };
    const group = plan([
      rawAsset({ id: 'a0', originalFileName: 'x.jpg', originalPath: '/data/a0.jpg' }),
      rawAsset({ id: 'b1', originalFileName: 'x.jpg', originalPath: '/ro/b1.jpg' }),
    ]);
    assert.equal(group.original.id, 'a0');
    assert.deepEqual(applyFilters([group], opts, { skipAssetIds: new Set(['a0', 'b1']) }), []);
    assert.deepEqual(applyFilters([group], opts, { skipAssetIds: new Set(['b1']) }), [group], 'original without a tag');
  });

  await t.test('search wildcards: * and ? work, case-insensitive, other characters are literal', () => {
    const { createSearchMatcher } = require('../js/filters');
    const m = (text) => createSearchMatcher(text);
    assert.equal(m('*/Majo/*')('/media/ext/majo/IMG_1.jpg'), true, 'path containing /Majo/');
    assert.equal(m('*/Majo/*')('/media/ext/Majorette/IMG_1.jpg'), false, 'no slash after Majo');
    assert.equal(m('/Majo/')('/x/Majo/y.jpg'), true, 'plain text still works');
    assert.equal(m('IMG_??01')('x/img_a b01.jpg'), false, '? is exactly one character');
    assert.equal(m('IMG_??01')('x/IMG_ab01.jpg'), true);
    assert.equal(m('2021*09')('/x/2021 09/y.jpg'), true);
    assert.equal(m('a.b*')('a.bc'), true, 'the dot is literal');
    assert.equal(m('a.b*')('axbc'), false);
    assert.equal(m('(x)*')('(x)y'), true, 'regex characters are escaped');
    assert.equal(m('[a]?')('[a]b'), true);
    assert.equal(m('a\\b*')('a\\bc'), true, 'backslashes are literal');
    assert.equal(m('   ')('anything'), true, 'blank matches everything');
    assert.equal(m(undefined)('anything'), true);
  });

  await t.test('search with wildcards filters groups by file name and path', () => {
    const inMajo = plan([
      rawAsset({ id: 'm1', originalFileName: 'a.jpg', originalPath: '/media/Majo/a.jpg' }),
      rawAsset({ id: 'm2', originalFileName: 'a.jpg', originalPath: '/data/a.jpg' }),
    ]);
    const other = plan([
      rawAsset({ id: 'o1', originalFileName: 'b.jpg', originalPath: '/media/Other/b.jpg' }),
      rawAsset({ id: 'o2', originalFileName: 'b.jpg', originalPath: '/data/b.jpg' }),
    ]);
    assert.deepEqual(applyFilters([inMajo, other], { search: '*/Majo/*' }), [inMajo]);
    assert.deepEqual(applyFilters([inMajo, other], { search: '*/majo/*' }), [inMajo]);
    assert.deepEqual(applyFilters([inMajo, other], { search: 'b.j*' }), [other]);
    assert.deepEqual(applyFilters([inMajo, other], { search: '*/nothing/*' }), []);
    assert.deepEqual(applyFilters([inMajo, other], { search: '' }), [inMajo, other]);
  });

  await t.test('same name and path but a different file type: pairs like NEF and JPG', () => {
    const raw = plan([
      rawAsset({ id: 'r1', originalFileName: 'IMG_0001.NEF', originalPath: '/data/2024/IMG_0001.NEF' }),
      rawAsset({ id: 'r2', originalFileName: 'IMG_0001.jpg', originalPath: '/data/2024/IMG_0001.jpg' }),
    ]);
    const sameType = plan([
      rawAsset({ id: 's1', originalFileName: 'IMG_0002.jpg', originalPath: '/data/2024/IMG_0002.jpg' }),
      rawAsset({ id: 's2', originalFileName: 'IMG_0002.JPG', originalPath: '/data/2024/IMG_0002.JPG' }),
    ]);
    const otherFolder = plan([
      rawAsset({ id: 'o1', originalFileName: 'IMG_0003.NEF', originalPath: '/data/a/IMG_0003.NEF' }),
      rawAsset({ id: 'o2', originalFileName: 'IMG_0003.jpg', originalPath: '/data/b/IMG_0003.jpg' }),
    ]);
    const otherName = plan([
      rawAsset({ id: 'n1', originalFileName: 'IMG_0004.NEF', originalPath: '/data/IMG_0004.NEF' }),
      rawAsset({ id: 'n2', originalFileName: 'IMG_0005.jpg', originalPath: '/data/IMG_0005.jpg' }),
    ]);
    const groups = [raw, sameType, otherFolder, otherName];
    assert.deepEqual(applyFilters(groups, { sameNameOtherType: 'only' }), [raw]);
    assert.deepEqual(applyFilters(groups, { sameNameOtherType: 'hide' }), [sameType, otherFolder, otherName]);
    assert.deepEqual(applyFilters(groups, { sameNameOtherType: 'off' }), groups);
    assert.deepEqual(applyFilters(groups, {}), groups);
    assert.deepEqual(applyFilters(groups, { sameNameOtherType: 'only', search: 'nef' }), [raw], 'combines with the search');
  });

  await t.test('same name, other type: "only" overrides the filters that would hide pairs without proposals', () => {
    const raw = plan([
      rawAsset({ id: 'r1', originalFileName: 'IMG_0001.NEF', originalPath: '/data/IMG_0001.NEF' }),
      rawAsset({ id: 'r2', originalFileName: 'IMG_0001.jpg', originalPath: '/data/IMG_0001.jpg' }),
    ]);
    assert.equal(raw.proposals.length, 0, 'the hard file name rule excludes the pair (names differ)');
    const defaults = { hideGroupsWithoutProposals: true, hideProtectedOnlyGroups: true };
    assert.deepEqual(applyFilters([raw], defaults), [], 'default filters hide it');
    assert.deepEqual(applyFilters([raw], { ...defaults, sameNameOtherType: 'only' }), [raw]);
    assert.deepEqual(applyFilters([raw], { ...defaults, sameNameOtherType: 'hide' }), []);
  });

  await t.test('splitPath-based detection handles files without extension or directory', () => {
    const noExt = plan([
      rawAsset({ id: 'a', originalFileName: 'README', originalPath: '/x/README' }),
      rawAsset({ id: 'b', originalFileName: 'README.txt', originalPath: '/x/README.txt' }),
    ]);
    const noDir = plan([
      rawAsset({ id: 'c', originalFileName: 'f.nef', originalPath: '' }),
      rawAsset({ id: 'd', originalFileName: 'f.jpg', originalPath: '' }),
    ]);
    const dotFile = plan([
      rawAsset({ id: 'e', originalFileName: '.hidden', originalPath: '/x/.hidden' }),
      rawAsset({ id: 'f', originalFileName: '.hidden', originalPath: '/y/.hidden' }),
    ]);
    assert.deepEqual(applyFilters([noExt, noDir, dotFile], { sameNameOtherType: 'only' }), [noExt, noDir]);
  });

  await t.test('filterFunnel: counts the groups each filter removed, in order, and matches applyFilters', () => {
    const { filterFunnel } = require('../js/filters');
    const withProposal = plan([
      rawAsset({ id: 'a0', originalFileName: 'x.jpg', originalPath: '/data/a0/x.jpg' }),
      rawAsset({ id: 'a1', originalFileName: 'x.jpg', originalPath: '/data/a1/x.jpg' }),
    ]);
    const noProposal = plan([
      rawAsset({ id: 'b0', originalFileName: 'y.jpg', originalPath: '/data/b0/y.jpg' }),
      rawAsset({ id: 'b1', originalFileName: 'z.jpg', originalPath: '/data/b1/z.jpg' }),
    ]);
    const protectedOnly = plan([
      rawAsset({ id: 'c0', originalFileName: 'p.jpg', originalPath: '/ro/c0/p.jpg' }),
      rawAsset({ id: 'c1', originalFileName: 'p.jpg', originalPath: '/ro/c1/p.jpg' }),
    ]);
    const groups = [withProposal, noProposal, protectedOnly];
    const filters = { hideProtectedOnlyGroups: true, hideGroupsWithoutProposals: true, onlySameFilename: true };
    const funnel = filterFunnel(groups, filters, {});
    assert.deepEqual(funnel, {
      total: 3,
      kept: 1,
      steps: [
        { key: 'hideProtectedOnlyGroups', removed: 1 },
        { key: 'hideGroupsWithoutProposals', removed: 1 },
      ],
    });
    assert.equal(applyFilters(groups, filters, {}).length, funnel.kept);
  });

  await t.test('filterFunnel: lists only filters that removed something and explains an empty result', () => {
    const { filterFunnel } = require('../js/filters');
    const single = plan([rawAsset({ id: 'e', originalFileName: 'single.jpg' })]);
    const result = filterFunnel([single], { onlySameFilename: true, hideSkipped: true, search: 'zzz' }, {});
    assert.equal(result.kept, 0);
    assert.deepEqual(result.steps, [{ key: 'onlySameFilename', removed: 1 }], 'the first filter that hides the group gets it');
    assert.deepEqual(filterFunnel([single], {}, {}), { total: 1, kept: 1, steps: [] });
    assert.deepEqual(filterFunnel([], { search: 'x' }, {}), { total: 0, kept: 0, steps: [] });
  });

  await t.test('applyLimit limits, unlimited/invalid lets everything through', () => {
    const { applyLimit } = require('../js/filters');
    const plans = Array.from({ length: 30 }, (_, i) => ({ i }));
    assert.equal(applyLimit(plans, '5').length, 5);
    assert.deepEqual(applyLimit(plans, '5'), plans.slice(0, 5));
    assert.equal(applyLimit(plans, '200').length, 30);
    assert.equal(applyLimit(plans, 'all').length, 30);
    assert.equal(applyLimit(plans, 'abc').length, 30);
    assert.equal(applyLimit(plans, '0').length, 30);
    assert.equal(applyLimit(plans, undefined).length, 30);
    assert.deepEqual(applyLimit([], '5'), []);
  });

  await t.test('limit options of the configuration match the specification', () => {
    const config = require('../js/config');
    assert.deepEqual([...config.LIMIT_OPTIONS], ['5', '10', '20', '50', '100', '200', '500', 'all']);
    assert.ok(config.LIMIT_OPTIONS.includes(config.DEFAULT_SETTINGS.filters.limit));
  });

  await t.test('empty plans do not count as protected-only', () => {
    const empty = rules.buildGroupPlan({ duplicateId: 'x' }, S);
    assert.deepEqual(applyFilters([empty], { hideProtectedOnlyGroups: true }), [empty]);
  });
});
