/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
// KI-generiert
const test = require('node:test');
const assert = require('node:assert/strict');
const { compilePatterns, matchesAny } = require('../js/patterns');

test('patterns', async (t) => {
  await t.test('compilePatterns: one regex per line, empty lines are dropped', () => {
    const { regexes, invalid } = compilePatterns('^IMG-\\d+\n\n  WA\\d+  \n');
    assert.equal(regexes.length, 2);
    assert.deepEqual(invalid, []);
  });

  await t.test('invalid expressions are reported, valid ones are kept', () => {
    const { regexes, invalid } = compilePatterns('([\nok');
    assert.equal(regexes.length, 1);
    assert.deepEqual(invalid, ['([']);
  });

  await t.test('lines with wildcards but without regular expression syntax are wildcard patterns', () => {
    const { regexes, invalid } = compilePatterns('*Kopie*\n*Kopiert*\nthreema-*.mp4\nIMG_??.jpg');
    assert.deepEqual(invalid, []);
    assert.equal(regexes.length, 4);
    assert.equal(matchesAny('Foto Kopie 2.jpg', [regexes[0]]), true);
    assert.equal(matchesAny('Foto kopie.jpg', [regexes[0]]), true, 'case-insensitive');
    assert.equal(matchesAny('Foto.jpg', [regexes[0]]), false);
    assert.equal(matchesAny('Foto - Kopiert.jpg', [regexes[1]]), true);
    assert.equal(matchesAny('threema-2023.mp4', [regexes[2]]), true);
    assert.equal(matchesAny('threema-2023xmp4', [regexes[2]]), false, 'the dot is literal in a wildcard');
    assert.equal(matchesAny('IMG_01.jpg', [regexes[3]]), true);
    assert.equal(matchesAny('IMG_1.jpg', [regexes[3]]), false, '? is exactly one character');
  });

  await t.test('regular expressions stay regular expressions', () => {
    const { regexes, invalid } = compilePatterns('^IMG-\\d{8}-WA\\d+\n.*Kopie.*\nKopie+');
    assert.deepEqual(invalid, []);
    assert.equal(matchesAny('IMG-20240101-WA0001.jpg', [regexes[0]]), true);
    assert.equal(matchesAny('x-IMG-20240101-WA0001.jpg', [regexes[0]]), false, 'anchored with ^');
    assert.equal(matchesAny('a Kopie b', [regexes[1]]), true);
    assert.equal(matchesAny('Kopiee', [regexes[2]]), true);
  });

  await t.test('"*.*" is not a valid regular expression but still a wildcard', () => {
    const { regexes, invalid } = compilePatterns('*.*');
    assert.deepEqual(invalid, []);
    assert.equal(matchesAny('IMG_1.jpg', regexes), true);
    assert.equal(matchesAny('README', regexes), false);
  });

  await t.test('invalid regular expressions with regex syntax are still reported, wildcards or not', () => {
    const { regexes, invalid } = compilePatterns('(*Kopie\n[abc*\n*Kopie*');
    assert.deepEqual(invalid, ['(*Kopie', '[abc*']);
    assert.equal(regexes.length, 1);
  });

  await t.test('globToRegExp converts wildcards and escapes everything else', () => {
    const { globToRegExp } = require('../js/patterns');
    assert.equal(globToRegExp('a.b*').test('a.bc'), true);
    assert.equal(globToRegExp('a.b*').test('axbc'), false);
    assert.equal(globToRegExp('(x)?').test('(x)y'), true);
    assert.equal(globToRegExp('A*').flags, 'i');
  });

  await t.test('empty/missing input', () => {
    assert.deepEqual(compilePatterns(undefined), { regexes: [], invalid: [] });
  });

  await t.test('matchesAny: case-insensitive, false without patterns', () => {
    const { regexes } = compilePatterns('^img-.*-wa');
    assert.equal(matchesAny('IMG-20240101-WA0001.jpg', regexes), true);
    assert.equal(matchesAny('DSC.jpg', regexes), false);
    assert.equal(matchesAny('DSC.jpg', undefined), false);
    assert.equal(matchesAny('DSC.jpg', []), false);
  });
});
