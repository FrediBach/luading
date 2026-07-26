# Third-party notices

## Disting NT display font atlases

The generated files
`src/disting/emulation/standard-font-atlas.generated.ts` and
`src/disting/emulation/tiny-font-atlas.generated.ts` contain raster data derived
from fonts embedded in the official Expert Sleepers Disting NT 1.12.0 firmware.
The TrueType files themselves are not distributed in this repository.

The extracted font binaries were checked against firmware 1.12.0:

- Selawik Regular SHA-256:
  `e9d98518d8ac2817782a9a382430463a2e0793ea68350b695bb727d9a830ee1c`
- pixelmix Regular SHA-256:
  `264bac6a1671ba52da6611096a6ab7dd1c20320e72e04c646e53aa243d64f5bf`

### Selawik Regular

Copyright 2015 Microsoft Corporation. Selawik is a trademark of Microsoft
Corporation in the United States and/or other countries. Designed by Aaron Bell.

Selawik is licensed under the
[SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/).
The atlas is a 10-pixel, 4-bit coverage rasterization made with FreeType; it does
not modify the upstream font file.

### pixelmix Regular

Copyright pixelmix 2010. Created with FontStruct.

Source:
[pixelmix on FontStruct](https://fontstruct.com/fontstructions/show/300535/pixelmix)

pixelmix is licensed under
[Creative Commons Attribution-ShareAlike 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
The atlas is a monochrome 5-pixel rasterization of the upstream outlines. The
pixelmix-derived atlas data remains available under CC BY-SA 3.0.

### Regeneration

`tools/generate-display-font-atlas.c` converts the extracted TrueType faces into
the TypeScript atlas format. Regeneration requires FreeType. The standard face
uses normal grayscale rendering at 10 pixels; the tiny face uses monochrome
rendering at 5 pixels.
