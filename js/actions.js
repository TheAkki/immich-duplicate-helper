/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
/* Executes the proposals (delete, stack or tag). */
(function (global) {
  'use strict';
  const IDup = (global.IDup = global.IDup || {});
  const isNode = typeof module !== 'undefined' && module.exports;
  const config = isNode ? require('./config') : IDup.config;
  const rules = isNode ? require('./rules') : IDup.rules;

  const proposalIds = (plan) => plan.proposals.map((p) => p.asset.id);

  const targetsOf = (plan, action) => rules.targetsFor(plan, action);
  const hasTargets = (plan, action) => targetsOf(plan, action).length > 0;

  function countTargets(plans, action) {
    const withTargets = plans.filter((p) => hasTargets(p, action));
    if (action === config.ACTIONS.STACK) return withTargets.length;
    return withTargets.reduce((sum, p) => sum + p.proposals.length, 0);
  }

  async function deleteAll(client, plans) {
    const ids = plans.flatMap(proposalIds);
    if (ids.length === 0) return { ok: 0, failed: [] };
    try {
      await client.deleteAssets(ids);
      return { ok: ids.length, failed: [] };
    } catch (error) {
      return { ok: 0, failed: ids.map((id) => ({ id, error })) };
    }
  }

  const groupIds = (plan) => plan.entries.map((e) => e.asset.id);

  async function tagIds(client, ids, tagName) {
    if (ids.length === 0) return { ok: 0, failed: [] };
    try {
      const outcome = (await client.tagAssets(tagName, ids)) || {};
      const tag = outcome.tag ? outcome.tag.value || outcome.tag.name : undefined;
      return tag ? { ok: ids.length, failed: [], tag } : { ok: ids.length, failed: [] };
    } catch (error) {
      return { ok: 0, failed: ids.map((id) => ({ id, error })) };
    }
  }

  const tagAll = (client, plans, tagName) => tagIds(client, plans.flatMap(proposalIds), tagName);

  // Tags the given plan entries (any role: tagging changes no files, so protected copies are fine too).
  const tagEntries = (client, entries, tagName) => tagIds(client, entries.map((e) => e.asset.id), tagName);

  // Marks all images of the groups (original and copies) with the skip tag.
  const markSkipped = (client, plans, tagName) => tagIds(client, plans.flatMap(groupIds), tagName);

  async function stackAll(client, plans) {
    const result = { ok: 0, failed: [] };
    for (const plan of plans.filter((p) => hasTargets(p, config.ACTIONS.STACK))) {
      try {
        await client.createStack([plan.original.id, ...plan.stackable.map((e) => e.asset.id)]);
        result.ok += 1;
      } catch (error) {
        result.failed.push({ id: plan.original.id, error });
      }
    }
    return result;
  }

  function execute(client, plans, action, options = {}) {
    if (action === config.ACTIONS.STACK) return stackAll(client, plans);
    if (action === config.ACTIONS.TAG) return tagAll(client, plans, options.tagName);
    return deleteAll(client, plans);
  }

  // A plan restricted to a single image of its group (the original and the entries stay as they are).
  function singleTargetPlan(plan, entry) {
    return { ...plan, proposals: [entry], stackable: [entry] };
  }

  // Per-image buttons for deleting and stacking only make sense with several targets. For stacks this stacks
  // just that image with the original; Immich merges it into an existing stack of the original.
  // Tagging has its own button on every copy, independent of the chosen action.
  function offersSingleAction(plan, action) {
    return action !== config.ACTIONS.TAG && targetsOf(plan, action).length > 1;
  }

  const api = { execute, countTargets, markSkipped, tagEntries, singleTargetPlan, offersSingleAction, hasTargets };
  if (isNode) module.exports = api;
  else IDup.actions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
