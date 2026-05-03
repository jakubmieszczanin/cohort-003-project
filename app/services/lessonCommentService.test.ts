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
  createComment,
  listCommentsForViewer,
  countCommentsForViewer,
  softDeleteComment,
  setCommentStatus,
  getCommentById,
  hardDeleteComment,
} from "./lessonCommentService";

function makeUser(name: string, email: string) {
  return testDb
    .insert(schema.users)
    .values({ name, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

function makeLesson(courseId: number, position: number, title: string) {
  const mod = testDb
    .insert(schema.modules)
    .values({ courseId, title: `Module ${position}`, position })
    .returning()
    .get();
  return testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title, position })
    .returning()
    .get();
}

describe("lessonCommentService", () => {
  let lesson: ReturnType<typeof makeLesson>;

  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
    lesson = makeLesson(base.course.id, 1, "Lesson 1");
  });

  describe("createComment", () => {
    it("creates a visible comment by default", () => {
      const c = createComment(base.user.id, lesson.id, "Hello");
      expect(c.id).toBeDefined();
      expect(c.content).toBe("Hello");
      expect(c.status).toBe(schema.CommentStatus.Visible);
      expect(c.deletedAt).toBeNull();
    });
  });

  describe("listCommentsForViewer", () => {
    it("returns only visible+non-deleted for non-moderator", () => {
      const c1 = createComment(base.user.id, lesson.id, "v1");
      const c2 = createComment(base.user.id, lesson.id, "v2");
      const c3 = createComment(base.user.id, lesson.id, "hidden");
      setCommentStatus(c3.id, schema.CommentStatus.Hidden);
      const c4 = createComment(base.user.id, lesson.id, "deleted");
      softDeleteComment(c4.id, base.user.id);

      const rows = listCommentsForViewer(lesson.id, false, {
        limit: 25,
        offset: 0,
      });
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(c1.id);
      expect(ids).toContain(c2.id);
      expect(ids).not.toContain(c3.id);
      expect(ids).not.toContain(c4.id);
    });

    it("returns visible+hidden (no deleted) for moderator", () => {
      const c1 = createComment(base.user.id, lesson.id, "v1");
      const c2 = createComment(base.user.id, lesson.id, "hidden");
      setCommentStatus(c2.id, schema.CommentStatus.Hidden);
      const c3 = createComment(base.user.id, lesson.id, "deleted");
      softDeleteComment(c3.id, base.user.id);

      const rows = listCommentsForViewer(lesson.id, true, {
        limit: 25,
        offset: 0,
      });
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(c1.id);
      expect(ids).toContain(c2.id);
      expect(ids).not.toContain(c3.id);
    });

    it("orders by createdAt ASC (oldest first)", async () => {
      const c1 = createComment(base.user.id, lesson.id, "first");
      await new Promise((r) => setTimeout(r, 5));
      const c2 = createComment(base.user.id, lesson.id, "second");
      await new Promise((r) => setTimeout(r, 5));
      const c3 = createComment(base.user.id, lesson.id, "third");

      const rows = listCommentsForViewer(lesson.id, false, {
        limit: 25,
        offset: 0,
      });
      expect(rows.map((r) => r.id)).toEqual([c1.id, c2.id, c3.id]);
    });

    it("paginates via limit/offset", () => {
      for (let i = 0; i < 30; i++) {
        createComment(base.user.id, lesson.id, `c${i}`);
      }
      const page1 = listCommentsForViewer(lesson.id, false, {
        limit: 25,
        offset: 0,
      });
      const page2 = listCommentsForViewer(lesson.id, false, {
        limit: 25,
        offset: 25,
      });
      expect(page1).toHaveLength(25);
      expect(page2).toHaveLength(5);
    });

    it("joins author info", () => {
      const u2 = makeUser("Alice", "alice@example.com");
      createComment(u2.id, lesson.id, "from alice");
      const rows = listCommentsForViewer(lesson.id, false, {
        limit: 25,
        offset: 0,
      });
      expect(rows[0].author.id).toBe(u2.id);
      expect(rows[0].author.name).toBe("Alice");
    });

    it("scopes to lesson", () => {
      const otherLesson = makeLesson(base.course.id, 2, "Lesson 2");
      createComment(base.user.id, lesson.id, "here");
      createComment(base.user.id, otherLesson.id, "elsewhere");

      const rows = listCommentsForViewer(lesson.id, false, {
        limit: 25,
        offset: 0,
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].content).toBe("here");
    });
  });

  describe("countCommentsForViewer", () => {
    it("counts only visible for non-moderator", () => {
      createComment(base.user.id, lesson.id, "v1");
      const c2 = createComment(base.user.id, lesson.id, "h");
      setCommentStatus(c2.id, schema.CommentStatus.Hidden);
      const c3 = createComment(base.user.id, lesson.id, "d");
      softDeleteComment(c3.id, base.user.id);

      expect(countCommentsForViewer(lesson.id, false)).toBe(1);
    });

    it("counts visible+hidden for moderator", () => {
      createComment(base.user.id, lesson.id, "v1");
      const c2 = createComment(base.user.id, lesson.id, "h");
      setCommentStatus(c2.id, schema.CommentStatus.Hidden);
      const c3 = createComment(base.user.id, lesson.id, "d");
      softDeleteComment(c3.id, base.user.id);

      expect(countCommentsForViewer(lesson.id, true)).toBe(2);
    });

    it("returns 0 for empty lesson", () => {
      expect(countCommentsForViewer(lesson.id, false)).toBe(0);
    });
  });

  describe("softDeleteComment", () => {
    it("sets deletedAt for the author", () => {
      const c = createComment(base.user.id, lesson.id, "x");
      softDeleteComment(c.id, base.user.id);
      const after = getCommentById(c.id);
      expect(after?.deletedAt).not.toBeNull();
    });

    it("rejects deletion by another user", () => {
      const u2 = makeUser("Bob", "bob@example.com");
      const c = createComment(base.user.id, lesson.id, "x");
      expect(() => softDeleteComment(c.id, u2.id)).toThrow();
    });

    it("throws on missing comment", () => {
      expect(() => softDeleteComment(99999, base.user.id)).toThrow();
    });
  });

  describe("setCommentStatus", () => {
    it("hides and unhides", () => {
      const c = createComment(base.user.id, lesson.id, "x");
      setCommentStatus(c.id, schema.CommentStatus.Hidden);
      expect(getCommentById(c.id)?.status).toBe(schema.CommentStatus.Hidden);
      setCommentStatus(c.id, schema.CommentStatus.Visible);
      expect(getCommentById(c.id)?.status).toBe(schema.CommentStatus.Visible);
    });
  });

  describe("getCommentById", () => {
    it("returns the row", () => {
      const c = createComment(base.user.id, lesson.id, "x");
      const got = getCommentById(c.id);
      expect(got?.id).toBe(c.id);
      expect(got?.content).toBe("x");
    });

    it("returns undefined for missing", () => {
      expect(getCommentById(99999)).toBeUndefined();
    });
  });

  describe("hardDeleteComment", () => {
    it("removes the row from the database", () => {
      const c = createComment(base.user.id, lesson.id, "x");
      hardDeleteComment(c.id);
      expect(getCommentById(c.id)).toBeUndefined();
    });

    it("makes the comment disappear from listCommentsForViewer for moderator too", () => {
      const c = createComment(base.user.id, lesson.id, "x");
      hardDeleteComment(c.id);
      const rows = listCommentsForViewer(lesson.id, true, {
        limit: 25,
        offset: 0,
      });
      expect(rows.map((r) => r.id)).not.toContain(c.id);
    });
  });
});
