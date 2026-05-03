import { useEffect, useRef } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  MessageSquare,
  Trash2,
  ShieldX,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { UserAvatar } from "~/components/user-avatar";
import { CommentStatus } from "~/db/schema";
import { cn } from "~/lib/utils";

export type LessonComment = {
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

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LessonComments({
  comments,
  total,
  page,
  pageSize,
  currentUserId,
  canModerate,
  canPost,
}: {
  comments: LessonComment[];
  total: number;
  page: number;
  pageSize: number;
  currentUserId: number | null;
  canModerate: boolean;
  canPost: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <MessageSquare className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">Komentarze ({total})</h2>
        </div>

        {canPost && <CommentForm />}

        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Brak komentarzy. Bądź pierwszy!
          </p>
        ) : (
          <ul className="space-y-3">
            {comments.map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                currentUserId={currentUserId}
                canModerate={canModerate}
              />
            ))}
          </ul>
        )}

        {total > pageSize && (
          <Pagination currentPage={page} totalPages={totalPages} />
        )}
      </CardContent>
    </Card>
  );
}

function CommentForm() {
  const fetcher = useFetcher();
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = fetcher.state !== "idle";
  const justSubmitted = useRef(false);

  useEffect(() => {
    if (fetcher.state === "submitting") {
      justSubmitted.current = true;
    }
    if (
      fetcher.state === "idle" &&
      justSubmitted.current &&
      fetcher.data?.success
    ) {
      formRef.current?.reset();
      justSubmitted.current = false;
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form method="post" ref={formRef} className="mb-6">
      <input type="hidden" name="intent" value="add-comment" />
      <textarea
        name="content"
        required
        maxLength={2000}
        rows={3}
        placeholder="Dodaj komentarz..."
        disabled={submitting}
        className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Max 2000 znaków</span>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Wysyłanie..." : "Wyślij"}
        </Button>
      </div>
    </fetcher.Form>
  );
}

function CommentItem({
  comment,
  currentUserId,
  canModerate,
}: {
  comment: LessonComment;
  currentUserId: number | null;
  canModerate: boolean;
}) {
  const isAuthor =
    currentUserId !== null && comment.author.id === currentUserId;
  const isHidden = comment.status === CommentStatus.Hidden;

  return (
    <li
      className={cn(
        "rounded-lg border bg-card p-4",
        isHidden && "opacity-60"
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserAvatar
            name={comment.author.name}
            avatarUrl={comment.author.avatarUrl}
            className="size-7"
          />
          <div className="text-sm">
            <span className="font-medium">{comment.author.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {formatDate(comment.createdAt)}
            </span>
            {isHidden && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                Ukryty
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isAuthor && (
            <DeleteButton commentId={comment.id} />
          )}
          {canModerate && (
            <>
              <ModerationButton
                commentId={comment.id}
                isHidden={isHidden}
              />
              <PurgeButton commentId={comment.id} />
            </>
          )}
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">
        {comment.content}
      </p>
    </li>
  );
}

function DeleteButton({ commentId }: { commentId: number }) {
  const fetcher = useFetcher();
  const submitting = fetcher.state !== "idle";

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="delete-comment" />
      <input type="hidden" name="commentId" value={commentId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={submitting}
        aria-label="Usuń komentarz"
        className="size-8 p-0"
      >
        <Trash2 className="size-4" />
      </Button>
    </fetcher.Form>
  );
}

function ModerationButton({
  commentId,
  isHidden,
}: {
  commentId: number;
  isHidden: boolean;
}) {
  const fetcher = useFetcher();
  const submitting = fetcher.state !== "idle";

  return (
    <fetcher.Form method="post">
      <input
        type="hidden"
        name="intent"
        value={isHidden ? "unhide-comment" : "hide-comment"}
      />
      <input type="hidden" name="commentId" value={commentId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={submitting}
        aria-label={isHidden ? "Odsłoń komentarz" : "Ukryj komentarz"}
        className="size-8 p-0"
      >
        {isHidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </Button>
    </fetcher.Form>
  );
}

function PurgeButton({ commentId }: { commentId: number }) {
  const fetcher = useFetcher();
  const submitting = fetcher.state !== "idle";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        "Trwale usunąć komentarz? Tej operacji nie można cofnąć."
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <fetcher.Form method="post" onSubmit={handleSubmit}>
      <input type="hidden" name="intent" value="purge-comment" />
      <input type="hidden" name="commentId" value={commentId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={submitting}
        aria-label="Trwale usuń komentarz"
        className="size-8 p-0 text-destructive hover:text-destructive"
      >
        <ShieldX className="size-4" />
      </Button>
    </fetcher.Form>
  );
}

function Pagination({
  currentPage,
  totalPages,
}: {
  currentPage: number;
  totalPages: number;
}) {
  const [searchParams] = useSearchParams();

  function buildLink(page: number) {
    const params = new URLSearchParams(searchParams);
    params.set("cpage", String(page));
    return `?${params.toString()}`;
  }

  return (
    <div className="mt-6 flex items-center justify-center gap-3 text-sm">
      {currentPage > 1 ? (
        <Link
          to={buildLink(currentPage - 1)}
          preventScrollReset
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted"
          aria-label="Poprzednia strona"
        >
          <ChevronLeft className="size-4" />
        </Link>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground/40">
          <ChevronLeft className="size-4" />
        </span>
      )}
      <span className="tabular-nums text-muted-foreground">
        Strona {currentPage} z {totalPages}
      </span>
      {currentPage < totalPages ? (
        <Link
          to={buildLink(currentPage + 1)}
          preventScrollReset
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted"
          aria-label="Następna strona"
        >
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground/40">
          <ChevronRight className="size-4" />
        </span>
      )}
    </div>
  );
}
