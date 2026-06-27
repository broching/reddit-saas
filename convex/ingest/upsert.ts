import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { documentInput } from "../validators";

/**
 * Idempotently upserts a batch of normalized documents keyed by `dedupeKey`.
 *
 * - New documents are inserted as `analysisStatus: "pending"`.
 * - Existing documents always refresh volatile fields (score/ratio/comments).
 * - If the content hash changed (edited post/comment), the body is updated and
 *   the document is re-queued for analysis (`pending`, `isProblem` cleared).
 *
 * Callers must keep batches within mutation transaction limits (<= ~100 docs).
 */
export const upsertDocuments = internalMutation({
  args: { docs: v.array(documentInput) },
  returns: v.object({
    inserted: v.number(),
    updated: v.number(),
    reprocessed: v.number(),
  }),
  handler: async (ctx, { docs }) => {
    let inserted = 0;
    let updated = 0;
    let reprocessed = 0;

    for (const doc of docs) {
      const existing = await ctx.db
        .query("documents")
        .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", doc.dedupeKey))
        .unique();

      if (!existing) {
        await ctx.db.insert("documents", {
          ...doc,
          analysisStatus: "pending",
        });
        inserted++;
        continue;
      }

      // Always refresh volatile engagement metrics.
      const patch: Record<string, unknown> = { score: doc.score };
      if (doc.upvoteRatio !== undefined) patch.upvoteRatio = doc.upvoteRatio;
      if (doc.numComments !== undefined) patch.numComments = doc.numComments;

      // Content changed (edited) -> update body and re-queue for analysis.
      if (existing.contentHash !== doc.contentHash) {
        patch.title = doc.title;
        patch.body = doc.body;
        patch.contentHash = doc.contentHash;
        patch.editedAt = doc.editedAt;
        patch.analysisStatus = "pending";
        patch.isProblem = undefined; // clear prefilter verdict
        reprocessed++;
      }

      await ctx.db.patch(existing._id, patch);
      updated++;
    }

    return { inserted, updated, reprocessed };
  },
});
