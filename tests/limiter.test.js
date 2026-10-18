/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
// KI-generiert
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLimiter } = require('../js/limiter');

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('limiter', async (t) => {
  await t.test('limits concurrency and returns all results', async () => {
    const schedule = createLimiter(2);
    let running = 0;
    let peak = 0;
    const task = (n) => async () => {
      running += 1;
      peak = Math.max(peak, running);
      await tick();
      running -= 1;
      return n;
    };
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => schedule(task(n))));
    assert.deepEqual(results, [1, 2, 3, 4, 5]);
    assert.equal(peak, 2);
  });

  await t.test('an error in one task does not block the queue', async () => {
    const schedule = createLimiter(1);
    const failing = schedule(async () => { throw new Error('boom'); });
    const ok = schedule(async () => 'ok');
    await assert.rejects(failing, /boom/);
    assert.equal(await ok, 'ok');
  });

  await t.test('a limit below 1 is raised to 1', async () => {
    const schedule = createLimiter(0);
    assert.equal(await schedule(async () => 42), 42);
  });
});
