/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
/* Loads and saves settings. The access token is deliberately never stored. */
(function (global) {
  'use strict';
  const IDup = (global.IDup = global.IDup || {});
  const isNode = typeof module !== 'undefined' && module.exports;
  const config = isNode ? require('./config') : IDup.config;

  function mergeSettings(defaults, stored) {
    const result = {};
    for (const key of Object.keys(defaults)) {
      const def = defaults[key];
      const val = stored ? stored[key] : undefined;
      if (def && typeof def === 'object') {
        result[key] = mergeSettings(def, val && typeof val === 'object' ? val : undefined);
      } else {
        result[key] = val !== undefined && typeof val === typeof def ? val : def;
      }
    }
    return result;
  }

  function loadSettings(storage) {
    try {
      const raw = storage.getItem(config.STORAGE_KEY);
      return mergeSettings(config.DEFAULT_SETTINGS, raw ? JSON.parse(raw) : undefined);
    } catch (e) {
      return mergeSettings(config.DEFAULT_SETTINGS, undefined);
    }
  }

  function saveSettings(storage, settings) {
    try {
      storage.setItem(config.STORAGE_KEY, JSON.stringify(settings));
      return true;
    } catch (e) {
      return false;
    }
  }

  const api = { mergeSettings, loadSettings, saveSettings };
  if (isNode) module.exports = api;
  else IDup.settings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
