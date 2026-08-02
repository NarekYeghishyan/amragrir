# Placeholder dish photos

Served at `${API_PUBLIC_URL}/static/menu/<category>.svg` (see the static mount
in `src/main.ts`), one per category key in `prisma/categories.ts`, plus
`dish.svg` for a dish whose category is unset.

**These are placeholders, not photographs** — and they are no longer what the
seed plants by default. Every dish must have a picture (`POST
/v1/restaurant/menu-items` refuses a creation without one) and demo data has no
photography behind it, so the seed hotlinks real photographs of the dishes
themselves instead; the table and the trade it makes are in
`prisma/menu-photos.ts`. These stay for the case that has no other answer:
**`MENU_PHOTOS=local`**, a demo behind a captive network or a firewall, where
every hotlinked image is a broken frame and a gradient with the category's emoji
on it is the better of two bad options.

A restaurant replaces any picture by uploading a real one from the back office
("Add a dish", or the pencil on the dish's own row): that stores a file under
`UPLOAD_DIR`. `prisma/refresh-photos.ts` rewrites a placeholder but **never** an
upload.

They are SVG on purpose — a few hundred bytes each, sharp at any size, and
readable in a diff. Note that `UploadsService` **refuses** SVG on upload, which
is not a contradiction: these ship with the repo and are reviewed like code,
while an uploaded SVG is a document with scripts in it arriving from outside.

Keep the file names stable. They are stored in `menu_items.photo_url` as
absolute URLs, so renaming one breaks every dish still pointing at it until the
next `pnpm --filter @amragrir/api db:photos`.
