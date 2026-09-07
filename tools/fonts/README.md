# Display font sources

These unmodified TTFs were retrieved on 2026-09-07 from
[thorinside/nt_lua_emulator/fonts](https://github.com/thorinside/nt_lua_emulator/tree/main/fonts).
Its `modules/display.lua` selects Pixelmix at 8px and Tom Thumb at 6px before
window scaling. Luading rasterizes at native resolution in monochrome.
This is compatibility evidence for an approximation, not hardware confirmation.

| File | SHA-256 | Licence in the TTF |
| --- | --- | --- |
| `PixelmixRegular-z07w.ttf` | `264bac6a1671ba52da6611096a6ab7dd1c20320e72e04c646e53aa243d64f5bf` | CC BY-SA 3.0, Copyright pixelmix 2010 |
| `tom-thumb.ttf` | `dd0ababf9fbda59287d90710e66f2eca93e0ccd66f64eac0a1dbac8079dc35f1` | CC BY 3.0, Copyright Lord Nightmare 2019 |

Git blob IDs in that repository are respectively
`6a9b98ad200dc5a888313fc9b6aa59b52fe34a81` and
`c659a874ebf24f7fa1ef69ac050df3d3165b3449`.
See [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) for attribution and
licence links. Retain the embedded notices when redistributing these sources.

Build the FreeType generator using the platform commands in
`tools/generate-display-font-atlas.c`, then run from the repository root:

```sh
node tools/regenerate-display-fonts.mjs /tmp/generate-display-font-atlas
npx vitest run src/disting/emulation/display-font.test.ts src/disting/emulation/display-renderer.test.ts src/disting/emulation/display-bounds.test.ts
```

The wrapper generates both atlas modules, including their attribution headers.
The pixel sizes include font spacing: Tom Thumb capitals occupy 3×5 pixels
with a four-pixel advance; Pixelmix capitals occupy 5×7 pixels. Lowercase,
punctuation, and accented glyphs have their own metrics. The font cmap is
retained as supplied, including any upstream placeholder glyphs; codepoints
outside the cmap fall back to `?`. Coverage tests establish deterministic
simulator rendering, not hardware parity. No large antialiased face is mapped
by this two-face Lua renderer.
