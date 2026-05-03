# Komentarze do lekcji + moderacja przez instruktora

## Context

Studenci nie mają obecnie sposobu na zadanie pytania albo zostawienie feedbacku pod konkretną lekcją — całość kursu jest jednokierunkowa (video + treść + quiz + progress). Dodajemy sekcję komentarzy pod treścią lekcji, żeby studenci mogli się odzywać, a instruktorzy moderowali.

Decyzje z rozmowy:
- **Post-moderation** — komentarz widoczny natychmiast, moderator może ukryć / trwale usunąć ex post.
- **Płaska lista** — bez wątków/odpowiedzi (MVP).
- **Student**: może dodać i usunąć własny komentarz (soft delete). Bez edycji.
- **Moderacja inline** — na stronie lekcji moderator widzi przyciski akcji przy każdym komentarzu. Bez osobnego panelu.
- **Kto moderuje:** dowolny user z rolą `Instructor` lub `Admin` — nie tylko autor kursu. Mogą też komentować dowolny kurs bez enrollmentu.
- **Akcje moderacyjne:** ukrycie (odwracalne, `status='hidden'`) **i** trwałe usunięcie (hard delete z DB, z `window.confirm`).
- **Limit znaków:** 2000.
- **Sortowanie:** najstarsze pierwsze (ASC po `createdAt`), najnowsze na dole.
- **Powiadomienia email:** pomijamy.
- **Paginacja:** 25 na stronę. Query string `?cpage=N`.

Wzorzec do skopiowania: `course_ratings` (commit 4c6e63d) — schemat, service, fetcher.Form, action z guardami.

## Schemat DB

`app/db/schema.ts` — dodać enum + tabelę:

```ts
export enum CommentStatus {
  Visible = "visible",
  Hidden  = "hidden",  // ukryty przez instruktora — nadal w DB, do podglądu/odsłonięcia
}

export const lessonComments = sqliteTable(
  "lesson_comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    lessonId: integer("lesson_id").notNull().references(() => lessons.id),
    userId: integer("user_id").notNull().references(() => users.id),
    content: text("content").notNull(),
    status: text("status").notNull().$type<CommentStatus>().default(CommentStatus.Visible),
    createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
    deletedAt: text("deleted_at"),  // soft delete przez autora
  },
  (table) => [
    index("lesson_comments_lesson_idx").on(table.lessonId),
  ]
);
```

Dodać też `index` do importu z `drizzle-orm/sqlite-core`. Migracja: `pnpm db:generate` + `pnpm db:migrate`.

**Widoczność:**
- Student widzi: `status = 'visible' AND deletedAt IS NULL`.
- Moderator (`role IN (Instructor, Admin)`) widzi: `deletedAt IS NULL` (visible + hidden, hidden oznaczone wizualnie).
- `deletedAt IS NOT NULL` — niewidoczne dla nikogo (autor usunął).
- **Trwałe usunięcie** przez moderatora — DELETE wiersza z DB; nie da się odzyskać.

## Service

Nowy plik `app/services/lessonCommentService.ts` analogicznie do `ratingService.ts`:

```ts
createComment(userId, lessonId, content): Comment
listCommentsForViewer(
  lessonId,
  viewerCanSeeHidden: boolean,
  opts: { limit, offset }
): Array<{ id, content, status, createdAt, author: { id, name, avatarUrl } }>
countCommentsForViewer(lessonId, viewerCanSeeHidden: boolean): number
softDeleteComment(commentId, userId): void   // tylko autor
setCommentStatus(commentId, status: CommentStatus): void  // tylko moderator — sprawdzane w action
hardDeleteComment(commentId): void           // trwałe DELETE — tylko moderator, sprawdzane w action
getCommentById(commentId): Comment | null    // do walidacji ownership / istnienia w action
```

`listCommentsForViewer` robi JOIN z `users`, sortuje **ASC po `createdAt`** (najstarsze pierwsze), filtruje `deletedAt IS NULL`, opcjonalnie odfiltrowuje `status = 'hidden'`.

Test: `app/services/lessonCommentService.test.ts` — wzorzec `ratingService.test.ts`. Pokrywa: create, list (visible vs all + paginacja + ASC), count, softDelete, setStatus, hardDelete (znika z DB i z listy moderatora), ownership check.

## Route action

`app/routes/courses.$slug.lessons.$lessonId.tsx` — rozszerzyć istniejący `action`:

1. Dodać do dyskryminowanej unii Zod (obok `mark-complete`, `submit-quiz`):
   - `add-comment`: `{ content: string min 1, max 2000, trim }`
   - `delete-comment`: `{ commentId: number }`
   - `hide-comment`: `{ commentId: number }`
   - `unhide-comment`: `{ commentId: number }`
   - `purge-comment`: `{ commentId: number }` — trwałe usunięcie

2. Reużyć istniejące guardy:
   - `getCurrentUserId` → 401 jeśli null.
   - `getCourseBySlug` → 404.
   - dla `add-comment`: `isUserEnrolled(userId, course.id) || user.role === Instructor || user.role === Admin` → inaczej 403.
   - dla `delete-comment`: `getCommentById` → 404; `comment.userId === userId` → inaczej 403; `comment.lessonId === lessonId` → inaczej 400.
   - dla `hide-comment`/`unhide-comment`/`purge-comment`: `user.role === Instructor || user.role === Admin` → inaczej 403 (uprawnienie globalne, nie wiązane z autorstwem kursu); `comment.lessonId === lessonId` → inaczej 400.

