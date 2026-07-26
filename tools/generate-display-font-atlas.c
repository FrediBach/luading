/*
 * Regenerates the Disting display font atlas from TrueType font files.
 *
 * Build:
 *   cc -std=c11 -Wall -Wextra $(pkg-config --cflags freetype2) \
 *     tools/generate-display-font-atlas.c $(pkg-config --libs freetype2) \
 *     -o /tmp/generate-display-font-atlas
 *
 * On a Homebrew macOS installation without pkg-config:
 *   clang -std=c11 -Wall -Wextra \
 *     -I/opt/homebrew/include/freetype2 tools/generate-display-font-atlas.c \
 *     -L/opt/homebrew/lib -lfreetype -o /tmp/generate-display-font-atlas
 *
 * Usage:
 *   /tmp/generate-display-font-atlas FONT_PATH PIXEL_SIZE normal|mono EXPORT_NAME
 *
 * The output is a TypeScript module fragment written to stdout.
 */

#include <ft2build.h>
#include FT_FREETYPE_H

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void fail(const char *message, FT_Error error) {
  fprintf(stderr, "%s (FreeType error %d)\n", message, error);
  exit(EXIT_FAILURE);
}

static uint8_t coverage_at(const FT_Bitmap *bitmap, unsigned int x, unsigned int y) {
  const unsigned char *row;

  if (bitmap->pitch >= 0) {
    row = bitmap->buffer + y * (unsigned int)bitmap->pitch;
  } else {
    row = bitmap->buffer + (bitmap->rows - y - 1) * (unsigned int)(-bitmap->pitch);
  }

  if (bitmap->pixel_mode == FT_PIXEL_MODE_MONO) {
    return (row[x >> 3] & (0x80u >> (x & 7u))) != 0 ? 15u : 0u;
  }

  if (bitmap->pixel_mode == FT_PIXEL_MODE_GRAY && bitmap->num_grays > 1) {
    const unsigned int maximum = bitmap->num_grays - 1;
    return (uint8_t)((row[x] * 15u + maximum / 2u) / maximum);
  }

  fprintf(stderr, "Unsupported FreeType pixel mode %u\n", bitmap->pixel_mode);
  exit(EXIT_FAILURE);
}

static void print_glyph(FT_Face face, FT_ULong codepoint, int monochrome) {
  FT_Int32 flags = FT_LOAD_RENDER;
  FT_Error error;
  FT_GlyphSlot glyph;

  if (monochrome) {
    flags |= FT_LOAD_TARGET_MONO | FT_LOAD_MONOCHROME;
  } else {
    flags |= FT_LOAD_TARGET_NORMAL;
  }

  error = FT_Load_Char(face, codepoint, flags);
  if (error != 0) {
    fail("Could not render glyph", error);
  }

  glyph = face->glyph;
  printf(
    "    %lu: { advance: %ld, left: %d, top: %d, width: %u, height: %u, data: '",
    codepoint,
    glyph->advance.x >> 6,
    glyph->bitmap_left,
    glyph->bitmap_top,
    glyph->bitmap.width,
    glyph->bitmap.rows
  );

  for (unsigned int y = 0; y < glyph->bitmap.rows; y += 1) {
    for (unsigned int x = 0; x < glyph->bitmap.width; x += 1) {
      printf("%x", coverage_at(&glyph->bitmap, x, y));
    }
  }

  printf("' },\n");
}

int main(int argc, char **argv) {
  FT_Library library;
  FT_Face face;
  FT_Error error;
  FT_ULong codepoint;
  FT_UInt glyph_index;
  char *end = NULL;
  long pixel_size;
  int monochrome;

  if (argc != 5) {
    fprintf(
      stderr,
      "Usage: %s FONT_PATH PIXEL_SIZE normal|mono EXPORT_NAME\n",
      argv[0]
    );
    return EXIT_FAILURE;
  }

  pixel_size = strtol(argv[2], &end, 10);
  if (end == argv[2] || *end != '\0' || pixel_size <= 0 || pixel_size > 64) {
    fprintf(stderr, "PIXEL_SIZE must be an integer from 1 to 64\n");
    return EXIT_FAILURE;
  }

  if (strcmp(argv[3], "normal") == 0) {
    monochrome = 0;
  } else if (strcmp(argv[3], "mono") == 0) {
    monochrome = 1;
  } else {
    fprintf(stderr, "Rendering mode must be normal or mono\n");
    return EXIT_FAILURE;
  }

  error = FT_Init_FreeType(&library);
  if (error != 0) fail("Could not initialize FreeType", error);

  error = FT_New_Face(library, argv[1], 0, &face);
  if (error != 0) fail("Could not load font", error);

  error = FT_Set_Pixel_Sizes(face, 0, (FT_UInt)pixel_size);
  if (error != 0) fail("Could not set font size", error);

  printf("export const %s: DistingFontAtlas = {\n", argv[4]);
  printf("  pixelSize: %ld,\n", pixel_size);
  printf("  ascent: %ld,\n", face->size->metrics.ascender >> 6);
  printf("  descent: %ld,\n", -(face->size->metrics.descender >> 6));
  printf("  lineHeight: %ld,\n", face->size->metrics.height >> 6);
  printf("  glyphs: {\n");

  codepoint = FT_Get_First_Char(face, &glyph_index);
  while (glyph_index != 0) {
    if (codepoint >= 32) {
      print_glyph(face, codepoint, monochrome);
    }
    codepoint = FT_Get_Next_Char(face, codepoint, &glyph_index);
  }

  printf("  },\n");
  printf("}\n");

  FT_Done_Face(face);
  FT_Done_FreeType(library);
  return EXIT_SUCCESS;
}
