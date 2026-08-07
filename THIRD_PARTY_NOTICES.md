# Third-party notices

## Mutable Instruments Grids

`lua-scripts/fredi-bach/Mutable Instruments Grids.lua` adapts the pattern
generator from Mutable Instruments Grids. Its companion
`lua-scripts/fredi-bach/lib/MutableGridsData.lua` contains the original 25
rhythm-map nodes and 32×32 Euclidean lookup table in a packed representation.
Both files carry the upstream copyright and GNU General Public License notice.

Copyright 2011, 2012 Emilie Gillet.

Source: [pichenettes/eurorack/grids at revision 08460a6](https://github.com/pichenettes/eurorack/tree/08460a69a7e1f7a81c5a2abcc7189c9a6b7208d4/grids)

The imported `grids/resources.cc` source had SHA-256
`02c4911d1ee940f921d50207c25a39d911c3f6af9ace87869e7e667954c63265`.

License: [GNU General Public License version 3 or later](LICENSES/GPL-3.0-or-later.txt)

## Mutable Instruments Marbles behavior

`lua-scripts/fredi-bach/Mutable Instruments Marbles.lua` is an independently
written Disting NT adaptation whose decision-loop policy and generator model
are informed by the Mutable Instruments Marbles manual and firmware. The Lua
file carries the upstream copyright and full MIT license notice. It does not
copy Marbles' DSP implementation or resource data.

Copyright 2015 Emilie Gillet.

Source: [pichenettes/eurorack/marbles](https://github.com/pichenettes/eurorack/tree/master/marbles)

## Mutable Instruments Stages behavior

`lua-scripts/fredi-bach/Mutable Instruments Stages.lua` is an independently
written Disting NT adaptation whose segment rules and control model are
informed by the Mutable Instruments Stages manual and firmware. The Lua file
carries the upstream copyright and full MIT license notice. It does not copy
Stages' DSP implementation or resource data.

Copyright 2017 Emilie Gillet.

Source: [pichenettes/eurorack/stages](https://github.com/pichenettes/eurorack/tree/master/stages)

## Ornament & Crime Automatonnetz and Tonnetz behavior

`lua-scripts/fredi-bach/Automatonnetz.lua` adapts the grid sequencing and
neo-Riemannian transformation behavior from the Ornament & Crime firmware by
Patrick Dowling and Tim Churches. The adapted Lua file carries the upstream
copyright and full MIT license notice.

Source: [mxmxmx/O_C](https://github.com/mxmxmx/O_C)

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
