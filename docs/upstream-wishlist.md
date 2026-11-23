# Upstream wishlist

What Collectalytics needs from Civitai's app platform to match the original
[Civitai Artist Discovery](https://github.com/theevildarkmage-hue/Civitai-Artist-Discovery)
tab. Each item says what the app can do today, what is missing, and what
would close the gap.

Current surface, from Civitai's source (`src/pages/api/v1/blocks/collections`,
Nov 2026), with the scope `collections:read:self`:

- `GET /api/v1/blocks/collections?mode=mine|public`
- `GET /api/v1/blocks/collections/{id}` (accepted image and video items, newest added first)

Report items with `pnpm exec civitai feedback send --about scopes "<text>"` (or
`--about other`), then follow up with `civitai feedback status <ref>`.

## High priority

### 1. List the collections a viewer follows

**Today:** `mode=mine` returns only collections the viewer owns (it calls
`getUserCollectionsWithPermissions` with `contributingOnly: true`). A followed
collection opens only by pasting its link or ID.

**Want:** `mode=followed` (or `mode=mine&include=followed`) that also returns
collections with a VIEW contributor row for the viewer, each marked owned or
followed. Discovery read exactly this through `collection.getAllUser` with
`permissions: ["VIEW"]`.

**Why:** curators usually check stats for collections they follow as well as
their own. Pasting links is a poor substitute.

### 2. When each item was added

**Today:** items come newest-added first, but without `CollectionItem.createdAt`.
The app counts recency in additions ("12 additions ago") instead of time.

**Want:** an `addedAt` field on each item in `GET /blocks/collections/{id}`.
The value is already selected by `getCollectionItemsByCollectionId`.

**Why:** this is the core of Collectalytics: items per day or week, "last
added 3 days ago", typical days between picks, and the busiest days.

### 3. The collection's mode

**Today:** contest-mode collections are served in a shuffled order, and the
response does not say so. The app cannot tell, so its order-based figures
are wrong for those collections.

**Want:** `mode` (or `contest: boolean`) on the collection object in both
routes. Better still, a way to read a contest collection in added order.

## Medium priority

### 4. Follower count

**Today:** not available. Discovery derived it from `_count.contributors` on
`collection.getInfinite`, minus the owner and the collaborators.

**Want:** `followerCount` on the collection object (public collections only
is fine).

**Why:** the stats snippet's headline line was "N followers".

### 5. Video length

**Today:** not available.

**Want:** `duration` (seconds, from `metadata.duration`) on video items.

**Why:** "2h 48m of video content" for music and video collections.

### 6. Every item type

**Today:** only image and video items are returned. Model, post and article
items are dropped, so counts for those collections are wrong or zero.

**Want:** all accepted item types, each with its type, id, creator and
`addedAt`, even if only images and videos carry a media URL.

### 7. Review queue for owners and managers

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

## Lower priority

### 8. Image generation details

**Today:** the app links out to the image page instead of showing details.

**Want:** a block route for one image's generation metadata (prompt,
resources, sampler), clamped like `/blocks/images`.

### 9. Item counts in `mode=mine` for followed collections

When item 1 lands, `itemCount` for followed collections, as `mode=mine` already
gives for owned ones, so the picker can show sizes.

### 10. Clipboard in the app frame

**Today:** whether `navigator.clipboard` works depends on the host frame's
permissions policy. The app falls back to selecting and `execCommand('copy')`.

**Want:** `allow="clipboard-write"` on the app iframe, or a host `COPY`
message, so "Copy for Civitai" works reliably with rich HTML.
