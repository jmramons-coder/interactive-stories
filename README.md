# Kidory — Interactive Stories

A cinematic digital library for educational picture-book stories.

## What Is Included

- Responsive Netflix-style library with published and upcoming collections.
- Complete French and English interface and story scripts with a persistent language switch.
- Three complete French stories with desktop and mobile image sources.
- Immersive reader with direct-manipulation swipes, playback, scrubbing, text controls, and fullscreen mode.
- Optional French system narration synchronized to each scene.
- Persistent likes and bookmarks using local storage.
- Native sharing with copy-link fallback and direct story URLs.
- Print-edition order sheet with a prefilled email handoff.
- Data-driven release, edition, and story metadata in `src/stories.js`.

## Run Locally

This project has no external dependencies. It only needs Node.

```bash
node scripts/server.mjs
```

Then open:

```text
http://localhost:4173
```

If you have `npm` available later, this also works:

```bash
npm run dev
```

## Project Structure

```text
index.html          App shell
src/main.js         Gallery, reader, controls, playback, sound
  src/stories.js      Published/upcoming metadata and slide scripts
  src/styles.css      Responsive library, reader, and transition design
  assets/stories/     Generated desktop and mobile story artwork
scripts/server.mjs  Small local static server
```

## Adding A Story

Add a `published` entry to `src/stories.js`, include edition metadata, and provide one desktop and mobile image URL per slide. Entries marked `upcoming` automatically appear in the release shelf without becoming readable.
