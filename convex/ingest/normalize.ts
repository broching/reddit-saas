import { Infer } from "convex/values";
import { Id } from "../_generated/dataModel";
import { documentInput } from "../validators";
import { contentHash } from "../lib/hash";
import { ApifyRedditItem } from "../reddit/types";

export type DocumentInput = Infer<typeof documentInput>;

const REDDIT_BASE = "https://www.reddit.com";

/** Parse Apify's ISO `createdAt` to epoch ms; falls back to 0 on bad input. */
function toMs(iso: string | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function urlFor(item: ApifyRedditItem): string | undefined {
  if (item.url) return item.url;
  if (item.permalink) return `${REDDIT_BASE}${item.permalink}`;
  return undefined;
}

/**
 * Normalize one Apify Reddit dataset item (post or comment) into a
 * source-agnostic document input. Returns null for non-post/comment items
 * (community/user) which the pipeline does not ingest.
 */
export function apifyItemToDocumentInput(
  item: ApifyRedditItem,
  sourceId: Id<"sources">,
  channel: string,
): DocumentInput | null {
  if (item.dataType !== "post" && item.dataType !== "comment") return null;
  if (!item.id) return null;

  const createdAt = toMs(item.createdAt);
  const body = item.body ?? "";

  if (item.dataType === "post") {
    return {
      source: "reddit",
      sourceType: "post",
      externalId: item.id,
      dedupeKey: `reddit:${item.id}`,
      postExternalId: item.id, // a post is the root of its own thread
      sourceId,
      channel,
      title: item.title,
      body,
      author: item.username,
      url: urlFor(item),
      score: item.upVotes ?? 0,
      upvoteRatio: item.upVoteRatio,
      numComments: item.numberOfComments,
      createdAt,
      contentHash: contentHash(item.title, body),
    };
  }

  // comment
  return {
    source: "reddit",
    sourceType: "comment",
    externalId: item.id,
    dedupeKey: `reddit:${item.id}`,
    parentExternalId: item.parentId ?? item.postId ?? undefined,
    postExternalId: item.postId ?? undefined, // root post this comment belongs to
    sourceId,
    channel,
    body,
    author: item.username,
    url: urlFor(item),
    score: item.upVotes ?? 0,
    createdAt,
    contentHash: contentHash(body),
  };
}
