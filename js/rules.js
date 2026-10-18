/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
/* Rule engine: picks the original, detects real duplicates, explains proposals. */
(function (global) {
  'use strict';
  const IDup = (global.IDup = global.IDup || {});
  const isNode = typeof module !== 'undefined' && module.exports;
  const config = isNode ? require('./config') : IDup.config;
  const model = isNode ? require('./assetModel') : IDup.assetModel;

  // Positive value = a is better than b.
  const COMPARATORS = Object.freeze({
    // Images in a duplicate album are preferably duplicates, hence worse
    duplicateAlbum: (a, b) => Number(b.inDuplicateAlbum) - Number(a.inDuplicateAlbum),
    originalPattern: (a, b) => Number(a.matchesOriginalPattern) - Number(b.matchesOriginalPattern),
    duplicatePattern: (a, b) => Number(b.matchesDuplicatePattern) - Number(a.matchesDuplicatePattern),
    duplicateTag: (a, b) => Number(b.inDuplicateTag) - Number(a.inDuplicateTag),
    preferredTag: (a, b) => Number(a.inPreferredTag) - Number(b.inPreferredTag),
    preferredAlbum: (a, b) => Number(a.inPreferredAlbum) - Number(b.inPreferredAlbum),
    externalLibrary: (a, b) => Number(a.isExternal) - Number(b.isExternal),
    readOnly: (a, b) => Number(a.isReadOnly) - Number(b.isReadOnly),
    resolution: (a, b) => a.pixels - b.pixels,
    exif: (a, b) => a.exifScore - b.exifScore,
    fileSize: (a, b) => a.fileSize - b.fileSize,
  });

  const REASON_PARAMS = Object.freeze({
    resolution: (a, b) => ({ orig: a.resolution, cand: b.resolution }),
    exif: (a, b) => ({ orig: a.exifScore, cand: b.exifScore }),
    fileSize: (a, b) => ({ orig: a.sizeLabel, cand: b.sizeLabel }),
  });

  function activeRules(rules) {
    return config.RULE_ORDER.filter((name) => rules && rules[name]);
  }

  function tieBreak(a, b) {
    if (a.timestamp !== null && b.timestamp !== null && a.timestamp !== b.timestamp) {
      return b.timestamp - a.timestamp; // the older image is better
    }
    if (a.id === b.id) return 0;
    return a.id < b.id ? 1 : -1;
  }

  function compareAssets(a, b, rules) {
    for (const name of activeRules(rules)) {
      const diff = COMPARATORS[name](a, b);
      if (diff !== 0) return diff;
    }
    return tieBreak(a, b);
  }

  function pickOriginal(assets, rules) {
    return [...assets].sort((a, b) => compareAssets(b, a, rules))[0] || null;
  }

  // Messengers rename files: if a name matches a duplicate pattern, the file name rule does not apply.
  function filenameExempt(original, candidate, hard) {
    return Boolean(hard.patternExemptsFilename) && (original.matchesDuplicatePattern || candidate.matchesDuplicatePattern);
  }

  function matchesHardRules(original, candidate, hard, toleranceMs) {
    const tolerance = toleranceMs === undefined ? config.TIMESTAMP_TOLERANCE_MS : toleranceMs;
    if (hard && hard.filename && !filenameExempt(original, candidate, hard)) {
      if (original.fileName.toLowerCase() !== candidate.fileName.toLowerCase()) return false;
    }
    if (hard && hard.timestamp) {
      if (original.timestamp === null || candidate.timestamp === null) return false;
      if (Math.abs(original.timestamp - candidate.timestamp) > tolerance) return false;
    }
    return true;
  }

  function explain(original, candidate, rules) {
    const reasons = activeRules(rules)
      .filter((name) => COMPARATORS[name](original, candidate) > 0)
      .map((name) => ({
        key: `reason.${name}`,
        params: REASON_PARAMS[name] ? REASON_PARAMS[name](original, candidate) : {},
      }));
    return reasons.length ? reasons : [{ key: 'reason.tieBreak', params: {} }];
  }

  function classify(asset, original, settings) {
    const ROLES = config.ROLES;
    if (asset === original) return { asset, role: ROLES.ORIGINAL, reasons: [] };
    if (!matchesHardRules(original, asset, settings.hard)) {
      return { asset, role: ROLES.UNRELATED, reasons: [] };
    }
    if (model.isProtected(asset)) return { asset, role: ROLES.PROTECTED, reasons: [] };
    return { asset, role: ROLES.PROPOSAL, reasons: explain(original, asset, settings.rules) };
  }

  function buildGroupPlan(group, settings, context = {}) {
    const prefixes = model.parsePrefixes(settings.readOnlyPrefixes);
    const assets = (group.assets || []).map((raw) => model.normalizeAsset(raw, prefixes, context));
    const original = pickOriginal(assets, settings.rules);
    if (!original) return { duplicateId: group.duplicateId, original: null, entries: [], proposals: [], stackable: [] };
    const classified = assets.map((a) => classify(a, original, settings));
    const entries = [classified.find((e) => e.asset === original), ...classified.filter((e) => e.asset !== original)];
    return {
      duplicateId: group.duplicateId,
      original,
      entries,
      proposals: entries.filter((e) => e.role === config.ROLES.PROPOSAL),
      // Stacking changes no files, so protected copies can be stacked with the original as well.
      stackable: entries.filter((e) => e.role === config.ROLES.PROPOSAL || e.role === config.ROLES.PROTECTED),
    };
  }

  // The entries an action works on: stacks include protected copies, deleting and tagging only the proposals.
  function targetsFor(plan, action) {
    return action === config.ACTIONS.STACK ? plan.stackable : plan.proposals;
  }

  function buildPlan(groups, settings, context) {
    return groups.map((g) => buildGroupPlan(g, settings, context));
  }

  // true if the "external library" rule is active, groups exist, but no image was detected as external
  function noExternalDetected(plans, settings) {
    if (!settings.rules || !settings.rules.externalLibrary) return false;
    const assets = plans.flatMap((p) => p.entries.map((e) => e.asset));
    return assets.length > 0 && !assets.some((a) => a.isExternal);
  }

  const api = { compareAssets, pickOriginal, matchesHardRules, explain, buildGroupPlan, buildPlan, targetsFor, noExternalDetected };
  if (isNode) module.exports = api;
  else IDup.rules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
