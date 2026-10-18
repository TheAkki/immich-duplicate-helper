/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
/* Limits the number of concurrently running asynchronous tasks. */
(function (global) {
  'use strict';
  const IDup = (global.IDup = global.IDup || {});
  const isNode = typeof module !== 'undefined' && module.exports;

  function createLimiter(maxConcurrent) {
    const limit = Math.max(1, maxConcurrent);
    const waiting = [];
    let running = 0;

    function next() {
      if (running >= limit || waiting.length === 0) return;
      const { task, resolve, reject } = waiting.shift();
      running += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          running -= 1;
          next();
        });
    }

    return function schedule(task) {
      return new Promise((resolve, reject) => {
        waiting.push({ task, resolve, reject });
        next();
      });
    };
  }

  const api = { createLimiter };
  if (isNode) module.exports = api;
  else IDup.limiter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
