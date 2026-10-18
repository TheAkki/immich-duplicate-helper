/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
/* Minimal translation layer. New language = new file in js/locales/. */
(function (global) {
  'use strict';
  const IDup = (global.IDup = global.IDup || {});
  const isNode = typeof module !== 'undefined' && module.exports;

  const NAME_KEY = 'meta.name';
  const PLACEHOLDER = /\{(\w+)\}/g;

  function interpolate(message, params) {
    return message.replace(PLACEHOLDER, (match, name) =>
      params && params[name] !== undefined ? String(params[name]) : match
    );
  }

  function createTranslator(locales, { language, fallback }) {
    let current = locales[language] ? language : fallback;

    function t(key, params) {
      const message =
        (locales[current] && locales[current][key]) ||
        (locales[fallback] && locales[fallback][key]) ||
        key;
      return interpolate(message, params);
    }

    function setLanguage(code) {
      if (!locales[code]) return false;
      current = code;
      return true;
    }

    function languages() {
      return Object.keys(locales).map((code) => ({
        code,
        name: locales[code][NAME_KEY] || code,
      }));
    }

    return { t, setLanguage, languages, getLanguage: () => current };
  }

  const api = { createTranslator, interpolate };
  if (isNode) module.exports = api;
  else IDup.i18n = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
