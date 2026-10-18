/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
/* Dependency-free SHA-1 (synchronous; runs in the browser over file:// and in Node). */
(function (global) {
  'use strict';
  const IDup = (global.IDup = global.IDup || {});
  const isNode = typeof module !== 'undefined' && module.exports;

  const INITIAL_STATE = Object.freeze([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]);
  const BLOCK_BYTES = 64;
  const ROUNDS = 80;
  const WORD_BYTES = 4;
  const LENGTH_FIELD_BYTES = 8;
  const TWO_POW_32 = 0x100000000;
  // Round function and constant for each stage of 20 rounds
  const STAGES = Object.freeze([
    { f: (b, c, d) => (b & c) | (~b & d), k: 0x5a827999 },
    { f: (b, c, d) => b ^ c ^ d, k: 0x6ed9eba1 },
    { f: (b, c, d) => (b & c) | (b & d) | (c & d), k: 0x8f1bbcdc },
    { f: (b, c, d) => b ^ c ^ d, k: 0xca62c1d6 },
  ]);
  const ROUNDS_PER_STAGE = ROUNDS / STAGES.length;

  const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;

  function pad(bytes) {
    const total = Math.ceil((bytes.length + 1 + LENGTH_FIELD_BYTES) / BLOCK_BYTES) * BLOCK_BYTES;
    const padded = new Uint8Array(total);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    const bitLength = bytes.length * 8;
    view.setUint32(total - LENGTH_FIELD_BYTES, Math.floor(bitLength / TWO_POW_32));
    view.setUint32(total - WORD_BYTES, bitLength >>> 0);
    return view;
  }

  function processBlock(view, offset, state) {
    const w = new Uint32Array(ROUNDS);
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * WORD_BYTES);
    for (let i = 16; i < ROUNDS; i += 1) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let [a, b, c, d, e] = state;
    for (let i = 0; i < ROUNDS; i += 1) {
      const { f, k } = STAGES[Math.floor(i / ROUNDS_PER_STAGE)];
      const temp = (rotl(a, 5) + (f(b, c, d) >>> 0) + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }
    return [a, b, c, d, e].map((v, i) => (state[i] + v) >>> 0);
  }

  function sha1Bytes(bytes) {
    const view = pad(bytes);
    let state = [...INITIAL_STATE];
    for (let offset = 0; offset < view.byteLength; offset += BLOCK_BYTES) {
      state = processBlock(view, offset, state);
    }
    const out = new Uint8Array(state.length * WORD_BYTES);
    const outView = new DataView(out.buffer);
    state.forEach((v, i) => outView.setUint32(i * WORD_BYTES, v));
    return out;
  }

  const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
  const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

  function sha1BytesBase64(bytes) {
    return toBase64(sha1Bytes(bytes));
  }

  function sha1Base64(text) {
    return sha1BytesBase64(new TextEncoder().encode(text));
  }

  // Invalid Base64 yields an empty string instead of an error.
  function base64ToHex(base64) {
    try {
      return toHex(Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0)));
    } catch (e) {
      return '';
    }
  }

  const api = { sha1Base64, sha1BytesBase64, base64ToHex };
  if (isNode) module.exports = api;
  else IDup.sha1 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
