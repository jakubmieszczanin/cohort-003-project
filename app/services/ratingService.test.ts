import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  upsertRating,
  getUserRating,
  getCourseRatingStats,
} from "./ratingService";

function makeUser(name: string, email: string) {
  return testDb
    .insert(schema.users)
    .values({ name, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

describe("ratingService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("upsertRating", () => {
    it("creates a new rating", () => {
      const result = upsertRating(base.user.id, base.course.id, 4);

      expect(result).toBeDefined();
      expect(result.userId).toBe(base.user.id);
      expect(result.courseId).toBe(base.course.id);
      expect(result.rating).toBe(4);
    });

    it("updates the existing rating instead of inserting a duplicate", () => {
      upsertRating(base.user.id, base.course.id, 3);
      const updated = upsertRating(base.user.id, base.course.id, 5);

      expect(updated.rating).toBe(5);

      const all = testDb.select().from(schema.courseRatings).all();
      expect(all).toHaveLength(1);
    });

    it("rejects ratings outside 1..5 via CHECK constraint", () => {
      expect(() => upsertRating(base.user.id, base.course.id, 0)).toThrow();
      expect(() => upsertRating(base.user.id, base.course.id, 6)).toThrow();
    });
  });

  describe("getUserRating", () => {
    it("returns null when user hasn't rated the course", () => {
      expect(getUserRating(base.user.id, base.course.id)).toBeNull();
    });

    it("returns the rating value", () => {
      upsertRating(base.user.id, base.course.id, 4);
      expect(getUserRating(base.user.id, base.course.id)).toBe(4);
    });
  });

  describe("getCourseRatingStats", () => {
    it("returns avg=null, count=0 for unrated course", () => {
      const stats = getCourseRatingStats(base.course.id);
      expect(stats.avg).toBeNull();
      expect(stats.count).toBe(0);
    });

    it("computes avg and count across users", () => {
      const u2 = makeUser("U2", "u2@example.com");
      const u3 = makeUser("U3", "u3@example.com");

      upsertRating(base.user.id, base.course.id, 5);
      upsertRating(u2.id, base.course.id, 3);
      upsertRating(u3.id, base.course.id, 4);

      const stats = getCourseRatingStats(base.course.id);
      expect(stats.count).toBe(3);
      expect(stats.avg).toBeCloseTo(4, 5);
    });

    it("reflects updates (no double counting)", () => {
      upsertRating(base.user.id, base.course.id, 1);
      upsertRating(base.user.id, base.course.id, 5);

      const stats = getCourseRatingStats(base.course.id);
      expect(stats.count).toBe(1);
      expect(stats.avg).toBe(5);
    });
  });
});
