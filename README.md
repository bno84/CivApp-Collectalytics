# Collectalytics

Statistics for a Civitai collection: who you collect, how often you come back
to them, and a stats snippet to paste into Civitai. A Civitai App port of the
Collectalytics tab of
[Civitai Artist Discovery](https://github.com/bno84/Civitai-Artist-Discovery).

**Status:** in development, waiting on critical features from Civitai (see
[docs/upstream-wishlist.md](docs/upstream-wishlist.md)).

## Features

- **Overview:** items collected, unique creators, the top five creators' share,
  and the latest addition.
- **Recently added:** the newest items, with how many additions ago that
  creator was last picked.
- **Top creators:** ranked by item count.
- **Creator check:** one creator's rank, share, recent activity, typical gap
  between picks, and a timeline.
- **Stats snippet:** editable text with placeholders, copied as rich text or
  HTML for Civitai's editors.
- **Remembers:** your snippet edits, the collection you had open, and public
  collections you opened by link.

It asks only for `collections:read:self` and `apps:storage`, so there is no
consent prompt.

## Differences from Discovery

An app sees less of Civitai than Discovery did through your own session:

- **No dates.** Figures count additions ("12 additions ago"), not days. The
  per-day chart is a placeholder until Civitai provides dates.
- **Own collections only in the picker.** Followed or other public collections
  open by link or ID.
- **No private collections**, to keep permissions minimal.
- **Images and videos only.** Model, post and article collections read as empty.
- **Not available:** follower counts, total video length, and the review queue
  (accepting items, thank-you comments).
- **Images open on Civitai** instead of in a detail dialog.
- **Contest collections** open, but Civitai shuffles them, so order-based
  figures are meaningless there.
- **Nothing is remembered before approval.** Civitai's storage only works for
  approved apps, so previews keep settings for the visit only.

What Civitai would need to add is in
[docs/upstream-wishlist.md](docs/upstream-wishlist.md).

## Develop

```bash
pnpm install
pnpm run dev:harness   # mock host + sample collections
pnpm test
pnpm run build
```

## License

Copyright (C) 2026 bno84 and contributors.

Collectalytics is free software under the
[GNU Affero General Public License v3.0 or later](LICENSE). If you run a
modified version for others, including as a Civitai App, you must offer
those users its source under the same license.
