import { eq, and, sql } from "drizzle-orm";
import { db } from "~/db";
import { courseRatings } from "~/db/schema";

export function upsertRating(
  userId: number,
  courseId: number,
  rating: number
) {
  const now = new Date().toISOString();
  return db
    .insert(courseRatings)
    .values({ userId, courseId, rating, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [courseRatings.userId, courseRatings.courseId],
      set: { rating, updatedAt: now },
    })
    .returning()
    .get();
}

export function getUserRating(
  userId: number,
  courseId: number
): number | null {
  const row = db
    .select({ rating: courseRatings.rating })
    .from(courseRatings)
    .where(
      and(
        eq(courseRatings.userId, userId),
        eq(courseRatings.courseId, courseId)
      )
    )
    .get();

  return row?.rating ?? null;
}

export function getCourseRatingStats(courseId: number): {
  avg: number | null;
  count: number;
} {
  const row = db
    .select({
      avg: sql<number | null>`AVG(${courseRatings.rating})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(courseRatings)
    .where(eq(courseRatings.courseId, courseId))
    .get();

  return {
    avg: row?.avg ?? null,
    count: row?.count ?? 0,
  };
}
