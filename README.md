# Immich Duplicate

A local HTML page (vanilla JavaScript, no build step, no dependencies) for cleaning up the duplicates
that [Immich](https://immich.app) has detected, based on configurable rules.

Typical use case: pictures are shared through messengers such as Threema or WhatsApp, and in the end you
have several versions of the same picture. The important originals live in an external, read-only
library. The page shows up front which copies would be deleted for which original, and explains every
proposal.

> **Note:** This project is not affiliated with the Immich project. The software is provided without any
> warranty (see [License](#license)). Make a backup before you clean up.

## Features

- Connects to an Immich server using its URL and an API key (access token)
- Loads the duplicate groups and uses rules to classify the images into **original**, **proposals**
  (copies), **protected** images and **series images** (not real duplicates)
- A reason for every proposal, plus properties under every image: file name and path, read-only state,
  external library, date, resolution, file size, Exif fields, albums, tags and stack membership
- Actions for the proposals: move to the **trash**, mark as a **stack** or assign a **tag** - per
  original or for all displayed groups
- **Skip tag** to skip groups, a matching filter, and a function to remove the tag from all images again
- "**Byte-identical** to the original" check (green/red), optionally automatic
- Display filters and a limit for the number of displayed groups (5 to 500 or unlimited)
- The user interface can be switched between German and English; more languages are easy to add

## Requirements

- A current browser.
- An Immich server and an **API key** (Immich: Account settings → API keys).
  Depending on the functions you use, the key needs these permissions:

  | Function | Permission |
  |---|---|
  | Load duplicates | `duplicate.read` |
  | Libraries (detect external images) | `library.read` |
  | Show albums and album rules | `album.read`, `asset.read` |
  | Show tags and stack membership, tag rules and filters | `tag.read`, `asset.read` |
  | Thumbnails | `asset.view` |
  | Move images to the trash | `asset.delete` |
  | Create stacks | `stack.create` |
  | Assign and remove tags | `tag.read`, `tag.asset` |
  | Create the tag if it does not exist yet | `tag.create` |
  | Byte-identical check with download | `asset.download` |

  The easiest way is to give the key all permissions. If one is missing, the page shows the message from
  Immich (e.g. `403 Forbidden`).
- The browser must be allowed to send requests to the Immich server (CORS). The page is loaded directly
  from a file or from a local web server, so its origin differs from the Immich server. If a reverse proxy
  blocks such requests, it needs matching CORS headers (or the page has to be served from the same host).
- For development and the tests: Node.js 22 or newer (tested with version 25).

The page detects the Immich version via `GET /api/server/version` and chooses the search method from it:
the new `filter` search object from version 3.2.0 on, the classic fields before. After loading, the
version is shown in the status line.

## Getting started

1. Download the repository.
2. Open [index.html](index.html) in your browser (a double-click is enough).
3. Enter the server URL and the access token, then click **Load duplicates**.

Nothing is installed and nothing is sent to third parties: the page talks only to the Immich server you
specify. The access token stays in memory and is **never** stored.

The interface starts in German (`DEFAULT_LANGUAGE`); choose English with the language selector at the
top right. The labels below are quoted from the English interface.

## Usage

### 1. Choose rules

The rules work in a fixed **order of priority** (see [Rule priority](#rule-priority)): the highest
active rule that distinguishes two images decides. If all are equal, the older image stays the original.

**Prefer** - these images stay as the original:

| Rule | Effect |
|---|---|
| Is in an external library | An image from an external library wins |
| Is read-only | An image below one of the given "read-only paths" wins |
| Has higher resolution | More pixels win |
| Has better Exif data | More available Exif fields win |
| Has the larger file | The larger file wins |
| File name matches an original pattern | The name matches a regular expression, e.g. `^\d{8}_\d{6}` for camera files such as `20230214_200750.jpg`; that image wins |
| Is in a specific album | An image in one of the "preferred albums" wins |
| Has specific tags | An image with one of the "preferred tags" wins |

**Duplicate rating** - these images preferably become the copy:

| Rule | Effect |
|---|---|
| In one of the duplicate albums | An image in one of the given albums preferably becomes the duplicate |
| File name matches a duplicate pattern | The name matches a regular expression, e.g. `^IMG-\d{8}-WA\d+` for WhatsApp or `^threema-\d{8}-\d+` |
| Has specific tags (preferably a duplicate) | An image with one of the "duplicate tags" preferably becomes the duplicate |

**Read-only paths:** Immich does not know the read-only state of the file system. That is why you enter
the directories that are read-only here (as Immich knows them, e.g. `/media/extCollections`). Everything
below them counts as read-only and is never proposed for deletion. An entry goes on its own line (or
several entries are separated by commas if another path starting with `/` follows; commas inside paths
are preserved). The comparison is tolerant: case, quotation marks, duplicate or trailing slashes, an
appended `/*` and a missing leading slash do not matter. Directory boundaries count: `/media/ext` does
not match `/media/extCollections`. The card shows which entry matched, e.g.
"Read-only: yes (/media/extCollections)".

Album names, tags and patterns are entered **one per line** (case is ignored). Patterns are regular
expressions, with one convenience: a line that contains `*` or `?` but none of the regular expression
characters `( ) [ ] { } | \ ^ $ +` and no `.*`, `.+` or `.?` is treated as a plain wildcard pattern (`*` =
any characters, `?` = one character, "contains" match like in the search). So `*Kopie*` and
`threema-*.mp4` are wildcards, while `^IMG-\d{8}-WA\d+` and `.*Kopie.*` are regular expressions. Lines that
are neither are reported as invalid. Album and tag lists are evaluated when you click **Load duplicates**; patterns and all
checkboxes take effect immediately.

**Hard rules** - so that only real duplicates and no series images are proposed. All selected rules must
match at the same time:

- *File name matches*
- *Timestamp matches* (tolerance: see `TIMESTAMP_TOLERANCE_MS`)
- *File name rule does not apply if a name matches a duplicate pattern*: messengers rename files, so a
  matching name makes the file name rule ineffective for that pair. The timestamp rule still applies.

Images that do not satisfy a hard rule are shown as "Not a duplicate" and are never proposed.

**Protected:** Images in an external library or below a read-only path are **never** proposed for
deletion, even if they are not the original.

### 2. Choose an action

| Action | Effect |
|---|---|
| Move to trash | The proposals are moved to the Immich trash (`FORCE_DELETE` defaults to `false`) |
| Mark as stack | The original and the duplicates become an Immich stack; the original is the primary image. Stacking changes no files, so **protected copies (external or read-only) are stacked too**, unlike deleting and tagging |
| Mark with tag | The proposals receive the tag from the "Tag name" field (default `duplicate`) |

### 3. Review the preview and execute

Each group shows the original (green) and the proposals (red) with reason and properties.

- **Delete / Stack / Tag proposals** inside a group executes the action for that group only.
- If a group has **more than one target** for the chosen action, every target card also gets its own button
  ("Delete this proposal" or "Stack this image with the original") that acts on that single image. For
  stacks this creates a stack of just that image and the original instead of stacking the whole group.
  Stacking a further image later merges it into the existing stack of the original (Immich merges
  existing stacks whose primary image is part of the request).
- **Tag as duplicate (...)**: every image that is **not the original** has this button, whatever action is
  chosen. It assigns the duplicate tag (field "Tag name", default `duplicate`) to that single image. It also
  works for protected copies and series images, because tagging changes no files. There is no
  confirmation; the status line shows the result, an error is also shown right below the button, and on success the "Tags" line of the card is updated.
- **Delete / Stack / Tag all proposals** (at the top and at the bottom of the page) executes it for all
  **displayed** groups. The selection "Number of duplicate groups shown" limits that set.
- Before executing, a confirmation shows the number of affected images. Afterwards the page reloads.
- **Check byte-identical to original** compares an image with the original: first by file size and file
  checksum, and only if that is not enough are both files downloaded and compared.
  Note: for images from an external library, Immich stores only a hash of the file path as the
  "checksum", not of the content. That is why a download happens there when needed.
  With the option **Check byte-identical automatically** (on by default) the check starts without a
  click for all displayed proposals and protected images that satisfy the hard rules. This can trigger
  many downloads; you can switch the option off, and the number of displayed groups limits the effort.
  To save traffic, the content hash of every downloaded original is **cached per image**: an original that
  is compared with several copies is downloaded only once, and a hash is not computed again when you load
  the duplicates again, run an action or even reload the page (the cache lives in the browser's
  `localStorage`, key `HASH_CACHE_STORAGE_KEY`, at most `HASH_CACHE_MAX_ENTRIES` images). A cached hash is
  dropped when the file changes (different checksum, size or modification time). Thumbnails are also kept
  across loads and may come from the browser cache. To start over, delete the entry `immichDuplicate.contentHashes`
  in the browser's site data. A pair that is not
  byte-identical gets a red card background.

### 4. Skip and filter

- **Skip group (tag all images)** assigns the skip tag (default `skip`) to *all* images of the group.
- **Remove skip tag from all images** removes the tag from every image on the server (with confirmation).
  The tag itself stays in Immich.

Filters (all combinable):

- Hide groups consisting only of read-only images (not with the stack action when they have stackable copies)
- Hide groups without proposals (with the stack action: without stackable images, i.e. proposals and protected copies)
- Hide groups whose copies are all already tagged with the duplicate tag
- Hide groups with skip tag: acts if **all deletable** images carry the skip tag. An image is deletable if
  it is neither the original nor protected (external or below a read-only path). If there are no
  deletable images at all, the original and all protected images must carry the tag. This filter works
  independently of the others and takes precedence: it also acts without "identical file names".
- Show only groups with identical file names: the group must contain at least one file name that occurs
  more than once (case-insensitive; files with a different name do not count). A plain filter that does
  not care about protection or tags. Off by default.
- Identical file names, all same-named files read-only (external library or read-only path): a three-way
  choice for the case "nothing of the same-named files can be deleted", e.g. the same photo in two folders
  of the external library. **Hide these groups** removes them (for stacking as well as for deleting
  duplicates), **show only these groups** lists just such groups and, like the other "only" filters,
  overrides "Hide groups without proposals" and "Hide groups consisting only of read-only images".
  Every file that shares its name with another file must be protected, in every set of same-named files; a
  single deletable same-named file is enough to keep the group out of this filter. Off by default.
  Combine it with the skip filter for groups that still have a deletable copy tagged with the skip tag.
- Same name and path, but a different file type (e.g. NEF and JPG): a three-way choice. A group counts if
  two of its files are in the same directory and have the same name before the extension but different
  extensions (case-insensitive; `IMG_1.jpg` and `IMG_1.JPG` are the same type). "Show only these groups"
  lists just such groups (typical RAW+JPEG pairs) and, like the read-only filter above, overrides "Hide
  groups without proposals" and "Hide groups consisting only of read-only images", because such pairs are
  usually not proposals (the names differ, so the hard file name rule excludes them). "Hide these groups"
  removes them. Off by default.
- Search in file name/path: case-insensitive "contains" search; `*` stands for any characters and `?` for exactly one, so `*/Majo/*` finds every path containing `/Majo/`. A group stays visible if any of its files matches
- Number of groups shown: 5, 10, 20, 50, 100, 200, 500 or unlimited

Under the summary the page lists **which filter hid how many groups**, for example "Hidden by filters out
of 134 groups (in this order ...): without proposals: 90, identical file names: 14". Each group is counted
for the first filter that hides it. If a list is shorter than expected or empty, this line shows which
filter is responsible.

## Rule priority

The order in which active rules are evaluated is defined in `RULE_ORDER` ([js/config.js](js/config.js)).
Default, from highest to lowest:

1. Read-only
2. External library
3. File size
4. Original file name pattern (prefers the original)
5. Duplicate file name pattern (prefers the duplicate)
6. Duplicate album
7. Duplicate tag
8. Resolution
9. Exif data
10. Preferred album
11. Preferred tag

## Configuration

All fixed values live in **[js/config.js](js/config.js)** - there are no hidden numbers in the rest of the
code. The file is loaded as a plain script: change the file, reload the page, done. No build is needed.
The object is frozen (`Object.freeze`) and does not change at runtime.

### Important values

| Key | Meaning | Default |
|---|---|---|
| `FORCE_DELETE` | `false`: Immich trash, `true`: **delete permanently** | `false` |
| `RULE_ORDER` | Priority of the preference rules (see above) | see above |
| `TIMESTAMP_TOLERANCE_MS` | Allowed timestamp deviation for the hard rule | `1000` (1 s) |
| `DEFAULT_TAG_NAME` | Tag name used when the field is left empty | `duplicate` |
| `LIMIT_OPTIONS` | Choices for "Number of groups shown" (`'all'` = unlimited) | `5 … 500, all` |
| `API_BATCH_SIZE` | Images per request when deleting/tagging | `100` |
| `MAX_CONCURRENT_REQUESTS` | Concurrent requests for thumbnails, albums and tags | `4` |
| `MAX_CONCURRENT_DOWNLOADS` | Concurrent downloads of the byte-identical check | `2` |
| `HASH_CACHE_STORAGE_KEY` / `HASH_CACHE_MAX_ENTRIES` | Browser storage key and maximum number of images in the content hash cache | `immichDuplicate.contentHashes` / `5000` |
| `SEARCH_PAGE_SIZE` / `MAX_SEARCH_PAGES` | Page size and upper bound of the metadata search | `1000` / `1000` |
| `FILTER_SEARCH_MIN_VERSION` | From this Immich version on, the new `filter` search method is used | `3.2.0` |
| `EXIF_FIELDS` | Exif fields counted for "better Exif data" | 10 fields |
| `DEFAULT_LANGUAGE` / `FALLBACK_LANGUAGE` | Start language and fallback language for missing texts | `de` / `en` |
| `STORAGE_KEY` | Key in the browser's `localStorage` | `immichDuplicate.settings` |
| `ENDPOINTS`, `API_PREFIX`, `API_KEY_HEADER` | Paths and header of the Immich API | see file |

### Default settings (`DEFAULT_SETTINGS`)

`DEFAULT_SETTINGS` defines what the form looks like on first start: which rules and filters are active,
the default action (`action`), the tag names (`tagName`, `skipTagName`) and the limit (`filters.limit`,
as text, e.g. `'20'` or `'all'`). Example - show all groups by default and preselect the "tag" action:

```js
action: 'tag',
// ...
filters: Object.freeze({
  // ...
  limit: 'all',
}),
```

**Important:** The browser remembers the settings in `localStorage` (everything except the token).
Stored values take precedence over `DEFAULT_SETTINGS`. If you want to see changed defaults, delete the
entry `immichDuplicate.settings` in the browser's site data. New keys in `DEFAULT_SETTINGS`, on the other
hand, are added automatically, and invalid stored values are replaced.

### Changing the priority

The entries in `RULE_ORDER` can be reordered freely. For example, if the file size should decide before
the external library, put `'fileSize'` before `'externalLibrary'`. All names must be kept, otherwise the
rule is no longer evaluated.

### Adding another language

1. Copy [js/locales/en.js](js/locales/en.js) to `js/locales/<code>.js`.
2. Translate all texts and set `'meta.name'` to the name of the language (it appears in the selector).
3. At the end of the file, adjust the key: `.en = messages` → `.<code> = messages`.
4. In [index.html](index.html), add `<script src="js/locales/<code>.js"></script>` before `js/app.js`.

Missing keys are taken from the fallback language (`FALLBACK_LANGUAGE`).
A test makes sure that German and English have the same keys.

## Development

```bash
make test    # unit tests with a coverage report
make lint    # syntax check of all JavaScript files
make check   # both
```

`npm test` and `npm run lint` do the same. No packages are installed; the tests use the built-in test
runner of Node.js.

Project structure:

| Path | Content |
|---|---|
| `index.html`, `css/style.css` | User interface |
| `js/app.js` | The only file that touches the DOM (form, rendering, flow) |
| `js/config.js` | Constants and default settings |
| `js/assetModel.js`, `js/rules.js`, `js/filters.js` | Business logic: model, rule engine, display filters |
| `js/immichApi.js` | Client for the Immich REST API |
| `js/actions.js`, `js/albums.js`, `js/tagged.js`, `js/identity.js`, `js/hashcache.js` | Executing, album/tag queries, byte-identical check, content hash cache |
| `js/patterns.js`, `js/sha1.js`, `js/limiter.js`, `js/settings.js`, `js/i18n.js` | Helper modules |
| `js/locales/` | Translations |
| `tests/` | Unit tests (only `js/app.js`, the user interface, is not covered) |

The modules are written so that they run both in the browser (over `file://`, without ES modules) and in
Node.js.

## License

This program is free software: you can redistribute it and/or modify it under the terms of the **GNU
General Public License, version 3**, or (at your option) any later version, as published by the Free
Software Foundation. The full text is in the file [LICENSE](LICENSE).

This program is distributed in the hope that it will be useful, but **without any warranty**; without
even the implied warranty of merchantability or fitness for a particular purpose. This applies in
particular because the software can delete or modify images on your server.

SPDX-License-Identifier: `GPL-3.0-or-later`
