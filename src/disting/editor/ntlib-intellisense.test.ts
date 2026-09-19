import { describe, expect, it } from 'vitest'
import { NTLIB_MODULES } from '../ntlib-modules'
import { completionEntriesForSource } from './disting-intellisense'
import { ntlibCatalogMembers } from './ntlib-intellisense'

function cursorSource(value: string) {
  const offset = value.indexOf('|')
  if (offset < 0) throw new Error('Fixture needs a | cursor marker.')
  return { source: value.slice(0, offset) + value.slice(offset + 1), offset }
}

function labels(value: string) {
  const { source, offset } = cursorSource(value)
  return completionEntriesForSource(source, offset).map((entry) => entry.label)
}

describe('ntlib IntelliSense catalog', () => {
  it('catalogs every public module function and object method from the bundled sources', () => {
    const publicObjectTypes = new Set<string>()
    for (const [moduleName, source] of Object.entries(NTLIB_MODULES)) {
      for (const match of source.matchAll(/function\s+M((?:\.[A-Za-z_]\w*)+)\s*\(/g)) {
        const path = match[1].slice(1).split('.')
        const label = path.pop()!
        const owner = [moduleName, ...path].join('.')
        expect(ntlibCatalogMembers(owner).map((entry) => entry.label), `${owner}.${label}`)
          .toContain(label)
      }
      for (const match of source.matchAll(/function\s+([A-Z][A-Za-z0-9_]*):([A-Za-z_]\w*)\s*\(/g)) {
        if (match[2].startsWith('_')) continue
        const owner = `${moduleName}#${match[1]}`
        publicObjectTypes.add(owner)
        expect(ntlibCatalogMembers(owner).map((entry) => entry.label), `${owner}:${match[2]}`)
          .toContain(match[2])
      }
    }

    const reachableTypes = new Set(Object.keys(NTLIB_MODULES))
    let discovered = true
    while (discovered) {
      discovered = false
      for (const owner of [...reachableTypes]) {
        for (const entry of ntlibCatalogMembers(owner)) {
          if (entry.resultType && !reachableTypes.has(entry.resultType)) {
            reachableTypes.add(entry.resultType)
            discovered = true
          }
        }
      }
    }
    expect([...publicObjectTypes].filter((owner) => !reachableTypes.has(owner))).toEqual([])
  })

  it('completes require paths, modules, nested tables, and constructor results', () => {
    expect(labels("local quant = require 'ntlib.qu|'")).toContain('ntlib.quant')

    expect(labels(`local nt = require 'ntlib'
nt.|`)).toEqual(expect.arrayContaining(['quant', 'clock', 'draw', 'require', 'VERSION']))

    expect(labels(`local quant = require 'ntlib.quant'
quant.|`)).toEqual(expect.arrayContaining([
      'SCALES', 'SCALE_NAMES', 'copyOf', 'maskFromIntervals', 'new', 'fromCents',
    ]))

    expect(labels(`local quant = require 'ntlib.quant'
quant.SCALES.|`)).toEqual(expect.arrayContaining([
      'major', 'naturalMinor', 'chromatic', 'minorPent',
    ]))

    expect(labels(`local clock = require 'ntlib.clock'
local tracker = clock.new{}
tracker:|`)).toEqual(expect.arrayContaining([
      'pulse', 'process', 'setBpm', 'setInternal', 'setPpqn', 'isLost', 'isRunning', 'divider',
    ]))

    expect(labels(`local clock = require 'ntlib.clock'
local tracker = clock.new{}
local divider = tracker:divider{}
divider:|`)).toEqual(expect.arrayContaining(['process', 'reset', 'set']))
  })

  it('includes dynamically forwarded default-tuning functions', () => {
    const entries = (() => {
      const { source, offset } = cursorSource(`local volts = require 'ntlib.volts'
volts.|`)
      return completionEntriesForSource(source, offset)
    })()
    expect(entries.map((entry) => entry.label)).toEqual(expect.arrayContaining([
      'toMidi', 'fromMidi', 'toHz', 'fromHz', 'noteName', 'parseNote', 'tuning', 'setDefault',
    ]))
    expect(entries.find((entry) => entry.label === 'toMidi')?.signature)
      .toBe('ntlib.volts.toMidi(v)')
  })
})
