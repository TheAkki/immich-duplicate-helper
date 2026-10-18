/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
// KI-generiert
/* KI-generiert: scenario "Threema copy vs. camera original". Metadata other than names/paths is assumed. */
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../js/rules');
const { compilePatterns } = require('../js/patterns');
const config = require('../js/config');
const { applyFilters } = require('../js/filters');

const GROUP = {
  duplicateId: 'g',
  assets: [
    {
      id: 'threema',
      originalFileName: 'threema-20230215-230536818.jpg',
      originalPath: '/data/library/user/2023/2023-02-15/threema-20230215-230536818.jpg',
      fileCreatedAt: '2023-02-15T22:05:36.000Z',
      width: 1600,
      height: 1200,
      exifInfo: { fileSizeInByte: 300000 },
    },
    {
      id: 'camera',
      originalFileName: '20230214_200750.jpg',
      originalPath: '/data/library/user/ThreemaLibre/2023-02-14/20230214_200750.jpg',
      fileCreatedAt: '2023-02-14T19:07:50.000Z',
      width: 4000,
      height: 3000,
      exifInfo: { fileSizeInByte: 3000000 },
    },
  ],
};

const settings = (hard) => ({
  rules: { ...config.DEFAULT_SETTINGS.rules },
  hard,
  readOnlyPrefixes: '',
});
const context = { duplicatePatterns: compilePatterns('^threema-\\d{8}-\\d+').regexes };

test('scenario Threema duplicate', async (t) => {
  await t.test('without hard rules: the Threema file is the duplicate, the camera file the original', () => {
    const [plan] = rules.buildPlan([GROUP], settings({ filename: false, timestamp: false }), context);
    assert.equal(plan.original.id, 'camera');
    assert.deepEqual(plan.proposals.map((p) => p.asset.id), ['threema']);
    const keys = plan.proposals[0].reasons.map((r) => r.key);
    assert.deepEqual(keys, ['reason.fileSize', 'reason.duplicatePattern', 'reason.resolution']);
  });

  await t.test('file name rule on, pattern lifts it, timestamp rule off: Threema file becomes the duplicate', () => {
    const hard = { filename: true, timestamp: false, patternExemptsFilename: true };
    const [plan] = rules.buildPlan([GROUP], settings(hard), context);
    assert.deepEqual(plan.proposals.map((p) => p.asset.id), ['threema']);
    const strict = { ...hard, patternExemptsFilename: false };
    assert.equal(rules.buildPlan([GROUP], settings(strict), context)[0].proposals.length, 0);
  });

  await t.test('original pattern marks the camera file as the original, even without a duplicate pattern', () => {
    const ctxOriginal = { originalPatterns: compilePatterns('^\\d{8}_\\d{6}').regexes };
    const flat = { ...settings({ filename: false, timestamp: false }), rules: { ...config.DEFAULT_SETTINGS.rules, fileSize: false } };
    const [plan] = rules.buildPlan([GROUP], flat, ctxOriginal);
    assert.equal(plan.original.id, 'camera');
    assert.deepEqual(plan.proposals.map((p) => p.asset.id), ['threema']);
    assert.equal(plan.proposals[0].reasons[0].key, 'reason.originalPattern');
  });

  await t.test('with the hard rules (file name + timestamp) the file is excluded as a series image', () => {
    const [plan] = rules.buildPlan([GROUP], settings({ filename: true, timestamp: true }), context);
    assert.equal(plan.proposals.length, 0);
    assert.equal(plan.entries.find((e) => e.asset.id === 'threema').role, 'unrelated');
  });
});

// Example 20211113_110239.jpg: two same-named, non-deletable files plus a third duplicate with a different name
const PROTECTED_PAIR = (extra) => ({
  duplicateId: 'g2',
  assets: [
    { id: 'p1', originalFileName: '20211113_110239.jpg', originalPath: '/media/ro/a/20211113_110239.jpg', fileCreatedAt: '2021-11-13T10:02:39Z', ...extra.first },
    { id: 'p2', originalFileName: '20211113_110239.jpg', originalPath: '/media/ro/b/20211113_110239.jpg', fileCreatedAt: '2021-11-13T10:02:39Z', ...extra.second },
    { id: 'p3', originalFileName: 'IMG_other.jpg', originalPath: '/data/library/user/IMG_other.jpg', fileCreatedAt: '2021-11-13T10:02:39Z' },
  ],
});

