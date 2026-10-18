/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
/* Display filters for the computed group plans. */
(function (global) {
  'use strict';
  const IDup = (global.IDup = global.IDup || {});
  const isNode = typeof module !== 'undefined' && module.exports;
  const model = isNode ? require('./assetModel') : IDup.assetModel;
  const config = isNode ? require('./config') : IDup.config;
  const rules = isNode ? require('./rules') : IDup.rules;
  const patterns = isNode ? require('./patterns') : IDup.patterns;

  function onlyProtected(plan) {
    return plan.entries.length > 0 && plan.entries.every((e) => model.isProtected(e.asset));
  }

  // Builds a matcher for the search text: case-insensitive "contains"; `*` matches any characters
  // and `?` exactly one. Without wildcards it is a plain text search. Empty text matches everything.
  function createSearchMatcher(search) {
    const needle = String(search || '').trim();
    if (!needle) return () => true;
    if (!/[*?]/.test(needle)) {
      const lower = needle.toLowerCase();
      return (text) => text.toLowerCase().includes(lower);
    }
    const regex = patterns.globToRegExp(needle);
    return (text) => regex.test(text);
  }

  function matchesSearch(plan, matches) {
    return plan.entries.some((e) => matches(e.asset.fileName) || matches(e.asset.path));
  }

  function allProposalsTagged(plan, taggedIds) {
    return plan.proposals.length > 0 && plan.proposals.every((p) => taggedIds.has(p.asset.id));
  }

  // Skip filter: deletable means neither protected (external/read-only) nor the original.
  // A group counts as skipped if all deletable files carry the skip tag. Without any deletable file
  // nothing is left to decide, so then the original and the protected files must all carry it.
  function allDeletableSkipped(plan, skipIds) {
    const deletable = plan.entries.filter(
      (e) => e.role !== config.ROLES.ORIGINAL && !model.isProtected(e.asset)
    );
    const relevant = deletable.length > 0 ? deletable : plan.entries;
    return relevant.length > 0 && relevant.every((e) => skipIds.has(e.asset.id));
  }

  // Sets of files in the group that share a name (case-insensitive, only from 2 files on).
  function sameNameSets(plan) {
    const byName = new Map();
    for (const { asset } of plan.entries) {
      const key = asset.fileName.toLowerCase();
      if (!key) continue;
      byName.set(key, [...(byName.get(key) || []), asset]);
    }
    return [...byName.values()].filter((set) => set.length > 1);
  }

  // True if the group has a file name that occurs more than once.
  function hasSameName(plan) {
    return sameNameSets(plan).length > 0;
  }

  // True if the group has same-named files and every one of them is protected (external library or
  // read-only path), so none of these same-named pairs can be cleaned up by deleting.
  function sameNameAllProtected(plan) {
    const sets = sameNameSets(plan);
    return sets.length > 0 && sets.every((set) => set.every((asset) => model.isProtected(asset)));
  }

  // Splits a path into lower-case directory, base name and extension ("/a/B/IMG_1.NEF" -> "/a/b", "img_1", "nef").
  function splitPath(path, fileName) {
    const full = path || fileName || '';
    const slash = full.lastIndexOf('/');
    const name = full.slice(slash + 1);
    const dot = name.lastIndexOf('.');
    return {
      dir: (slash >= 0 ? full.slice(0, slash) : '').toLowerCase(),
      base: (dot > 0 ? name.slice(0, dot) : name).toLowerCase(),
      ext: (dot > 0 ? name.slice(dot + 1) : '').toLowerCase(),
    };
  }

  // True if two files of the group share directory and base name but differ in file type (e.g. NEF and JPG).
  function hasSameNameOtherType(plan) {
    const extensions = new Map();
    for (const { asset } of plan.entries) {
      const { dir, base, ext } = splitPath(asset.path, asset.fileName);
      const key = `${dir}\n${base}`;
      extensions.set(key, new Set([...(extensions.get(key) || []), ext]));
    }
    return [...extensions.values()].some((set) => set.size > 1);
  }

  // Duplicates are the proposals and the protected copies (series images are not duplicates).
  // True if there is at least one duplicate and all of them are protected (external or read-only).
  function allDuplicatesProtected(plan) {
    const ROLES = config.ROLES;
    const duplicates = plan.entries.filter((e) => e.role === ROLES.PROPOSAL || e.role === ROLES.PROTECTED);
    return duplicates.length > 0 && duplicates.every((e) => e.role === ROLES.PROTECTED);
  }

  // The filters in the order they are applied; each step says whether a plan is kept.
  // "Only protected duplicates", "only same name, other type" and "only same name, all protected" override the
  // two filters that would hide exactly these groups (they often have no proposals).
  function filterSteps(filters, context) {
    const f = filters || {};
    const modes = config.FILTER_MODES;
    const taggedIds = context.taggedAssetIds || new Set();
    const skipIds = context.skipAssetIds || new Set();
    const matches = createSearchMatcher(f.search);
    const searching = String(f.search || '').trim() !== '';
    const overrides =
      Boolean(f.onlyProtectedDuplicates) ||
      f.sameNameOtherType === modes.ONLY ||
      f.sameNameAllProtected === modes.ONLY;
    const stackMode = context.action === config.ACTIONS.STACK;
    // With the stack action protected copies are targets too, so such groups are not "nothing to do".
    const hasTargets = (plan) => rules.targetsFor(plan, context.action).length > 0;
    return [
      {
        key: 'sameNameOtherType',
        keep: (plan) => {
          if (f.sameNameOtherType === modes.ONLY) return hasSameNameOtherType(plan);
          if (f.sameNameOtherType === modes.HIDE) return !hasSameNameOtherType(plan);
          return true;
        },
      },
      { key: 'onlyProtectedDuplicates', keep: (plan) => !f.onlyProtectedDuplicates || allDuplicatesProtected(plan) },
      {
        key: 'hideProtectedOnlyGroups',
        keep: (plan) =>
          overrides || !f.hideProtectedOnlyGroups || !onlyProtected(plan) || (stackMode && hasTargets(plan)),
      },
      { key: 'hideGroupsWithoutProposals', keep: (plan) => overrides || !f.hideGroupsWithoutProposals || hasTargets(plan) },
      { key: 'onlySameFilename', keep: (plan) => !f.onlySameFilename || hasSameName(plan) },
      {
        key: 'sameNameAllProtected',
        keep: (plan) => {
          if (f.sameNameAllProtected === modes.ONLY) return sameNameAllProtected(plan);
          if (f.sameNameAllProtected === modes.HIDE) return !sameNameAllProtected(plan);
          return true;
        },
      },
      { key: 'hideSkipped', keep: (plan) => !f.hideSkipped || !allDeletableSkipped(plan, skipIds) },
      { key: 'hideAllTagged', keep: (plan) => !f.hideAllTagged || !allProposalsTagged(plan, taggedIds) },
      { key: 'search', keep: (plan) => !searching || matchesSearch(plan, matches) },
    ];
  }

  function applyFilters(plans, filters, context = {}) {
    const steps = filterSteps(filters, context);
    return plans.filter((plan) => steps.every((step) => step.keep(plan)));
  }

  // How many groups each filter removed, applied in order (a group counts for the first filter that hides it).
  // Only filters that removed something are listed. Explains why a list is shorter or empty.
  function filterFunnel(plans, filters, context = {}) {
    let remaining = plans;
    const steps = [];
    for (const step of filterSteps(filters, context)) {
      const kept = remaining.filter(step.keep);
      if (kept.length < remaining.length) steps.push({ key: step.key, removed: remaining.length - kept.length });
      remaining = kept;
    }
    return { total: plans.length, kept: remaining.length, steps };
  }

  // Limits the number of displayed groups; unknown or unlimited values let everything through.
  function applyLimit(plans, limit) {
    const max = limit === config.UNLIMITED ? NaN : parseInt(limit, 10);
    return max > 0 ? plans.slice(0, max) : plans;
  }

  const api = { applyFilters, applyLimit, createSearchMatcher, filterFunnel };
  if (isNode) module.exports = api;
  else IDup.filters = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
