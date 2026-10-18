/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
// KI-generiert
const test = require('node:test');
const assert = require('node:assert/strict');
const { execute, countTargets, markSkipped, singleTargetPlan, offersSingleAction, hasTargets, tagEntries } = require('../js/actions');

// protectedIds: protected copies; they are stackable but never proposals
const plan = (origId, ids, protectedIds = []) => {
  const proposals = ids.map((id) => ({ asset: { id } }));
  const protectedCopies = protectedIds.map((id) => ({ asset: { id } }));
  return { original: { id: origId }, proposals, stackable: [...proposals, ...protectedCopies] };
};

test('actions', async (t) => {
  const plans = [plan('o1', ['a', 'b']), plan('o2', []), plan('o3', ['c'])];

  await t.test('countTargets', () => {
    assert.equal(countTargets(plans, 'delete'), 3);
    assert.equal(countTargets(plans, 'stack'), 2);
    assert.equal(countTargets([], 'delete'), 0);
  });

  await t.test('delete collects all IDs in one call', async () => {
    const calls = [];
    const client = { deleteAssets: async (ids) => calls.push(ids) };
    const r = await execute(client, plans, 'delete');
    assert.deepEqual(calls, [['a', 'b', 'c']]);
    assert.deepEqual(r, { ok: 3, failed: [] });
  });

  await t.test('delete without proposals calls nothing', async () => {
    const client = { deleteAssets: async () => assert.fail('not expected') };
    assert.deepEqual(await execute(client, [plan('o', [])], 'delete'), { ok: 0, failed: [] });
  });

  await t.test('delete error is reported per ID', async () => {
    const client = { deleteAssets: async () => { throw new Error('boom'); } };
    const r = await execute(client, plans, 'delete');
    assert.equal(r.ok, 0);
    assert.deepEqual(r.failed.map((f) => f.id), ['a', 'b', 'c']);
  });

  await t.test('stack creates one stack per group, original first', async () => {
    const calls = [];
    const client = { createStack: async (ids) => calls.push(ids) };
    const r = await execute(client, plans, 'stack');
    assert.deepEqual(calls, [['o1', 'a', 'b'], ['o3', 'c']]);
    assert.equal(r.ok, 2);
  });

  await t.test('tag assigns the tag to all proposals', async () => {
    const calls = [];
    const client = { tagAssets: async (name, ids) => calls.push([name, ids]) };
    const r = await execute(client, plans, 'tag', { tagName: 'dup' });
    assert.deepEqual(calls, [['dup', ['a', 'b', 'c']]]);
    assert.deepEqual(r, { ok: 3, failed: [] });
    assert.equal(countTargets(plans, 'tag'), 3);
  });

  await t.test('tag: no call without proposals, error per ID', async () => {
    const never = { tagAssets: async () => assert.fail('not expected') };
    assert.deepEqual(await execute(never, [plan('o', [])], 'tag'), { ok: 0, failed: [] });
    const broken = { tagAssets: async () => { throw new Error('x'); } };
    const r = await execute(broken, plans, 'tag');
    assert.deepEqual(r.failed.map((f) => f.id), ['a', 'b', 'c']);
  });

  await t.test('markSkipped tags the original and copies of all groups', async () => {
    const withEntries = (orig, ids) => ({
      ...plan(orig, ids),
      entries: [orig, ...ids].map((id) => ({ asset: { id } })),
    });
    const calls = [];
    const client = { tagAssets: async (name, ids) => calls.push([name, ids]) };
    const r = await markSkipped(client, [withEntries('o1', ['a']), withEntries('o2', [])], 'skip');
    assert.deepEqual(calls, [['skip', ['o1', 'a', 'o2']]]);
    assert.deepEqual(r, { ok: 3, failed: [] });
    assert.deepEqual(await markSkipped(client, [], 'skip'), { ok: 0, failed: [] });
    const broken = { tagAssets: async () => { throw new Error('x'); } };
    assert.equal((await markSkipped(broken, [withEntries('o', [])], 'skip')).failed.length, 1);
  });

  await t.test('singleTargetPlan restricts a plan to one proposal; the original stays', () => {
    const p = plan('o1', ['a', 'b']);
    const single = singleTargetPlan(p, p.proposals[1]);
    assert.deepEqual(single.proposals.map((x) => x.asset.id), ['b']);
    assert.equal(single.original.id, 'o1');
    assert.equal(p.proposals.length, 2, 'the original plan is not modified');
    assert.equal(countTargets([single], 'delete'), 1);
  });

  await t.test('offersSingleAction: only with several proposals', () => {
    for (const action of ['delete', 'stack']) {
      assert.equal(offersSingleAction(plan('o', ['a', 'b']), action), true, action);
      assert.equal(offersSingleAction(plan('o', ['a']), action), false, action);
      assert.equal(offersSingleAction(plan('o', []), action), false, action);
    }
    assert.equal(offersSingleAction(plan('o', ['a', 'b']), 'tag'), false, 'tagging has its own button on every copy');
  });

  await t.test('a single proposal is stacked with the original only', async () => {
    const p = plan('o1', ['a', 'b']);
    const calls = [];
    const client = { createStack: async (ids) => calls.push(ids) };
    const r = await execute(client, [singleTargetPlan(p, p.proposals[1])], 'stack');
    assert.deepEqual(calls, [['o1', 'b']]);
    assert.equal(r.ok, 1);
    assert.equal(countTargets([singleTargetPlan(p, p.proposals[1])], 'stack'), 1);
  });

  await t.test('a single proposal is deleted or tagged on its own', async () => {
    const p = plan('o1', ['a', 'b']);
    const single = singleTargetPlan(p, p.proposals[0]);
    const deleted = [];
    await execute({ deleteAssets: async (ids) => deleted.push(ids) }, [single], 'delete');
    assert.deepEqual(deleted, [['a']]);
    const tagged = [];
    await execute({ tagAssets: async (name, ids) => tagged.push([name, ids]) }, [single], 'tag', { tagName: 'dup' });
    assert.deepEqual(tagged, [['dup', ['a']]]);
  });

  await t.test('stack includes protected copies, delete and tag do not', async () => {
    const p = plan('o1', ['a'], ['r1', 'r2']);
    const stacks = [];
    await execute({ createStack: async (ids) => stacks.push(ids) }, [p], 'stack');
    assert.deepEqual(stacks, [['o1', 'a', 'r1', 'r2']]);
    const deleted = [];
    await execute({ deleteAssets: async (ids) => deleted.push(ids) }, [p], 'delete');
    assert.deepEqual(deleted, [['a']]);
    const tagged = [];
    await execute({ tagAssets: async (name, ids) => tagged.push(ids) }, [p], 'tag');
    assert.deepEqual(tagged, [['a']]);
  });

  await t.test('a group with only protected copies can be stacked but has nothing to delete', async () => {
    const onlyProtected = plan('o1', [], ['r1']);
    assert.equal(countTargets([onlyProtected], 'stack'), 1);
    assert.equal(countTargets([onlyProtected], 'delete'), 0);
    assert.equal(hasTargets(onlyProtected, 'stack'), true);
    assert.equal(hasTargets(onlyProtected, 'delete'), false);
    const stacks = [];
    const r = await execute({ createStack: async (ids) => stacks.push(ids) }, [onlyProtected], 'stack');
    assert.deepEqual(stacks, [['o1', 'r1']]);
    assert.equal(r.ok, 1);
  });

  await t.test('a single protected copy is stacked with the original only', async () => {
    const p = plan('o1', ['a'], ['r1', 'r2']);
    const stacks = [];
    await execute({ createStack: async (ids) => stacks.push(ids) }, [singleTargetPlan(p, p.stackable[1])], 'stack');
    assert.deepEqual(stacks, [['o1', 'r1']]);
    assert.equal(offersSingleAction(p, 'stack'), true);
    assert.equal(offersSingleAction(p, 'delete'), false, 'only one proposal for delete');
  });

  await t.test('tagEntries tags any entries (also protected ones) individually', async () => {
    const calls = [];
    const client = { tagAssets: async (name, ids) => calls.push([name, ids]) };
    const r = await tagEntries(client, [{ asset: { id: 'r1' } }], 'dup');
    assert.deepEqual(calls, [['dup', ['r1']]]);
    assert.deepEqual(r, { ok: 1, failed: [] });
    assert.deepEqual(await tagEntries(client, [], 'dup'), { ok: 0, failed: [] });
    assert.equal(calls.length, 1, 'no call without entries');
    const broken = { tagAssets: async () => { throw new Error('403'); } };
    const failed = await tagEntries(broken, [{ asset: { id: 'x' } }], 'dup');
    assert.equal(failed.ok, 0);
    assert.deepEqual(failed.failed.map((f) => f.id), ['x']);
  });

  await t.test('tagging reports which tag was used', async () => {
    const client = { tagAssets: async () => ({ tag: { id: 'T', name: 'duplicate', value: 'folder/duplicate' } }) };
    const r = await tagEntries(client, [{ asset: { id: 'x' } }], 'duplicate');
    assert.deepEqual(r, { ok: 1, failed: [], tag: 'folder/duplicate' });
  });

  await t.test('stack continues after errors', async () => {
    let n = 0;
    const client = { createStack: async () => { if (n++ === 0) throw new Error('x'); } };
    const r = await execute(client, plans, 'stack');
    assert.equal(r.ok, 1);
    assert.deepEqual(r.failed.map((f) => f.id), ['o1']);
  });
});
