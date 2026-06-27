/**
 * Dataset item shape returned by the Apify `trudax/reddit-scraper-lite` actor.
 * A single field set covers both posts and comments, discriminated by `dataType`.
 */
export type ApifyRedditItem = {
  dataType: "post" | "comment" | "community" | "user" | string;
  id: string; // Reddit fullname, e.g. "t3_abc" (post) or "t1_xyz" (comment)
  parsedId?: string;
  createdAt: string; // ISO 8601
  scrapedAt?: string;
  body?: string;
  username?: string;
  url?: string;
  permalink?: string;
  link?: string;
  communityName?: string; // "r/SaaS"
  parsedCommunityName?: string; // "SaaS"
  contentType?: string;

  // Posts
  title?: string;
  upVotes?: number;
  upVoteRatio?: number;
  numberOfComments?: number;

  // Comments
  parentId?: string | null; // null for top-level comments
  postId?: string; // parent post fullname "t3_..."
  depth?: number;
  numberOfReplies?: number;
};

/** Input accepted by the actor (the subset we use). */
export type ApifyRedditInput = {
  startUrls: { url: string }[];
  sort?: string;
  time?: string;
  includeMediaLinks?: boolean;
  skipComments?: boolean;
  skipUserPosts?: boolean;
  skipCommunity?: boolean;
  maxItems?: number;
  maxPostCount?: number;
  maxComments?: number;
  postDateLimit?: string;
  proxy?: { useApifyProxy: boolean; apifyProxyGroups?: string[] };
};
