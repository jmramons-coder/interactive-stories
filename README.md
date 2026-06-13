# Interactive Stories

A local prototype for educational, interactive picture-book stories.

## What Is Included

- Gallery landing page with story cards.
- Reader view with print-book-style image area and text above the image.
- Horizontal pan, zoom-in, and zoom-out motion modes.
- Bottom controls for previous, next, play/pause, and slide scrubbing.
- Ambient sound toggle stub using generated soft noise for now.
- Data-driven story structure in `src/stories.js`.

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
src/stories.js      Placeholder story metadata and slide scripts
src/styles.css      Responsive visual design and animations
assets/stories/     Future generated story images and audio
scripts/server.mjs  Small local static server
```

## Next Content Step

When the real script is ready, each story can be added to `src/stories.js` with one slide per image. Later, the placeholder scene labels can be replaced with generated image URLs from `assets/stories/...`.
