/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
// KI-generiert
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTranslator, interpolate } = require('../js/i18n');
const de = require('../js/locales/de');
const en = require('../js/locales/en');

test('i18n', async (t) => {
  const locales = { de, en };
  await t.test('interpolate replaces placeholders, unknown ones stay', () => {
    assert.equal(interpolate('a {x} {y}', { x: 1 }), 'a 1 {y}');
    assert.equal(interpolate('a {x}'), 'a {x}');
  });

  await t.test('translation, language switch, fallback', () => {
    const tr = createTranslator(locales, { language: 'de', fallback: 'en' });
    assert.equal(tr.t('conn.load'), 'Duplikate laden');
    assert.equal(tr.setLanguage('en'), true);
    assert.equal(tr.t('conn.load'), 'Load duplicates');
    assert.equal(tr.setLanguage('xx'), false);
    assert.equal(tr.getLanguage(), 'en');
    assert.equal(tr.t('does.not.exist'), 'does.not.exist');
  });

  await t.test('unknown start language falls back; missing key uses the fallback language', () => {
    const tr = createTranslator({ en: { a: 'A' }, de: {} }, { language: 'fr', fallback: 'en' });
    assert.equal(tr.getLanguage(), 'en');
    tr.setLanguage('de');
    assert.equal(tr.t('a'), 'A');
  });

  await t.test('languages lists names; locale files have identical keys', () => {
    const tr = createTranslator(locales, { language: 'de', fallback: 'en' });
    assert.deepEqual(tr.languages().map((l) => l.name).sort(), ['Deutsch', 'English']);
    assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());
  });
});