3. Loader: dołożyć paginowaną listę komentarzy. Wyliczyć `isInstructorOrAdmin = currentUser?.role === Instructor || currentUser?.role === Admin`. Czytać stronę z query stringa: `?cpage=N` (1-indexed, default 1). `PAGE_SIZE = 25`.

```ts
const cpage = Math.max(1, Number(new URL(request.url).searchParams.get("cpage") ?? 1));
const PAGE_SIZE = 25;
const comments = listCommentsForViewer(lessonId, isInstructorOrAdmin, {
  limit: PAGE_SIZE,
  offset: (cpage - 1) * PAGE_SIZE,
});
const commentsTotal = countCommentsForViewer(lessonId, isInstructorOrAdmin);
```

Zwracać `comments`, `commentsTotal`, `commentsPage: cpage`, `commentsPageSize: PAGE_SIZE`, `isInstructorOrAdmin` w loaderData.

## UI

Nowy komponent `app/components/lesson-comments.tsx`:

```tsx
type Comment = { id, content, status, createdAt, author: { id, name, avatarUrl } };

<LessonComments
  comments={comments}
  total={commentsTotal}
  page={commentsPage}
  pageSize={commentsPageSize}
  currentUserId={currentUserId}
  canModerate={isInstructorOrAdmin}
  canPost={enrolled || isInstructorOrAdmin}
/>
```

Sekcje:
1. **Form** (jeśli `canPost`): `<fetcher.Form method="post">` z `<textarea name="content" maxLength={2000} required>`, hidden `intent="add-comment"`, Button "Wyślij". Optymistyczne czyszczenie textarea po sukcesie (przez `useRef` + `useEffect` reagujące na zmianę `fetcher.state`).
2. **Lista**: każdy komentarz w `<Card>` z avatarem, nazwą, datą (relative), treścią w `<p className="whitespace-pre-wrap">` (escape przez React = bezpieczne).
3. **Akcje per-komentarz**:
   - Autor (i `comment.userId === currentUserId`): przycisk Trash2 → fetcher.Form `intent="delete-comment"` (soft delete).
   - `canModerate`: przycisk EyeOff (ukryj) lub Eye (odsłoń) → `hide-comment` / `unhide-comment`.
   - `canModerate`: przycisk ShieldX w kolorze `text-destructive` → `purge-comment` (trwałe usunięcie). Przed submitem `window.confirm("Trwale usunąć komentarz? Tej operacji nie można cofnąć.")`.
4. **Hidden state**: gdy `status === 'hidden'` (widzialne tylko dla moderatora), opakowanie ma `opacity-60` i badge "Ukryty".
5. **Paginacja**: pod listą `<` i `>` jako `<Link>` do `?cpage=N` (zachowuje inne searchParams). Pokazywane gdy `total > pageSize`. Etykieta `Strona X z Y`.

Wstawienie w `courses.$slug.lessons.$lessonId.tsx` — między Quiz Section (linia ~547) a Mark Complete (linia ~549):

```tsx
{/* Comments */}
<LessonComments
  comments={comments}
  total={commentsTotal}
  page={commentsPage}
  pageSize={commentsPageSize}
  currentUserId={currentUserId}
  canModerate={isInstructorOrAdmin}
  canPost={enrolled || isInstructorOrAdmin}
/>
```

## Bezpieczeństwo

- Treść tylko plain text — renderowana przez `{content}` w JSX (auto-escape). Bez markdown/HTML.
- Walidacja Zod w action (nie tylko maxLength w UI).
- Wszystkie guardy uprawnień po stronie servera w `action` (UI ukrywa przyciski, ale action niezależnie sprawdza).
- Foreign key `lessonId → lessons` zabezpiecza przed osieroconymi rekordami.

## Pliki do zmiany / utworzenia

| Plik | Akcja |
|---|---|
| `app/db/schema.ts` | dodać `CommentStatus`, `lessonComments`, import `index` |
| `app/services/lessonCommentService.ts` | nowy |
| `app/services/lessonCommentService.test.ts` | nowy |
| `app/routes/courses.$slug.lessons.$lessonId.tsx` | rozszerzyć loader + action, wstawić komponent |
| `app/components/lesson-comments.tsx` | nowy |
| `drizzle/...` | migracja (auto-gen) |

## Verification

1. `pnpm db:generate && pnpm db:migrate` — migracja wykonana.
2. `pnpm test app/services/lessonCommentService.test.ts` — zielone.
3. `pnpm typecheck` (lub `pnpm build`) — bez błędów.
4. W przeglądarce na localhost:5173 (dev server użytkownika):
   - Zalogowany jako student z enrollmentem: dodaje komentarz pod lekcją → pojawia się natychmiast na dole listy (najnowsze na dole).
   - Drugi student widzi ten komentarz.
   - Student usuwa swój komentarz → znika u wszystkich.
   - Zalogowany jako instruktor (dowolnego kursu, niekoniecznie tego): ukrywa cudzy komentarz → studenci go nie widzą; on widzi z badge "Ukryty"; może odsłonić.
   - Ten sam instruktor klika ShieldX → potwierdza dialog → komentarz znika z DB; nikt (też moderator) go już nie widzi.
   - Admin: te same uprawnienia co instruktor.
   - Niezalogowany: brak formularza; widzi tylko `visible`.
   - Zalogowany student bez enrollmentu: widzi komentarze, brak formularza. Instruktor/admin bez enrollmentu: ma formularz (może komentować).
   - Z >25 komentarzami: pokazuje paginację, `?cpage=2` przewija do strony 2.
