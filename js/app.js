/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 theakki
 * See the LICENSE file in the project root.
 */
/* UI layer: connects the form, the rule engine and the Immich API. Contains no business logic. */
(function (global) {
  'use strict';
  const { config, i18n, rules, filters, immichApi, actions, settings: store, locales, albums: albumRule, patterns, tagged, identity, hashcache, limiter, assetModel: model } = global.IDup;
  const doc = global.document;

  const state = {
    settings: store.loadSettings(global.localStorage),
    groups: [],
    libraryPaths: [],
    libraryWarning: '',
    versionInfo: '',
    duplicateAlbumAssetIds: new Set(),
    preferredAlbumAssetIds: new Set(),
    taggedAssetIds: new Set(),
    skipAssetIds: new Set(),
    skipWarning: '',
    duplicateTagAssetIds: new Set(),
    preferredTagAssetIds: new Set(),
    tagRuleWarning: '',
    tagWarning: '',
    albumWarning: '',
    client: null,
    thumbnails: new Map(),
    albums: new Map(),
    tags: new Map(),
    stacks: new Map(),
    details: new Map(),
    schedule: limiter.createLimiter(config.MAX_CONCURRENT_REQUESTS),
    verifySchedule: limiter.createLimiter(config.MAX_CONCURRENT_DOWNLOADS),
    verifier: null,
  };
  const translator = i18n.createTranslator(locales, {
    language: state.settings.language,
    fallback: config.FALLBACK_LANGUAGE,
  });
  const t = translator.t;
  // Downloaded originals are hashed once; the hash is cached per asset (also across page reloads).
  const hashOf = identity.createContentHasher({
    fetchBytes: (id) => state.verifySchedule(() => state.client.getOriginalBytes(id)),
    cache: hashcache.createHashCache({
      storage: global.localStorage,
      storageKey: config.HASH_CACHE_STORAGE_KEY,
      maxEntries: config.HASH_CACHE_MAX_ENTRIES,
    }),
  });
  state.verifier = identity.createVerifier((original, asset) => identity.compareContents(hashOf, original, asset));
  const $ = (selector) => doc.querySelector(selector);

  function el(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => o[k], obj);
  }

  function setPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((o, k) => o[k], obj)[last] = value;
  }

  // ---- Translation & form ----------------------------------------------------
  function applyTranslations() {
    doc.documentElement.lang = translator.getLanguage();
    doc.querySelectorAll('[data-i18n]').forEach((n) => {
      n.textContent = t(n.dataset.i18n);
    });
    doc.title = t('app.title');
  }

  function fillLanguageSelect() {
    const select = $('#language');
    translator.languages().forEach(({ code, name }) => {
      const option = el('option', '', name);
      option.value = code;
      select.appendChild(option);
    });
    select.value = translator.getLanguage();
    select.addEventListener('change', () => {
      translator.setLanguage(select.value);
      state.settings.language = select.value;
      persist();
      applyTranslations();
      render();
    });
  }

  function readInput(input) {
    if (input.type === 'checkbox') return input.checked;
    return input.value;
  }

  function writeInput(input, value) {
    if (input.type === 'checkbox') input.checked = value;
    else if (input.type === 'radio') input.checked = input.value === value;
    else input.value = value;
  }

  function fillLimitSelect() {
    const select = $('#limit');
    config.LIMIT_OPTIONS.forEach((value) => {
      const option = el('option', '', value);
      option.value = value;
      if (value === config.UNLIMITED) option.dataset.i18n = 'filter.limit.all';
      select.appendChild(option);
    });
  }

  function bindSettings() {
    doc.querySelectorAll('[data-setting]').forEach((input) => {
      const path = input.dataset.setting;
      writeInput(input, getPath(state.settings, path));
      input.addEventListener('change', () => {
        if (input.type === 'radio' && !input.checked) return;
        setPath(state.settings, path, readInput(input));
        persist();
        render();
      });
      if (input.type === 'search' || input.tagName === 'TEXTAREA') {
        input.addEventListener('input', () => input.dispatchEvent(new Event('change')));
      }
    });
  }

  function persist() {
    store.saveSettings(global.localStorage, state.settings);
  }

  // ---- Status ----------------------------------------------------------------
  function setStatus(message, isError) {
    const status = $('#status');
    status.textContent = message;
    status.className = isError ? 'error' : '';
  }

  // ---- Loading ---------------------------------------------------------------
  async function loadGroups() {
    const token = $('#token').value.trim();
    if (!state.settings.serverUrl.trim() || !token) {
      setStatus(t('conn.missing'), true);
      return;
    }
    setStatus(t('conn.loading'));
    try {
      state.client = immichApi.createClient({ baseUrl: state.settings.serverUrl, apiKey: token });
      state.groups = await state.client.getDuplicates();
      await loadVersionInfo();
      await loadLibraries();
      await loadAlbumSets();
      await loadTagged();
      await loadSkipped();
      await loadTagRuleSets();
      clearThumbnails();
      setStatus(`${t('conn.loaded', { count: state.groups.length })} ${state.versionInfo}`);
      render();
    } catch (error) {
      setStatus(t('conn.error', { message: error.message }), true);
    }
  }

  async function loadVersionInfo() {
    const version = await state.client.getServerVersion();
    state.versionInfo = t('conn.version', {
      version: immichApi.formatVersion(version),
      mode: await state.client.getSearchMode(),
    });
  }

  async function loadLibraries() {
    try {
      state.libraryPaths = model.libraryImportPaths(await state.client.getLibraries());
      state.libraryWarning = '';
    } catch (error) {
      state.libraryPaths = [];
      state.libraryWarning = t('warn.librariesFailed', { message: error.message });
    }
  }

  async function loadTagged() {
    state.tagWarning = '';
    try {
      state.taggedAssetIds = await tagged.loadTaggedAssetIds(state.client, state.settings.tagName);
    } catch (error) {
      state.taggedAssetIds = new Set();
      state.tagWarning = t('warn.tagsFailed', { message: error.message });
    }
  }

  async function loadSkipped() {
    state.skipWarning = '';
    try {
      state.skipAssetIds = await tagged.loadTaggedAssetIds(state.client, state.settings.skipTagName);
    } catch (error) {
      state.skipAssetIds = new Set();
      state.skipWarning = t('warn.tagsFailed', { message: error.message });
    }
  }

  async function skipGroup(plan) {
    const result = await actions.markSkipped(state.client, [plan], state.settings.skipTagName);
    setStatus(describeResult(result), result.failed.length > 0);
    clearDetailCaches();
    await loadSkipped();
    render();
  }

  async function removeSkipFromAll() {
    const tag = state.settings.skipTagName;
    const count = state.skipAssetIds.size;
    if (!state.client || count === 0 || !global.confirm(t('filter.removeSkip.confirm', { tag, count }))) return;
    try {
      const result = await tagged.removeTagFromAll(state.client, tag);
      setStatus(describeResult(result), result.failed.length > 0);
    } catch (error) {
      setStatus(t('conn.error', { message: error.message }), true);
    }
    clearDetailCaches();
    await loadSkipped();
    render();
  }

  async function loadTagRuleSets() {
    const warnings = [];
    async function load(namesText) {
      try {
        const result = await tagged.loadTagsAssets(state.client, namesText);
        if (result.missing.length) warnings.push(t('warn.tagsMissing', { names: result.missing.join(', ') }));
        return result.assetIds;
      } catch (error) {
        warnings.push(t('warn.tagsFailed', { message: error.message }));
        return new Set();
      }
    }
    state.duplicateTagAssetIds = await load(state.settings.duplicateTags);
    state.preferredTagAssetIds = await load(state.settings.preferredTags);
    state.tagRuleWarning = warnings.join(' ');
  }

  async function loadAlbumSets() {
    const warnings = [];
    async function load(namesText) {
      try {
        const result = await albumRule.loadAlbumAssets(state.client, namesText);
        if (result.missing.length) warnings.push(t('warn.albumsMissing', { names: result.missing.join(', ') }));
        return result.assetIds;
      } catch (error) {
        warnings.push(t('warn.albumsFailed', { message: error.message }));
        return new Set();
      }
    }
    state.duplicateAlbumAssetIds = await load(state.settings.duplicateAlbums);
    state.preferredAlbumAssetIds = await load(state.settings.preferredAlbums);
    state.albumWarning = warnings.join(' ');
  }

  // Thumbnails and verification results stay cached across loads: they only depend on the files.
  function clearThumbnails() {
    state.albums.clear();
    clearDetailCaches();
  }

  async function loadThumbnail(img, id) {
    if (!state.client) return;
    try {
      if (!state.thumbnails.has(id)) {
        const blob = await state.schedule(() => state.client.getThumbnail(id));
        state.thumbnails.set(id, URL.createObjectURL(blob));
      }
      img.src = state.thumbnails.get(id);
    } catch (e) {
      img.alt = t('conn.error', { message: e.message });
    }
  }

  function listText(names) {
    if (names === undefined) return t('prop.listLoading');
    if (names === null) return t('prop.listUnknown');
    return names.length ? names.join(', ') : t('prop.listNone');
  }

  // Cache value: stack info, false (not in a stack), null (failed) or undefined (not loaded yet).
  function stackText(stack, assetId) {
    if (stack === undefined) return t('prop.listLoading');
    if (stack === null) return t('prop.listUnknown');
    const summary = model.stackSummary(stack || null, assetId);
    if (!summary.inStack) return t('prop.no');
    const primary = summary.isPrimary ? `, ${t('prop.stackPrimary')}` : '';
    return `${t('prop.yes')} (${t('prop.stackCount', { count: summary.count })}${primary})`;
  }

  // Tags and stack come from one asset details call per image, shared by both properties.
  function loadDetails(id) {
    if (!state.details.has(id)) {
      const promise = state.schedule(() => state.client.getAssetDetails(id));
      promise.catch(() => state.details.delete(id));
      state.details.set(id, promise);
    }
    return state.details.get(id);
  }

  function clearDetailCaches() {
    state.tags.clear();
    state.stacks.clear();
    state.details.clear();
  }

  // Property that is loaded per image on demand. The fetcher schedules its own API calls.
  function lazyItem(label, cache, id, fetcher, format) {
    const item = el('li', '', `${label}: ${format(cache.get(id))}`);
    loadLazy(item, label, cache, id, fetcher, format);
    return item;
  }

  async function loadLazy(item, label, cache, id, fetcher, format) {
    if (!state.client) return;
    if (!cache.has(id)) {
      try {
        cache.set(id, await fetcher());
      } catch (e) {
        cache.set(id, null);
      }
    }
    item.textContent = `${label}: ${format(cache.get(id))}`;
  }

  // ---- Executing -------------------------------------------------------------
  function describeResult(result) {
    const summary = t('result.done', { ok: result.ok, failed: result.failed.length });
    if (!result.failed.length) return result.tag ? `${summary} ${t('result.tagUsed', { tag: result.tag })}` : summary;
    return `${summary} ${t('conn.error', { message: result.failed[0].error.message })}`;
  }

  async function run(plans) {
    const action = state.settings.action;
    const count = actions.countTargets(plans, action);
    if (count === 0 || !global.confirm(t(`result.confirm.${action}`, { count }))) return;
    const result = await actions.execute(state.client, plans, action, { tagName: state.settings.tagName });
    setStatus(describeResult(result), result.failed.length > 0);
    state.groups = await state.client.getDuplicates();
    clearDetailCaches();
    await loadTagged();
    await loadSkipped();
    render();
  }

  // ---- Rendering -------------------------------------------------------------
  function propertyList(asset) {
    const yesNo = (v) => t(v ? 'prop.yes' : 'prop.no');
    const exifText = asset.exifFields.length ? asset.exifFields.join(', ') : t('prop.exifNone');
    const list = el('ul', 'props');
    if (asset.tagNames.length && !state.tags.has(asset.id)) state.tags.set(asset.id, asset.tagNames);
    if (asset.stackInfo && !state.stacks.has(asset.id)) state.stacks.set(asset.id, asset.stackInfo);
    const albumItem = lazyItem(t('prop.albums'), state.albums, asset.id,
      () => state.schedule(() => state.client.getAlbumNames(asset.id)), listText);
    const tagItem = lazyItem(t('prop.tags'), state.tags, asset.id,
      () => loadDetails(asset.id).then((d) => d.tagNames), listText);
    const stackItem = lazyItem(t('prop.stack'), state.stacks, asset.id,
      () => loadDetails(asset.id).then((d) => d.stack || false), (stack) => stackText(stack, asset.id));
    [
      [t('prop.file'), `${asset.fileName} (${asset.path})`],
      [t('prop.readOnly'), asset.isReadOnly ? `${yesNo(true)} (${asset.readOnlyPrefix})` : yesNo(false)],
      [t('prop.external'), yesNo(asset.isExternal)],
      [t('prop.date'), asset.dateLabel],
      [t('prop.resolution'), asset.resolution],
      [t('prop.size'), asset.sizeLabel],
      [t('prop.exif'), exifText],
    ].forEach(([label, value]) => list.appendChild(el('li', '', `${label}: ${value}`)));
    list.appendChild(albumItem);
    list.appendChild(tagItem);
    list.appendChild(stackItem);
    return list;
  }

  async function showVerification(button, result, original, asset) {
    button.disabled = true;
    result.textContent = t('verify.running');
    result.className = 'verify-result';
    // Look up the card only now: with the automatic check the control is not attached yet at start.
    result.closest('.card')?.classList.remove('verify-different', 'verify-identical');
    try {
      const r = await state.verifier.verify(original, asset);
      result.textContent = `${t(`verify.${r.verdict}`)} (${t(`verify.via.${r.method}`)})`;
      result.className = `verify-result ${r.verdict}`;
      const cardClass = identity.cardClass(r);
      if (cardClass) result.closest('.card')?.classList.add(cardClass);
    } catch (error) {
      result.textContent = t('verify.error', { message: error.message });
      result.className = 'verify-result error';
    }
    button.disabled = false;
  }

  // Checks an image against the original; downloads files only if size and checksum are not enough.
  // With "check automatically" the check starts without a click (proposals and protected images satisfy the hard rules).
  function verifyControl(asset, original) {
    const wrap = el('div', 'verify');
    const result = el('div', 'verify-result');
    const button = el('button', '', t('verify.button'));
    button.type = 'button';
    button.addEventListener('click', () => showVerification(button, result, original, asset));
    wrap.append(button, result);
    if (state.client && state.settings.autoVerify) showVerification(button, result, original, asset);
    return wrap;
  }

  function proposalButton(plan, entry) {
    const action = state.settings.action;
    const button = el('button', action === config.ACTIONS.DELETE ? 'danger' : '', t(`result.runOne.${action}`));
    button.type = 'button';
    button.addEventListener('click', () => run([actions.singleTargetPlan(plan, entry)]));
    return button;
  }

  function tagCopyButton(entry) {
    const tag = state.settings.tagName.trim() || config.DEFAULT_TAG_NAME;
    const wrap = el('div', 'tag-copy');
    const button = el('button', '', t('result.tagOne', { tag }));
    button.type = 'button';
    const message = el('div', 'inline-error');
    button.addEventListener('click', async () => {
      button.disabled = true;
      message.textContent = t('result.working');
      const result = await actions.tagEntries(state.client, [entry], state.settings.tagName);
      setStatus(describeResult(result), result.failed.length > 0);
      if (result.failed.length) {
        // Show the reason right at the button (the status line may be out of view) and keep the card.
        message.textContent = describeResult(result);
        console.error('Tagging failed:', result.failed[0].error);
        button.disabled = false;
        return;
      }
      clearDetailCaches();
      await loadTagged();
      render();
    });
    wrap.append(button, message);
    return wrap;
  }

  function renderCard(entry, plan) {
    const { asset, role, reasons } = entry;
    const original = plan.original;
    const card = el('div', `card ${role}`);
    const img = el('img');
    img.alt = asset.fileName;
    loadThumbnail(img, asset.id);
    card.appendChild(img);
    card.appendChild(el('div', 'badge', t(`role.${role}`)));
    card.appendChild(propertyList(asset));
    if (role === config.ROLES.PROPOSAL || role === config.ROLES.PROTECTED) {
      card.appendChild(verifyControl(asset, original));
    }
    const singleRole = role === config.ROLES.PROPOSAL || (role === config.ROLES.PROTECTED && state.settings.action === config.ACTIONS.STACK);
    if (singleRole && actions.offersSingleAction(plan, state.settings.action)) {
      card.appendChild(proposalButton(plan, entry));
    }
    if (role !== config.ROLES.ORIGINAL && state.client) card.appendChild(tagCopyButton(entry));
    if (reasons.length) {
      card.appendChild(el('div', '', t('reason.label') + ':'));
      const list = el('ul', 'reasons');
      reasons.forEach((r) => list.appendChild(el('li', '', t(r.key, r.params))));
      card.appendChild(list);
    }
    return card;
  }

  function renderGroup(plan) {
    const group = el('article', 'group');
    const head = el('div', 'group-head');
    head.appendChild(el('strong', '', `${t('result.group')}: ${plan.original.fileName}`));
    if (actions.hasTargets(plan, state.settings.action)) {
      const button = el('button', state.settings.action === config.ACTIONS.DELETE ? 'danger' : '', t(`result.run.${state.settings.action}`));
      button.type = 'button';
      button.addEventListener('click', () => run([plan]));
      head.appendChild(button);
    }
    const skip = el('button', '', t('result.skip'));
    skip.type = 'button';
    skip.addEventListener('click', () => skipGroup(plan));
    head.appendChild(skip);
    group.appendChild(head);
    const cards = el('div', 'cards');
    plan.entries.forEach((entry) => cards.appendChild(renderCard(entry, plan)));
    group.appendChild(cards);
    return group;
  }

  function render() {
    const compiled = patterns.compilePatterns(state.settings.duplicateFilePatterns);
    const compiledOriginal = patterns.compilePatterns(state.settings.originalFilePatterns);
    const invalidPatterns = [...compiled.invalid, ...compiledOriginal.invalid];
    const plans = rules.buildPlan(state.groups, state.settings, {
      libraryPaths: state.libraryPaths,
      duplicateAlbumAssetIds: state.duplicateAlbumAssetIds,
      preferredAlbumAssetIds: state.preferredAlbumAssetIds,
      duplicateTagAssetIds: state.duplicateTagAssetIds,
      preferredTagAssetIds: state.preferredTagAssetIds,
      duplicatePatterns: compiled.regexes,
      originalPatterns: compiledOriginal.regexes,
    });
    const filterContext = {
      taggedAssetIds: state.taggedAssetIds,
      skipAssetIds: state.skipAssetIds,
      action: state.settings.action,
    };
    const matching = filters.applyFilters(plans, state.settings.filters, filterContext);
    const funnel = filters.filterFunnel(plans, state.settings.filters, filterContext);
    const visible = filters.applyLimit(matching, state.settings.filters.limit);
    const proposals = visible.reduce((sum, p) => sum + p.proposals.length, 0);
    const warning = [
      state.libraryWarning,
      state.albumWarning,
      state.tagWarning,
      state.tagRuleWarning,
      state.skipWarning,
      invalidPatterns.length ? t('warn.patternInvalid', { patterns: invalidPatterns.join(', ') }) : '',
      rules.noExternalDetected(plans, state.settings) ? t('warn.noExternal') : '',
    ].filter(Boolean).join(' ');
    $('#warning').textContent = warning;
    $('#warning').hidden = !warning;
    const results = $('#results');
    results.replaceChildren();
    visible.forEach((plan) => results.appendChild(renderGroup(plan)));
    if (!visible.length) results.appendChild(el('p', '', t('result.empty')));
    const summaryKey = visible.length < matching.length ? 'result.summaryLimited' : 'result.summary';
    $('#summary').textContent = t(summaryKey, { groups: visible.length, total: matching.length, proposals });
    const funnelText = funnel.steps.map((s) => `${t(`funnel.${s.key}`)}: ${s.removed}`).join(', ');
    $('#funnel').textContent = funnelText ? t('funnel.title', { count: funnel.total, list: funnelText }) : '';
    doc.querySelectorAll('.run-all').forEach((runAll) => {
      runAll.textContent = t(`result.runAll.${state.settings.action}`);
      runAll.disabled = actions.countTargets(visible, state.settings.action) === 0;
      runAll.onclick = () => run(visible);
    });
  }

  // ---- Start -----------------------------------------------------------------
  fillLanguageSelect();
  fillLimitSelect();
  bindSettings();
  applyTranslations();
  $('#load').addEventListener('click', loadGroups);
  $('#remove-skip').addEventListener('click', removeSkipFromAll);
  render();
})(window);
