import { useState } from "react";
import { useFetcher } from "react-router";
import { Star } from "lucide-react";
import { cn } from "~/lib/utils";

type Size = "sm" | "md";

const SIZE_CLASS: Record<Size, string> = {
  sm: "size-3.5",
  md: "size-4",
};

const TEXT_CLASS: Record<Size, string> = {
  sm: "text-xs",
  md: "text-sm",
};

export function RatingDisplay({
  avg,
  count,
  size = "md",
  className,
}: {
  avg: number | null;
  count: number;
  size?: Size;
  className?: string;
}) {
  const hasRatings = count > 0 && avg !== null;
  const value = hasRatings ? avg : 0;

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className="relative inline-flex">
        <div className="flex">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={cn(SIZE_CLASS[size], "text-muted-foreground/30")}
            />
          ))}
        </div>
        {hasRatings && (
          <div
            className="pointer-events-none absolute inset-0 flex overflow-hidden"
            style={{ width: `${(value / 5) * 100}%` }}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cn(
                  SIZE_CLASS[size],
                  "shrink-0 fill-yellow-400 text-yellow-400"
                )}
              />
            ))}
          </div>
        )}
      </div>
      <span
        className={cn(
          TEXT_CLASS[size],
          "tabular-nums text-muted-foreground"
        )}
      >
        {hasRatings ? `${avg!.toFixed(1)} (${count})` : "Brak ocen"}
      </span>
    </div>
  );
}

export function RatingInput({
  currentRating,
}: {
  currentRating: number | null;
}) {
  const fetcher = useFetcher();
  const [hover, setHover] = useState<number | null>(null);

  const submitting = fetcher.state !== "idle";
  const optimistic =
    fetcher.formData?.get("rating") != null
      ? Number(fetcher.formData.get("rating"))
      : null;

  const active = hover ?? optimistic ?? currentRating ?? 0;

  return (
    <fetcher.Form method="post" className="flex items-center gap-2">
      <input type="hidden" name="intent" value="rate" />
      <div
        className="flex items-center gap-0.5"
        onMouseLeave={() => setHover(null)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="submit"
            name="rating"
            value={n}
            disabled={submitting}
            onMouseEnter={() => setHover(n)}
            aria-label={`Oceń ${n} ${n === 1 ? "gwiazdka" : "gwiazdek"}`}
            className="rounded p-0.5 transition-transform hover:scale-110 disabled:opacity-50"
          >
            <Star
              className={cn(
                "size-5",
                n <= active
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-muted-foreground/40"
              )}
            />
          </button>
        ))}
      </div>
      {currentRating !== null && (
        <span className="text-xs text-muted-foreground">
          Twoja ocena: {currentRating}
        </span>
      )}
    </fetcher.Form>
  );
}
