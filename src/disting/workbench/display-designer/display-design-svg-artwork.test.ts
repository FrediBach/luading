// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parseDisplaySvg } from './display-design-svg-file'
import { convertDisplaySvg } from './display-design-svg-convert'
import { DEFAULT_SVG_IMPORT_OPTIONS } from './display-design-svg-model'
import { compileDisplayDesign } from './display-design-compiler'
import { createEmptyDisplayDesign } from './display-design-model'
import { renderDisplayTestPixels } from '../../testing/display-pixel-test-environment'

it('imports a real pixel UI export group with stable pixel positions and documented shade quantization', () => {
  const exported = readFileSync('design/disting-pixel-ui-components.svg', 'utf8')
  expect(() => parseDisplaySvg(exported)).toThrow(/2 MiB/)
  const xml = new DOMParser().parseFromString(exported, 'image/svg+xml')
  const artwork = xml.querySelector('g[data-name="Pixel artwork"]')!
  expect(artwork).not.toBeNull()
  const text = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 64">${new XMLSerializer().serializeToString(artwork)}</svg>`
  const scene = parseDisplaySvg(text), conversion = convertDisplaySvg(scene, DEFAULT_SVG_IMPORT_OPTIONS, 'full-screen')
  expect(conversion.findings.filter(f => f.severity === 'blocked')).toEqual([])
  expect(conversion.elements.some(e => e.kind === 'text')).toBe(false)
  const rendered = renderDisplayTestPixels(compileDisplayDesign({ ...createEmptyDisplayDesign(), displayMode: 'full-screen', elements: conversion.elements }).commands)
  // The exporter uses a cyan palette. Generic RGB luminance conversion deliberately
  // does not treat its data-shade annotation as an instruction.
  const expected = new Uint8Array(256 * 64)
  for (const rect of artwork.querySelectorAll('rect')) {
    const x = Number(rect.getAttribute('x')), y = Number(rect.getAttribute('y')), width = Number(rect.getAttribute('width')), height = Number(rect.getAttribute('height')), shade = [0, 1, 1, 2, 3, 4, 4, 5, 6, 7, 7, 8, 9, 10, 10, 11][Number(rect.getAttribute('data-shade'))]!
    for (let row = y; row < y + height; row++)for (let column = x; column < x + width; column++)if (column >= 0 && column < 256 && row >= 0 && row < 64) expected[row * 256 + column] = shade
  }
  expect(rendered).toEqual(expected)
})