test('scenario IMG_20211011_144128_1: protected files plus a deletable copy with a skip tag', async (t) => {
  const group = {
    duplicateId: 'g3',
    assets: [
      { id: 'a', originalFileName: 'IMG_20211011_144128.jpg', originalPath: '/media/ro/IMG_20211011_144128.jpg', libraryId: 'lib', fileCreatedAt: '2021-10-11T12:41:28Z' },
      { id: 'b', originalFileName: 'IMG_20211011_144128_1.jpg', originalPath: '/media/ro/IMG_20211011_144128_1.jpg', libraryId: 'lib', fileCreatedAt: '2021-10-11T12:41:28Z' },
      { id: 'c', originalFileName: 'IMG_20211011_144128_1.jpg', originalPath: '/data/library/user/IMG_20211011_144128_1.jpg', fileCreatedAt: '2021-10-11T12:41:28Z' },
    ],
  };
  const settings = {
    rules: { ...config.DEFAULT_SETTINGS.rules },
    hard: { ...config.DEFAULT_SETTINGS.hard, filename: false, timestamp: false },
    readOnlyPrefixes: '',
  };
  const plans = rules.buildPlan([group], settings, {});
  const show = (filters, skipIds) => applyFilters(plans, { ...config.DEFAULT_SETTINGS.filters, onlySameFilename: true, ...filters }, { skipAssetIds: new Set(skipIds) });

  await t.test('skip filter works on its own (without the identical file name filter) and takes precedence', () => {
    assert.deepEqual(show({ onlySameFilename: false }, ['c']), []);
    assert.equal(show({ onlySameFilename: false }, []).length, 1);
    assert.equal(show({ onlySameFilename: false, hideSkipped: false }, ['c']).length, 1);
  });

  await t.test('the last deletable copy has the skip tag: group is hidden', () => {
    assert.deepEqual(show({}, ['c']), []);
  });

  await t.test('without a skip tag the group stays visible', () => {
    assert.equal(show({}, []).length, 1);
  });

  await t.test('skip filter off: tag does not matter, group stays visible', () => {
    assert.equal(show({ hideSkipped: false }, ['c']).length, 1);
  });

  await t.test('two deletable same-named copies, only one with a skip tag: group stays visible', () => {
    const two = {
      duplicateId: 'g4',
      assets: [
        { id: 'o', originalFileName: 'x.jpg', originalPath: '/media/ro/x.jpg', libraryId: 'lib' },
        { id: 'k1', originalFileName: 'x.jpg', originalPath: '/data/a/x.jpg' },
        { id: 'k2', originalFileName: 'x.jpg', originalPath: '/data/b/x.jpg' },
      ],
    };
    const p = rules.buildPlan([two], settings, {});
    const filters = { ...config.DEFAULT_SETTINGS.filters, onlySameFilename: true };
    assert.equal(applyFilters(p, filters, { skipAssetIds: new Set(['k1']) }).length, 1);
    assert.equal(applyFilters(p, filters, { skipAssetIds: new Set(['k1', 'k2']) }).length, 0);
  });
});

