import { eq, and, sql, asc, isNull } from "drizzle-orm";
import { db } from "~/db";
import {
  lessonComments,
  users,
  CommentStatus,
} from "~/db/schema";

export type CommentWithAuthor = {
  id: number;
  content: string;
  status: CommentStatus;
  createdAt: string;
  author: {
    id: number;
    name: string;
    avatarUrl: string | null;
  };
};

export function createComment(
  userId: number,
  lessonId: number,
  content: string
) {
  return db
    .insert(lessonComments)
    .values({ userId, lessonId, content })
    .returning()
    .get();
}

export function getCommentById(commentId: number) {
  return db
    .select()
    .from(lessonComments)
    .where(eq(lessonComments.id, commentId))
    .get();
}

export function listCommentsForViewer(
  lessonId: number,
  viewerCanSeeHidden: boolean,
  opts: { limit: number; offset: number }
): CommentWithAuthor[] {
  const conditions = [
    eq(lessonComments.lessonId, lessonId),
    isNull(lessonComments.deletedAt),
  ];
  if (!viewerCanSeeHidden) {
    conditions.push(eq(lessonComments.status, CommentStatus.Visible));
  }

  const rows = db
    .select({
      id: lessonComments.id,
      content: lessonComments.content,
      status: lessonComments.status,
      createdAt: lessonComments.createdAt,
      authorId: users.id,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
    })
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(and(...conditions))
    .orderBy(asc(lessonComments.createdAt))
    .limit(opts.limit)
    .offset(opts.offset)
    .all();

  return rows.map((r) => ({
    id: r.id,
    content: r.content,
    status: r.status,
    createdAt: r.createdAt,
    author: {
      id: r.authorId,
      name: r.authorName,
      avatarUrl: r.authorAvatarUrl,
    },
  }));
}

export function countCommentsForViewer(
  lessonId: number,
  viewerCanSeeHidden: boolean
): number {
  const conditions = [
    eq(lessonComments.lessonId, lessonId),
    isNull(lessonComments.deletedAt),
  ];
  if (!viewerCanSeeHidden) {
    conditions.push(eq(lessonComments.status, CommentStatus.Visible));
  }

  const row = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(lessonComments)
    .where(and(...conditions))
    .get();

  return row?.count ?? 0;
}

export function softDeleteComment(commentId: number, userId: number) {
  const comment = getCommentById(commentId);
  if (!comment) {
    throw new Error("Comment not found");
  }
  if (comment.userId !== userId) {
    throw new Error("Not authorized to delete this comment");
  }

  return db
    .update(lessonComments)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(lessonComments.id, commentId))
    .returning()
    .get();
}

export function setCommentStatus(commentId: number, status: CommentStatus) {
  return db
    .update(lessonComments)
    .set({ status })
    .where(eq(lessonComments.id, commentId))
    .returning()
    .get();
}

export function hardDeleteComment(commentId: number) {
  return db
    .delete(lessonComments)
    .where(eq(lessonComments.id, commentId))
    .run();
}
