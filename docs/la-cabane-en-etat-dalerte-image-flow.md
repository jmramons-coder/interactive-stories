# La cabane en etat d'alerte: Image Production Flow

Source: `LIVRE 1 : La cabane en etat d'alerte.pdf`

## Goal

Create one consistent visual world for the print book and the interactive web reader. The same final illustrations should work as portrait print pages and as center-cropped cinematic web slides.

## Visual Lock

- Style: premium children's picture-book illustration, cinematic but soft.
- Texture: tactile paper grain, rounded shapes, expressive faces.
- Palette: warm maple wood, cream sheets, muted teal shadows, amber flashlight, small red accents.
- Camera: child-eye perspective, cozy closeups, low angles for imagination moments.
- Avoid: text inside images, photorealism, anime, scary horror, inconsistent clothes, different bedroom layout.

## Character Lock

Octavio:
- 6-year-old boy.
- Warm light-brown skin, round cheeks, large dark-brown eyes.
- Short wavy dark-brown hair with one curl on the forehead.
- Blue pajama top with tiny white stars, charcoal joggers, red socks.

Maman:
- Warm medium-brown skin, dark curly hair in a low bun.
- Cream sweater, sage green pants, house slippers.
- Caring, busy, never angry.

Props:
- Babaou: tan plush monkey, round ears, stitched smile, red scarf.
- Dinosaur: small green rounded stegosaurus.
- Message car: small yellow toy car with red wheels.
- Vacuum: ordinary silver-gray household vacuum, made dramatic only by camera angle and shadow.

## Generation Order

1. Generate `octavio-reference.png`.
2. Generate `props-reference.png`.
3. Generate `bedroom-reference.png`.
4. Generate the 10 story illustrations using the references and prompts from `content/la-cabane-en-etat-dalerte.production.json`.
5. Export each image twice:
   - Print: `assets/stories/la-cabane-en-etat-dalerte/print/01-cleaning-day.png`
   - Web: `assets/stories/la-cabane-en-etat-dalerte/web/01-cleaning-day.jpg`

## App Script

The first story in `src/stories.js` has been updated to a 10-slide web version. Each slide is intentionally short for overlay text. Keep the full PDF prose for narration/audio later, but use the shorter `appText` lines for the visual reader.

## Naming

Use these stable image IDs:

1. `01-cleaning-day`
2. `02-bored-octavio`
3. `03-the-idea`
4. `04-sheet-avalanche`
5. `05-building-fort`
6. `06-command-team`
7. `07-headquarters`
8. `08-vacuum-monster`
9. `09-held-breath`
10. `10-mission-continues`

## Implementation Note

Once images are generated, add an `image` field to each slide in `src/stories.js`, for example:

```js
image: "/assets/stories/la-cabane-en-etat-dalerte/web/01-cleaning-day.jpg"
```

Then the reader can use the real bitmap as the scene background instead of the current gradient placeholder.
