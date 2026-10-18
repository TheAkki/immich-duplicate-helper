/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
// KI-generiert
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { sha1Base64, base64ToHex } = require('../js/sha1');

test('sha1', async (t) => {
  await t.test('known test vectors', () => {
    assert.equal(sha1Base64(''), '2jmj7l5rSw0yVb/vlWAYkK/YBwk=');
    assert.equal(sha1Base64('abc'), 'qZk+NkcGgWq6PiVxeFDCbJzQ2J0=');
    assert.equal(
      base64ToHex(sha1Base64('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')),
      '84983e441c3bd26ebaae4aa1f95129e5e54670f1'
    );
  });

  await t.test('matches node:crypto (block boundaries, umlauts, long inputs)', () => {
    const inputs = ['a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63), 'a'.repeat(64), 'a'.repeat(1000), 'path:/mnt/Übung/ä.jpg'];
    for (const input of inputs) {
      const expected = crypto.createHash('sha1').update(input, 'utf8').digest('base64');
      assert.equal(sha1Base64(input), expected, `length ${input.length}`);
    }
  });

  await t.test('sha1BytesBase64 matches node:crypto for binary data', () => {
    const { sha1BytesBase64 } = require('../js/sha1');
    for (const size of [0, 1, 55, 56, 64, 65, 4096, 100000]) {
      const data = crypto.randomBytes(size);
      assert.equal(sha1BytesBase64(data), crypto.createHash('sha1').update(data).digest('base64'), `size ${size}`);
    }
  });

  await t.test('base64ToHex: valid, empty and invalid', () => {
    assert.equal(base64ToHex('qZk+NkcGgWq6PiVxeFDCbJzQ2J0='), 'a9993e364706816aba3e25717850c26c9cd0d89d');
    assert.equal(base64ToHex(''), '');
    assert.equal(base64ToHex('%%%'), '');
  });
});
