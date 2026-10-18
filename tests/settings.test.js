/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
// KI-generiert
const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeSettings, loadSettings, saveSettings } = require('../js/settings');
const config = require('../js/config');

const memoryStorage = (initial) => {
  const data = new Map(initial ? [[config.STORAGE_KEY, initial]] : []);
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, v) };
};

test('settings', async (t) => {
  await t.test('mergeSettings keeps valid values and discards wrong types', () => {
    const r = mergeSettings(config.DEFAULT_SETTINGS, { serverUrl: 'x', action: 5, rules: { exif: false, evil: 1 } });
    assert.equal(r.serverUrl, 'x');
    assert.equal(r.action, 'delete');
    assert.equal(r.rules.exif, false);
    assert.equal(r.rules.resolution, true);
    assert.equal('evil' in r.rules, false);
  });

  await t.test('mergeSettings ignores a non-object for nested groups', () => {
    assert.equal(mergeSettings(config.DEFAULT_SETTINGS, { rules: 'x' }).rules.exif, true);
  });

  await t.test('load: defaults for empty/broken storage, values for valid storage', () => {
    assert.deepEqual(loadSettings(memoryStorage()), config.DEFAULT_SETTINGS);
    assert.deepEqual(loadSettings(memoryStorage('{kaputt')), config.DEFAULT_SETTINGS);
    assert.equal(loadSettings(memoryStorage('{"serverUrl":"s"}')).serverUrl, 's');
  });

  await t.test('save: round trip and error path', () => {
    const s = memoryStorage();
    assert.equal(saveSettings(s, { serverUrl: 'q' }), true);
    assert.equal(loadSettings(s).serverUrl, 'q');
    const broken = { setItem: () => { throw new Error('quota'); } };
    assert.equal(saveSettings(broken, {}), false);
  });
});
