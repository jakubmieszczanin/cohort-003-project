# Oceny gwiazdkowe kursów (1-5)

## Context

Studenci zapisani na kurs mają móc wystawić ocenę gwiazdkową 1-5 i ją zmieniać. Średnia (liczona on-the-fly z SQL `AVG`) ma być widoczna na karcie kursu w katalogu, na home, na dashboardzie i na stronie kursu. Widget do oceniania pojawia się tylko na stronie kursu (`/courses/:slug`) i tylko dla `isUserEnrolled`. Bez komentarzy pisanych — sama liczba gwiazdek.

## Decyzje (z pytań)

- **Kto ocenia:** tylko `enrolled` (reuse `isUserEnrolled` z `enrollmentService`)
- **Display:** home, /courses, /dashboard, /courses/:slug (admin/instructor pomijamy)
- **Widget:** tylko `/courses/:slug`
- **Średnia:** on-the-fly w SQL (`AVG`, `COUNT` przez LEFT JOIN + GROUP BY)
- **Format:** ⭐ + `4.3 (12)`. Bez ocen → `"Brak ocen"`.

## Schema — `app/db/schema.ts`

Nowa tabela `courseRatings`:
- `id` PK autoincrement
- `userId` integer NOT NULL → `users.id`
- `courseId` integer NOT NULL → `courses.id`
- `rating` integer NOT NULL (CHECK 1..5)
- `createdAt`, `updatedAt` ISO text
- **UNIQUE (userId, courseId)** — wymóg dla `ON CONFLICT DO UPDATE` (zmiana oceny bez duplikatu)

Migracja: `pnpm drizzle-kit generate` → `drizzle/0003_*.sql`.

## Service — `app/services/ratingService.ts` (NEW) + test

- `upsertRating(userId, courseId, rating)` — `insert().onConflictDoUpdate({ target: [userId, courseId], set: { rating, updatedAt } })`
- `getUserRating(userId, courseId): number | null` — do pre-filla widgetu
- `getCourseRatingStats(courseId): { avg: number | null; count: number }` — gdy potrzebne osobno (np. `courses.$slug.tsx` jeśli loader nie używa `buildCourseQuery`)

## courseService — rozszerzenie

W `buildCourseQuery` (i w `getCourseBySlug` używanym przez `courses.$slug.tsx`) dodać do projekcji:
- `avgRating: sql<number | null>` (AVG)
- `ratingCount: sql<number>` (COUNT)

Realizacja: `LEFT JOIN courseRatings ON courseRatings.courseId = courses.id` + `GROUP BY courses.id`.

Zaktualizować `courseService.test.ts` (oczekiwane pola w wynikach).

## Komponent — `app/components/rating-stars.tsx` (NEW)

Dwa eksporty:
- `RatingDisplay({ avg, count, size? })` — 5 gwiazdek (`Star` z lucide-react, częściowo wypełnione przez `--w` lub overlay), tekst `avg.toFixed(1) (count)` lub `"Brak ocen"`.
- `RatingInput({ courseId, currentRating })` — `<Form method="post">` wewnątrz strony kursu; 5 klikalnych przycisków-gwiazdek wysyłających `intent=rate` + `rating=N`. Hover preview po stronie klienta.

## Routing — `app/routes/courses.$slug.tsx`

Loader: dołożyć `userRating` (jeśli zalogowany + enrolled) i wykorzystać `avgRating`/`ratingCount` z extended `getCourseBySlug`.

Action (NEW w tym route):
1. `getCurrentUserId` → 401 jeśli null
2. `isUserEnrolled(userId, courseId)` → 403 jeśli false
3. Zod: `rating: z.coerce.number().int().min(1).max(5)`
4. `upsertRating(...)`
5. `return data({ ok: true })` — React Router rerenderuje loader

UI: jeśli `enrolled` → render `<RatingInput currentRating={userRating} ... />` obok `<RatingDisplay />`. Jeśli nie enrolled → tylko `<RatingDisplay />`.

## Display w pozostałych miejscach

- `routes/home.tsx` — featured courses już jadą przez courseService; podpiąć `<RatingDisplay size="sm" />` w karcie.
- `routes/courses.tsx` — `buildCourseQuery` już zwróci `avgRating`/`count`; dodać `<RatingDisplay size="sm" />` w karcie obok ceny.
- `routes/dashboard.tsx` — sprawdzić loader; jeśli nie używa `buildCourseQuery`, doszyć `getCourseRatingStats` lub poszerzyć join. Render w kartach In Progress/Completed.

## Pliki do modyfikacji

NEW:
- `app/services/ratingService.ts` + `.test.ts`
- `app/components/rating-stars.tsx`
- `drizzle/0003_*.sql` (auto)

EDIT:
- `app/db/schema.ts`
- `app/services/courseService.ts` + `.test.ts`
- `app/routes/courses.$slug.tsx` (loader + action + UI)
- `app/routes/home.tsx`
- `app/routes/courses.tsx`
- `app/routes/dashboard.tsx`

## Verification

1. `pnpm db:migrate` — migracja przechodzi.
2. `pnpm test` — `ratingService.test.ts` + zaktualizowane testy `courseService` przechodzą.
3. `pnpm typecheck` czysto.
4. `pnpm dev`, DevUI: zaloguj jako student zapisany na kurs.
5. `/courses/:slug` — widget widoczny, kliknij 4 gwiazdki, refresh → wybór zachowany, średnia zaktualizowana.
6. Kliknij inną liczbę gwiazdek → ocena się zmienia (sprawdź że tylko jeden rekord w DB).
7. Przełącz na innego enrolled studenta, dodaj ocenę → średnia z dwóch.
8. Sprawdź wyświetlanie na `/`, `/courses`, `/dashboard`.
9. Niezalogowany / nie-enrolled — brak widgetu; manualny POST do action → 401/403.
10. Kurs bez ocen → `"Brak ocen"` na wszystkich kartach.

## Otwarte pytania

Brak.
