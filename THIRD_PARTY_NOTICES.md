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

## Voltage Foundry Modular WeaveForge behavior

`lua-scripts/fredi-bach/WeaveForge.lua` is an independently written Disting NT
adaptation of the dual shift-register sequencing behavior documented for
Voltage Foundry Modular's WeaveForge. Its register, weaving, and window-read
rules are informed by the public manual, implementation, and regression tests.
It does not copy source code, hardware design files, display assets, or resource
data from the upstream project.

Source: [VoltageFoundryMod/ForgeSeries WeaveForge](https://github.com/VoltageFoundryMod/ForgeSeries/tree/main/apps/wea)

Manual: [WeaveForge module page](https://vfmod.com/modules/weaveforge/)

## Disting NT display font atlases

The generated standard atlas uses Pixelmix Regular at 8px and the tiny atlas
uses Tom Thumb at 6px, both rendered monochrome with FreeType. These are
simulator approximations, following the choices in
[nt_lua_emulator display.lua](https://github.com/thorinside/nt_lua_emulator/blob/main/modules/display.lua).
They are not proof of firmware font selection or hardware glyph parity.
Unmodified source TTF files are retained in `tools/fonts/` for regeneration.

### pixelmix Regular

Copyright pixelmix 2010. Created with FontStruct.

Source: [pixelmix on FontStruct](https://fontstruct.com/fontstructions/show/300535/pixelmix).
The source font and derived standard atlas are licensed under
[Creative Commons Attribution-ShareAlike 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
The atlas rasterizes the outlines at 8px without modifying the source TTF.

### Tom Thumb

The bundled TrueType file identifies **Copyright Lord Nightmare 2019** and
[Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/)
in its embedded name records. Those terms apply to this source TTF and the
derived tiny atlas. The atlas rasterizes the outlines at 6px without modifying
the source TTF. Source:
[nt_lua_emulator/fonts/tom-thumb.ttf](https://github.com/thorinside/nt_lua_emulator/blob/main/fonts/tom-thumb.ttf).

### Regeneration and source integrity

See [tools/fonts/README.md](tools/fonts/README.md) for source hashes and commands.
`tools/regenerate-display-fonts.mjs` invokes
`tools/generate-display-font-atlas.c` and writes both complete generated modules,
including attribution headers. Do not hand-edit the generated atlases.

### Historical firmware-derived atlases

Earlier revisions used Selawik at 10px for standard text and Pixelmix at 5px
for tiny text. The recorded source hashes were extracted from firmware 1.12.0;
that asset provenance did not establish the correct mapping or raster sizes
for the Lua text APIs. These notices are retained for historical attribution:

- Selawik Regular SHA-256:
  `e9d98518d8ac2817782a9a382430463a2e0793ea68350b695bb727d9a830ee1c`
- pixelmix Regular SHA-256:
  `264bac6a1671ba52da6611096a6ab7dd1c20320e72e04c646e53aa243d64f5bf`

Copyright 2015 Microsoft Corporation. Selawik is a trademark of Microsoft
Corporation in the United States and/or other countries. Designed by Aaron Bell.
Selawik is licensed under the
[SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/).
The former Selawik atlas used 10-pixel, 4-bit coverage rasterization with FreeType.
The former monochrome 5-pixel Pixelmix atlas remains under CC BY-SA 3.0.
