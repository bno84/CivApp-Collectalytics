# Upstream wishlist

What Collectalytics needs from Civitai's app platform to match the original
[Civitai Artist Discovery](https://github.com/bno84/Civitai-Artist-Discovery)
tab. Each item says what the app can do today, what is missing, and what
would close the gap.

Current surface, from Civitai's source (`src/pages/api/v1/blocks/collections`,
Nov 2026), with the scope `collections:read:self`:

- `GET /api/v1/blocks/collections?mode=mine|public`
- `GET /api/v1/blocks/collections/{id}` (accepted image and video items, newest added first)

Report items with `pnpm exec civitai feedback send --about scopes "<text>"` (or
`--about other`), then follow up with `civitai feedback status <ref>`.

## Top priority

### 1. When each item was added

**Today:** items come newest-added first, but without `CollectionItem.createdAt`.
The app counts recency in additions ("12 additions ago") instead of time, and
shows the additions-per-day chart as a faded placeholder marked "Waiting on
Civitai".

**Want:** an `addedAt` field on each item in `GET /blocks/collections/{id}`.
The value is already selected by `getCollectionItemsByCollectionId`.

**Why:** this is the core of Collectalytics: items per day or week, "last
added 3 days ago", typical days between picks, and the busiest days.

## High priority

### 2. List the collections a viewer follows

**Today:** `mode=mine` returns only collections the viewer owns (it calls
`getUserCollectionsWithPermissions` with `contributingOnly: true`). A followed
collection opens only by pasting its link or ID.

**Want:** `mode=followed` (or `mode=mine&include=followed`) that also returns
collections with a VIEW contributor row for the viewer, each marked owned or
followed, with `itemCount` as `mode=mine` already gives for owned ones.
Discovery read exactly this through `collection.getAllUser` with
`permissions: ["VIEW"]`.

**Why:** curators usually check stats for collections they follow as well as
their own. Pasting links is a poor substitute.

## Medium priority

### 3. Follower count

**Today:** not available. Discovery derived it from `_count.contributors` on
`collection.getInfinite`, minus the owner and the collaborators.

**Want:** `followerCount` on the collection object (public collections only
is fine).

**Why:** the stats snippet's headline line was "N followers".

### 4. Video length

**Today:** not available.

**Want:** `duration` (seconds, from `metadata.duration`) on video items.

**Why:** "2h 48m of video content" for music and video collections.

### 5. Every item type

**Today:** only image and video items are returned. Model, post and article
items are dropped, so counts for those collections are wrong or zero.

**Want:** all accepted item types, each with its type, id, creator and
`addedAt`, even if only images and videos carry a media URL.

### 6. Review queue for owners and managers

**Today:** no app scope can read a collection's REVIEW items, accept them, or
comment.

**Want:**

- a read scope for the review queue of collections the viewer owns or
  manages, including who submitted each item (`addedById` and username)
- a write scope to accept or reject items, consent-gated
- a way to post a comment on an image as the viewer with @mentions, with a
  per-action host confirm like posting has

**Why:** Discovery's review panel accepted submissions with a thanks comment
that mentioned the submitter. It was the biggest time saver for curators.

### 7. Who added each item

**Today:** items carry the artwork's creator, but not who added them, and
the collection has no collaborators. Discovery gets both from tRPC
(`collection.getUserCollectionItemsByItem`, `collection.getById`), which
apps can't reach.

**Want:** `addedBy: { userId, username }` on each item of
`GET /blocks/collections/{id}`, and `collaborators` on the collection. Fill
them only where `getUserCollectionItemsByItem` would answer the viewer, so
for the owner, collaborators and followers of collections that take
submissions, and send `null` otherwise. On the list itself, so the app
needs no per-item lookups and no cache: Discovery makes one call per image.

**Why:** curators want to see how much of a collection comes from
submissions, and who submits. Discovery's "Who added the items" panel splits
items into added by the owner, a collaborator, another account's pick, the
artist themselves, or unknown. Coloring the per-day chart by that split also
needs item 1.

### 8. Rejected items for owners and managers

**Today:** `GET /blocks/collections/{id}` serves accepted items only. Discovery
reads rejections from tRPC (`collection.getAllCollectionItems` with
`statuses: ["REJECTED"]`, `forReview: true`), which apps can't reach.

**Want:** a `status=rejected` option on the same list route, with
`rejectionReason`, `addedAt`, the creator, and `addedBy` (item 7) on each item.
Answer 403 to anyone but the owner and managers, as tRPC does. Read only.

**Why:** Discovery shows how many submissions are rejected and each
submitter's acceptance rate. Picking an account lists their accepted and
rejected items, with the reason on each rejected one. Without this and item 7,
none of that can be built.

## Lower priority

### 9. Clipboard in the app frame

**Today:** whether `navigator.clipboard` works depends on the host frame's
permissions policy. The app falls back to selecting and `execCommand('copy')`.

**Want:** `allow="clipboard-write"` on the app iframe, or a host `COPY`
message, so "Copy for Civitai" works reliably with rich HTML.

## Out of scope

- **Contest-mode collections.** They are served shuffled, so order-based
  figures do not apply to them. They still open, as a known quirk, but
  supporting them properly is not a target for this app.
- **Image generation details.** Opening the image on Civitai is the preferred
  experience, so no in-app detail view is planned.
