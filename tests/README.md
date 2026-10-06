# Tests
- `node --test tests/*.test.mjs` — calculations vs the original v10.3 code (3000 random cases) + hand-checked values + machine weight (v10.6).
- `node tests/ui-equivalence.mjs <oldUrl> <newUrl> [chrome]` — loads the same backup into two versions and compares every screen's DOM text,
  every progress chart, every exercise form and every edit dialog. Since v10.6 it ignores CSS, emojis and elements marked `data-added`,
  so a look-only change passes while any change to numbers, labels or what the logic shows/hides fails.
