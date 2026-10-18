/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
/* File name patterns (regular expressions) that mark an image as a preferred duplicate. */
(function (global) {
  'use strict';
  const IDup = (global.IDup = global.IDup || {});
  const isNode = typeof module !== 'undefined' && module.exports;
  const config = isNode ? require('./config') : IDup.config;

  const REGEX_SPECIALS = /[.+^${}()|[\]\\]/g;
  // Characters that mark a line as a regular expression, never as a plain wildcard pattern.
  const REGEX_SYNTAX = /[()[\]{}|\\^$+]/;
  // ".*", ".+" and ".?" are the typical regular expression wildcards.
  const REGEX_WILDCARD = /\.[*+?]/;

  // Converts a wildcard pattern to a regular expression: `*` matches any characters, `?` exactly one,
  // everything else is literal. The match is a case-insensitive "contains" unless anchored by the caller.
  function globToRegExp(glob) {
    const pattern = String(glob).replace(REGEX_SPECIALS, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(pattern, config.PATTERN_FLAGS);
  }

  // A line with "*" or "?" but without regular expression syntax (e.g. "*Kopie*", "threema-*.mp4") is a
  // wildcard pattern. Everything else is a regular expression; if that is invalid, a line that still looks
  // like a plain wildcard pattern (e.g. "*.*") is accepted as one, otherwise it is reported as invalid.
  function compileLine(line) {
    const wildcard = /[*?]/.test(line) && !REGEX_SYNTAX.test(line);
    if (wildcard && !REGEX_WILDCARD.test(line)) return globToRegExp(line);
    try {
      return new RegExp(line, config.PATTERN_FLAGS);
    } catch (e) {
      if (wildcard) return globToRegExp(line);
      throw e;
    }
  }

  // Returns { regexes: RegExp[], invalid: string[] }; invalid expressions are reported, not thrown.
  function compilePatterns(text) {
    const lines = String(text || '')
      .split(config.LINE_SEPARATOR)
      .map((line) => line.trim())
      .filter(Boolean);
    const regexes = [];
    const invalid = [];
    for (const line of lines) {
      try {
        regexes.push(compileLine(line));
      } catch (e) {
        invalid.push(line);
      }
    }
    return { regexes, invalid };
  }

  function matchesAny(fileName, regexes) {
    return (regexes || []).some((re) => re.test(fileName));
  }

  const api = { compilePatterns, matchesAny, globToRegExp };
  if (isNode) module.exports = api;
  else IDup.patterns = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
