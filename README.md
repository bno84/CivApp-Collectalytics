# Collectalytics

A Civitai App (Vite + React + TypeScript) with statistics for a Civitai
collection: who you collect, how often you come back to them, and a stats
snippet to paste into Civitai. It is a port of the Collectalytics tab of
[Civitai Artist Discovery](https://github.com/theevildarkmage-hue/Civitai-Artist-Discovery).

## What it shows

- **Overview:** items collected, unique creators, the top five creators' share,
  and who was added most recently.
- **Additions per day:** shown as a faded placeholder marked "Waiting on
  Civitai", until the app API gives the date each item was added.
- **Recently added:** the 15 newest items, with how many additions ago that
  creator's previous pick was.
- **Top creators:** ranked by item count.
- **Creator check:** a creator's rank, share, newest pick, recent activity, the
  typical gap between their picks, and a timeline of where their items sit.
- **Stats snippet:** a heading and lines with placeholders, rendered as HTML
  that Civitai's editors accept, with buttons to copy it as rich text or HTML.
  Edits are kept per collection for the next visit.
- **Opened before:** the last 8 public collections opened by link, to open
  again in one click or forget.
- **Picks up where you left off:** the collection open last time opens again.
  If it no longer reads, your first collection opens instead.

Links open on Civitai in a new tab through the host.

## Permissions

`collections:read:self` and `apps:storage`. Both are consent-exempt, so viewers
get no consent prompt.

`collections:read:self` reaches:

- `GET /api/v1/blocks/collections?mode=mine`: the viewer's own collections.
- `GET /api/v1/blocks/collections/{id}`: any public collection, page by page.

`apps:storage` reaches three **private** collections of Civitai's document store,
declared under `storage` in the manifest. Only the viewer who wrote them can
read them:

- `snippets`: an edited stats snippet, keyed `c-<collectionId>`. Reset deletes it.
- `recent_collections`: collections opened by link (id, name, curator), keyed
  `c-<collectionId>`, newest first by `updatedAt`, pruned to 8.
- `prefs`: the collection open last, as `{ id }` under the key `last`.

The store works only once the app is approved. Before that, and in a dev-tunnel
preview, the server refuses it, and the app keeps everything for the visit only.
Collection names allow only `[a-z0-9_]`. Renaming one, or changing its
visibility, starts it empty.

## Differences from Discovery

Discovery ran on the viewer's own Civitai session. An app gets only the block
API, which changes what can be counted:

| Discovery | Here | Why |
|---|---|---|
| Dates: items per day/week, "added 3 days ago" | Positions: "added 12 additions ago"; the per-day chart is a placeholder | Items arrive newest-added first, but without the date each was added |
| Owned **and followed** collections in the picker | Owned collections; any public one opens by link or ID | `mode=mine` lists owned collections only |
| Private collections | Not read | Needs the consent-gated `collections:read:private`; left out to keep permissions minimal |
| Models, posts and articles counted | Images and videos only | The block API returns playable media only |
| Follower count, total video length | Not shown | Not in the block API |
| Review queue, accept with a thanks comment | Not ported | No app scope can accept collection items or post comments |
| Image detail dialog | Opens the image on Civitai | Preferred: Civitai's own image page |
| Snippet edits and last-opened collection remembered | Both remembered, plus collections opened by link listed under "Opened before" | Kept in the viewer's private app storage on Civitai |

Contest-mode collections open like any other, as a known quirk. Civitai serves
them shuffled, so order-based figures (recent picks, "additions ago") do not
reflect when items were added. Supporting them properly is out of scope, but
the app does not stop anyone from looking.

A model, post or article collection reads as empty, and the report says those
collection types are not supported yet.

What Civitai would need to add to close these gaps is in
[docs/upstream-wishlist.md](docs/upstream-wishlist.md).

## How it is built

- `src/api.ts`: the only network code. Calls the block routes on the host origin
  with the host-minted block token, retries once on 401 and waits out 429s.
  Reads up to 10,000 items (100 pages of 100).
- `src/analysis.ts`: all counting, free of React, tested in
  `src/analysis.test.ts`.
- `src/memory.ts`: what the app remembers between visits, over the document
  store from `@civitai/sdk`, tested against `createFakeStorage` in
  `src/memory.test.ts`. It runs on the block token from `blocks-react`, not on
  `initialize()`'s own handshake, so the frame keeps one host bridge. Every
  refusal falls back to memory for the visit.
- `src/App.tsx` and `src/components/`: UI built from `@civitai/blocks-react`
  (host handshake, theme, sizing, sign-in, navigation) and its design-system
  pack `@civitai/blocks-react/ui`. Styling in `src/index.css` uses the pack's
  `--civitai-*` tokens, so light and dark follow the host.
- `src/dev/harness.tsx`: the SDK mock host plus sample collections and an
  in-memory document store, for `pnpm run dev:harness`. Imported only in
  development builds.

## Width-adaptive layout (`src/index.css`)

The app renders inside whatever slot the host gives it, and slot width does not
follow viewport width. So `.app` is a query container and the layout adapts with
`@container` rules against the container's own width, narrow first: one column
by default, four stat tiles from 480px, two columns from 768px. The chart is
drawn to its frame's measured width so its labels stay readable.

The thresholds are Civitai's block breakpoints in CSS pixels
(`xs 480 · sm 768 · md 1024 · lg 1184 · xl 1440`). Write the number out: a
`--civitai-bp-*` custom property in a query's condition never matches.

Guide: <https://developer.civitai.com/apps/guide/responsive>

## Develop

This project uses pnpm. Do not use npm. Commit `pnpm-lock.yaml`: the platform
installs strictly from it, and `buildCommand` stays `pnpm run build` to match.

```bash
pnpm install
pnpm run dev:harness   # http://localhost:5186, mock host + sample collections
pnpm test              # unit tests for the counting, the API client and memory
pnpm run build         # type check + production bundle
```

Plain `pnpm run dev` has no host behind it, so the app waits for a `BLOCK_INIT`
that never comes. Use the harness.

To run your local app inside the real Civitai host (dev tunnels are
invite-only), run `pnpm run dev:tunnel` in one terminal and
`pnpm exec civitai app dev-tunnel` in another.

The Civitai CLI is a project devDependency. Run it as `pnpm exec civitai …`.

## Validate

```bash
pnpm exec civitai app validate
```

## Submit

```bash
pnpm exec civitai login        # once, to store your API token
pnpm exec civitai app submit
```

`submit` packages the SOURCE tree (manifest + src + build config), excluding
`.git`, `node_modules`, and `dist` — the platform rebuilds from source.

## Store-listing media (`assets/`)

Your store listing **cannot publish without an icon and a cover**, and both are
settable while the app is in review. `assets/` is scaffolded for them and ships
with no images on purpose — see [`assets/README.md`](assets/README.md) for the
size, format and aspect requirements, then:

```bash
pnpm exec civitai app listing set-icon  ./assets/icon.png
pnpm exec civitai app listing set-cover ./assets/cover.png
pnpm exec civitai app listing status
```