// Example TimePhoto_20210220_110601.jpg: the same photo in two folders of the external library
test('scenario TimePhoto: same-named pair in the external library', async (t) => {
  const a = (id, path) => ({
    id,
    originalFileName: 'TimePhoto_20210220_110601.jpg',
    originalPath: path,
    libraryId: 'lib',
    fileCreatedAt: '2021-02-20T11:06:01Z',
    width: 100,
    height: 100,
    exifInfo: { fileSizeInByte: 100 },
  });
  const group = {
    duplicateId: 'g',
    assets: [
      a('o', '/media/extCollections/House/Diary/2021/2021 02/TimePhoto_20210220_110601.jpg'),
      a('c', '/media/extCollections/House/Diary/Gift/Name/TimePhoto_20210220_110601.jpg'),
    ],
  };
  const settings = {
    rules: { ...config.DEFAULT_SETTINGS.rules },
    hard: { ...config.DEFAULT_SETTINGS.hard },
    readOnlyPrefixes: '',
  };
  const [plan] = rules.buildPlan([group], settings, {});
  const only = { onlySameFilename: true };

  await t.test('roles: one original, one protected copy that can be stacked but not deleted', () => {
    assert.deepEqual(plan.entries.map((e) => e.role).sort(), ['original', 'protected']);
    assert.equal(plan.proposals.length, 0);
    assert.equal(plan.stackable.length, 1);
  });

  // The two use cases for same-named files that are all read-only are chosen with the filter setting.
  await t.test('use case "hide them" (stacking, or skipping when deleting duplicates): hide', () => {
    const hide = { ...config.DEFAULT_SETTINGS.filters, sameNameAllProtected: 'hide' };
    for (const action of ['stack', 'delete', 'tag', undefined]) {
      assert.deepEqual(applyFilters([plan], hide, { action }), [], `action ${action}`);
    }
  });

  await t.test('use case "show only them": only', () => {
    const onlyThem = { ...config.DEFAULT_SETTINGS.filters, sameNameAllProtected: 'only' };
    for (const action of ['stack', 'delete', 'tag']) {
      assert.deepEqual(applyFilters([plan], onlyThem, { action }), [plan], `action ${action}`);
    }
  });

  await t.test('off: the group follows the other filters; with stack it has a target, otherwise not', () => {
    const off = { ...config.DEFAULT_SETTINGS.filters, sameNameAllProtected: 'off' };
    assert.deepEqual(applyFilters([plan], off, { action: 'stack' }), [plan]);
    assert.deepEqual(applyFilters([plan], off, { action: 'delete' }), [], 'hidden by "without proposals"');
  });

  await t.test('the plain same-name filter shows the group whatever the protection is', () => {
    const same = { onlySameFilename: true };
    for (const action of ['stack', 'delete', 'tag', undefined]) {
      assert.deepEqual(applyFilters([plan], same, { action }), [plan], `action ${action}`);
    }
  });

  await t.test('the skip filter hides the group when its stackable copy carries the skip tag', () => {
    const filters = { hideSkipped: true };
    const copyId = plan.stackable[0].asset.id;
    assert.deepEqual(applyFilters([plan], filters, { action: 'stack', skipAssetIds: new Set([copyId, plan.original.id]) }), []);
    assert.deepEqual(applyFilters([plan], filters, { action: 'stack', skipAssetIds: new Set() }), [plan]);
  });
});

test('scenario identical file name: pairs that are all protected can be hidden', async (t) => {
  const filters = { ...config.DEFAULT_SETTINGS.filters, sameNameAllProtected: 'hide' };
  const run = (group, readOnlyPrefixes) => {
    const settings = {
      rules: { ...config.DEFAULT_SETTINGS.rules },
      hard: { ...config.DEFAULT_SETTINGS.hard },
      readOnlyPrefixes,
    };
    return applyFilters(rules.buildPlan([group], settings, {}), filters, {});
  };

  await t.test('both files in an external library', () => {
    const group = PROTECTED_PAIR({ first: { libraryId: 'lib' }, second: { libraryId: 'lib' } });
    assert.deepEqual(run(group, ''), []);
  });

  await t.test('both files below a read-only path', () => {
    const group = PROTECTED_PAIR({ first: {}, second: {} });
    assert.deepEqual(run(group, '/media/ro'), []);
  });

  await t.test('read-only path not entered and not external: group stays visible', () => {
    const group = PROTECTED_PAIR({ first: {}, second: {} });
    assert.equal(run(group, '').length, 1);
  });

  await t.test('only one of the two files is protected: group stays visible', () => {
    const group = PROTECTED_PAIR({ first: { libraryId: 'lib' }, second: {} });
    assert.equal(run(group, '').length, 1);
  });
});
