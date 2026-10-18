/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
/* Minimal dependency-free linter: syntax check of all JS files. */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE_DIRS = ['js', 'tests', 'scripts'];

function collect(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collect(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const files = SOURCE_DIRS.flatMap(collect);
files.forEach((file) => execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' }));
console.log(`Lint OK (${files.length} files)`);
