import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { renderDistingDisplay } from '../../emulation/display-renderer'
import { createEmptyDisplayDesign, type DisplayDesignDocument, type DisplayDesignSelection } from './display-design-model'
import { compileDisplayDesign } from './display-design-compiler'
import { displayElementBounds } from './display-design-geometry'
import { readDisplaySvg, validateSvgFile } from './display-design-svg-file'
import { convertDisplaySvgAsync, selectedSvgNodes, svgPlacement, svgTarget } from './display-design-svg-convert'
import { materializeSvgImport, unresolvedSvgFindings } from './display-design-svg-import'
import { DEFAULT_SVG_IMPORT_OPTIONS, svgUnion, type SvgConversion, type SvgImportOptions, type SvgNodeOverride, type SvgScene, type SvgSourceNode } from './display-design-svg-model'
import { svgColour } from './display-design-svg-style'
import { matchSvgText } from './display-design-svg-text'
import './display-designer-foundation.css'
import './display-designer-svg.css'

function sourcePaint(node: SvgSourceNode, key: 'fill' | 'stroke') {
  try { const paint = svgColour(node.style[key], node.style.color); return paint ? (node.style[key].toLowerCase() === 'currentcolor' ? node.style.color : node.style[key]) : 'none' } catch { return 'none' }
}
function sourcePath(node: SvgSourceNode) {
  return node.contours.map(c => `M${c.start.x} ${c.start.y} ${c.segments.map(s => `${s.points.length === 2 ? 'L' : s.points.length === 3 ? 'Q' : 'C'}${s.points.slice(1).map(p => `${p.x} ${p.y}`).join(' ')}`).join(' ')} ${c.closed ? 'Z' : ''}`).join(' ')
}
function SvgReference({ scene, options, selected, onSelect }: { scene: SvgScene; options: SvgImportOptions; selected: string; onSelect: (id: string) => void }) {
  const nodes = selectedSvgNodes(scene, options), bounds = svgUnion(nodes.map(n => n.bounds))
  const width = Math.max(1, bounds.width), height = Math.max(1, bounds.height)
  return <svg className="svg-import-reference" role="img" aria-label="Sanitized SVG reference; effects and source fonts may differ" viewBox={`${bounds.x - 1} ${bounds.y - 1} ${width + 2} ${height + 2}`}>
    {nodes.map(node => <g key={node.id} transform={`matrix(${node.matrix.join(' ')})`} opacity={options.overrides[node.id]?.excluded ? 0.2 : 1} onClick={() => onSelect(node.id)}>
      <title>{node.name}</title>
      {node.text ? <text x={node.text.x} y={node.text.y} fontSize={node.text.size} fontFamily="sans-serif" fill={sourcePaint(node, 'fill')} textAnchor={node.style['text-anchor'] === 'middle' ? 'middle' : node.style['text-anchor'] === 'end' ? 'end' : 'start'}>{node.text.value}</text> : <path d={sourcePath(node)} fill={sourcePaint(node, 'fill')} stroke={sourcePaint(node, 'stroke')} fillRule={node.style['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero'} strokeWidth={Number.parseFloat(node.style['stroke-width']) || 1} />}
    </g>)}
    {nodes.filter(n => n.id === selected).map(n => <rect key={`selection-${n.id}`} x={n.bounds.x} y={n.bounds.y} width={Math.max(1, n.bounds.width)} height={Math.max(1, n.bounds.height)} fill="none" stroke="#ff9248" strokeWidth={Math.max(width, height) / 256} pointerEvents="none" />)}
  </svg>
}
function ConvertedPreview({ conversion, mode, selected, zoom }: { conversion: SvgConversion; mode: DisplayDesignDocument['displayMode']; selected: string; zoom: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const preview = useMemo(() => ({ ...createEmptyDisplayDesign(), displayMode: mode, elements: conversion.elements }), [conversion, mode])
  const compiled = useMemo(() => compileDisplayDesign(preview), [preview])
  useEffect(() => { const context = ref.current?.getContext('2d'); if (context) renderDistingDisplay(context, compiled.commands) }, [compiled])
  const ids = new Set(conversion.sourceMap[selected] ?? [])
  const bounds = conversion.elements.filter(e => ids.has(e.id)).map(e => displayElementBounds(e, preview))
  const top = mode === 'parameter-line' ? 10 : 0
  return <div className="svg-import-pixels" style={{ width: 256 * zoom, height: 64 * zoom }}>
    <canvas ref={ref} width={256} height={64} aria-label="Converted Disting NT pixel preview" />
    <svg viewBox="0 0 256 64" aria-label="Import clipping and selection overlay">
      {top > 0 && <rect x={0} y={0} width={256} height={top} fill="#ff9248" opacity={.25} />}
      <rect x={.5} y={top + .5} width={255} height={63 - top} fill="none" stroke="#7d8989" strokeWidth={.25} />
      {bounds.map((b, i) => <rect key={i} x={b.left - .5} y={b.top - .5} width={Math.max(1, b.right - b.left + 1)} height={Math.max(1, b.bottom - b.top + 1)} fill="none" stroke="#ff9248" strokeWidth={.5} />)}
    </svg>
  </div>
}
export interface DisplaySvgImportDialogProps {
  document: DisplayDesignDocument
  onClose: () => void
  returnFocusRef?: RefObject<HTMLButtonElement | null>
  onInsert: (document: DisplayDesignDocument, selection: DisplayDesignSelection, summary: string) => void
}
export function DisplaySvgImportDialog({ document, onClose, onInsert, returnFocusRef }: DisplaySvgImportDialogProps) {
  const [source, setSource] = useState<{ text: string; name: string }>()
  const [scene, setScene] = useState<SvgScene>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [options, setOptions] = useState<SvgImportOptions>(() => ({ ...DEFAULT_SVG_IMPORT_OPTIONS, overrides: {}, accepted: [] }))
  const [analysis, setAnalysis] = useState<{ scene: SvgScene; options: SvgImportOptions; mode: DisplayDesignDocument['displayMode']; conversion: SvgConversion }>()
  const [selected, setSelected] = useState('')
  const [zoom, setZoom] = useState(2)
  const [sourceWidth, setSourceWidth] = useState(256), [sourceHeight, setSourceHeight] = useState(64)
  const abortRef = useRef<AbortController | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null), fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const previous = returnFocusRef?.current ?? globalThis.document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { abortRef.current?.abort(); previous?.focus() }
  }, [returnFocusRef])
  useEffect(() => {
    if (!scene) return
    const controller = new AbortController()
    void convertDisplaySvgAsync(scene, options, document.displayMode, controller.signal).then(conversion => {
      if (!controller.signal.aborted) { setAnalysis({ scene, options, mode: document.displayMode, conversion }); setError('') }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Conversion failed.') })
    return () => controller.abort()
  }, [scene, options, document.displayMode])
  const conversion = analysis && analysis.scene === scene && analysis.options === options && analysis.mode === document.displayMode ? analysis.conversion : undefined
  const candidate = useMemo(() => scene && conversion ? materializeSvgImport(document, scene, conversion, options) : undefined, [document, scene, conversion, options])
  const update = (patch: Partial<SvgImportOptions>) => setOptions(current => ({ ...current, ...patch, accepted: [] }))
  const override = (id: string, patch: SvgNodeOverride) => setOptions(current => ({ ...current, accepted: [], overrides: { ...current.overrides, [id]: { ...current.overrides[id], ...patch } } }))
  const analyze = async (next: { text: string; name: string }, dimensions?: { width: number; height: number }) => {
    abortRef.current?.abort(); const controller = new AbortController(); abortRef.current = controller
    setLoading(true); setError(''); setScene(undefined); setAnalysis(undefined)
    try {
      const normalized = await readDisplaySvg(next.text, next.name, controller.signal, dimensions)
      if (controller.signal.aborted) return
      const actual = svgPlacement(normalized, DEFAULT_SVG_IMPORT_OPTIONS, document.displayMode)
      const b = actual.artwork, t = actual.target
      const fits = b.x >= t.x && b.y >= t.y && b.x + b.width <= t.x + t.width && b.y + b.height <= t.y + t.height
      setOptions({ ...DEFAULT_SVG_IMPORT_OPTIONS, fit: fits ? 'actual' : 'artwork', overrides: {}, accepted: [] })
      setScene(normalized); setSelected(normalized.nodes[0]?.id ?? '')
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to read SVG.') }
    finally { if (!controller.signal.aborted) setLoading(false) }
  }
  const choose = async (file: File) => {
    abortRef.current?.abort(); const read = new AbortController(); abortRef.current = read
    setScene(undefined); setSource(undefined); setAnalysis(undefined); setLoading(true); setError('')
    try { validateSvgFile(file); const text = await file.text(); if (read.signal.aborted) return; const next = { text, name: file.name.replace(/\.svg$/iu, '') || 'Imported SVG' }; setSource(next); await analyze(next) }
    catch (reason) { if (!read.signal.aborted) { setLoading(false); setError(reason instanceof Error ? reason.message : 'Unable to read SVG.') } }
  }
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (event.key === 'Escape') { event.preventDefault(); onClose() }
    if (event.key === 'Tab') {
      const fields = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not([hidden]),select,textarea,[tabindex="0"]')].filter(e => !e.hasAttribute('disabled'))
      const first = fields[0], last = fields.at(-1)
      if (event.shiftKey && globalThis.document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && globalThis.document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }
  const selectedNode = scene?.nodes.find(n => n.id === selected), selectedOverride = options.overrides[selected] ?? {}
  const reviews = conversion?.findings.filter(f => f.severity === 'review' && !options.accepted.includes(f.id)) ?? []
  const unresolved = conversion ? unresolvedSvgFindings(conversion, options) : []
  const textCandidates = selectedNode?.text && conversion ? matchSvgText(selectedNode, conversion.scale, 20, 30, svgTarget('full-screen'), selectedOverride.splitLines ? { ...selectedOverride, text: (selectedOverride.text ?? selectedNode.text.value).split(/\r?\n/u)[0] } : selectedOverride).candidates : []
  const panel = <div className="svg-import-backdrop" onKeyDown={keyDown}>
    <div className="display-designer-dialog svg-import-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="svg-import-title" aria-describedby="svg-import-description">
      <header><div><h2 id="svg-import-title">Import SVG</h2><p id="svg-import-description">Convert artwork to editable Disting draw elements. Review changes before inserting.</p></div><button type="button" onClick={onClose}>Cancel import</button></header>
      <div className="svg-import-toolbar">
        <button type="button" onClick={() => fileRef.current?.click()}>Choose SVG file</button>
        <input ref={fileRef} hidden type="file" accept=".svg,image/svg+xml" aria-label="Choose SVG file" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void choose(file) }} />
        <span role="status">{loading ? 'Reading SVG…' : scene ? `${scene.name} · ${scene.viewport.width} × ${scene.viewport.height} source pixels · ${scene.hiddenCount} hidden objects` : ''}</span>
        <label><span>Destination</span><select value={options.newScreen ? 'new' : 'current'} onChange={e => update({ newScreen: e.target.value === 'new' })}><option value="current">Current screen</option><option value="new">New screen</option></select></label>
      </div>
      {error && <div className="svg-import-error" role="alert"><p>{error}</p>{source && <div className="svg-import-toolbar"><label><span>Source width</span><input type="number" min={1} max={1_000_000} value={sourceWidth} onChange={e => setSourceWidth(e.target.valueAsNumber)} /></label><label><span>Source height</span><input type="number" min={1} max={1_000_000} value={sourceHeight} onChange={e => setSourceHeight(e.target.valueAsNumber)} /></label><button type="button" onClick={() => void analyze(source, { width: sourceWidth, height: sourceHeight })}>Retry with source viewport</button></div>}</div>}
      {!scene && !loading && !error && <p className="svg-import-empty">Choose a local SVG up to 2 MiB. For large exports, export the desired artboard or component. Live text becomes native standard or tiny text; outlined letters remain geometry.</p>}
      {scene && <>
        <div className="svg-import-toolbar">
          <label><span>Source group</span><select value={options.groupId} onChange={e => update({ groupId: e.target.value })}><option value="">Whole SVG</option>{scene.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
          <label><span>Placement</span><select value={options.fit} onChange={e => update({ fit: e.target.value as SvgImportOptions['fit'] })}><option value="actual">Original size (1:1)</option><option value="artwork">Fit artwork</option><option value="viewport">Fit source viewport</option><option value="custom">Custom scale and position</option></select></label>
          {options.fit === 'custom' && (['scale', 'x', 'y'] as const).map(key => <label key={key}><span>{key === 'scale' ? 'Scale' : `${key.toUpperCase()} offset`}</span><input type="number" step="any" value={Number.isFinite(options[key]) ? options[key] : ''} onChange={e => update({ [key]: e.target.valueAsNumber })} /></label>)}
          <label><span>Margin</span><input type="number" min={0} max={26} value={options.margin} onChange={e => update({ margin: e.target.valueAsNumber })} /></label>
          <label><span>Curve tolerance</span><select value={options.detail} onChange={e => update({ detail: Number(e.target.value) })}><option value={.5}>0.5 px</option><option value={1}>1 px · fewer segments</option><option value={2}>2 px · fewer segments</option><option value={4}>4 px · fewest segments</option></select></label>
          <label><input type="checkbox" checked={options.invert} onChange={e => update({ invert: e.target.checked })} />Invert shades</label>
          <label><input type="checkbox" checked={options.keepClipped} onChange={e => update({ keepClipped: e.target.checked })} />Keep clipped</label>
        </div>
        <div className="svg-import-previews">
          <figure><figcaption>Source reference · solid paints; source fonts/effects may differ</figcaption><SvgReference scene={scene} options={options} selected={selected} onSelect={setSelected} /></figure>
          <figure><figcaption>Converted display · {document.displayMode === 'parameter-line' ? 'top 10 rows reserved' : 'full 256 × 64'} <label>Zoom <select aria-label="Import preview zoom" value={zoom} onChange={e => setZoom(Number(e.target.value))}><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select></label></figcaption><div className="svg-import-preview-scroll">{conversion ? <ConvertedPreview conversion={conversion} mode={document.displayMode} selected={selected} zoom={zoom} /> : <p role="status">Converting artwork…</p>}</div></figure>
        </div>
        <div className="svg-import-review">
          <section aria-label="SVG objects"><h3>Objects</h3><div className="svg-import-object-list">{selectedSvgNodes(scene, options).map(n => <div key={n.id}><button type="button" aria-pressed={n.id === selected} onClick={() => setSelected(n.id)}>{n.name}</button><label><input type="checkbox" checked={Boolean(options.overrides[n.id]?.excluded)} onChange={e => override(n.id, { excluded: e.target.checked })} />Exclude</label></div>)}</div></section>
          <section aria-label="Selected SVG object"><h3>{selectedNode?.name ?? 'Select an object'}</h3>{selectedNode && <>
            <label><span>Shade</span><select value={selectedOverride.shade ?? 'source'} onChange={e => override(selected, { shade: e.target.value === 'source' ? undefined : Number(e.target.value) })}><option value="source">From source colour</option>{Array.from({ length: 16 }, (_, i) => <option key={i} value={i}>{i}</option>)}</select></label>
            {(['x', 'y'] as const).map(key => <label key={key}><span>Object {key.toUpperCase()} offset</span><input type="number" value={selectedOverride[key] ?? 0} onChange={e => override(selected, { [key]: e.target.valueAsNumber })} /></label>)}
            {selectedNode.text && <><label><span>Text content</span><textarea maxLength={512} value={selectedOverride.text ?? selectedNode.text.value} onChange={e => override(selected, { text: e.target.value })} /></label><label><input type="checkbox" checked={Boolean(selectedOverride.splitLines)} onChange={e => override(selected, { splitLines: e.target.checked })} />Split line breaks into separate native labels</label><label><span>Native font</span><select value={selectedOverride.font ?? 'auto'} onChange={e => override(selected, { font: e.target.value as SvgNodeOverride['font'] })}><option value="auto">Automatic best fit</option><option value="standard">Standard</option><option value="tiny">Tiny</option></select></label><p>{textCandidates.map(c => `${c.tiny ? 'Tiny' : 'Standard'}: ${c.width} × ${c.height} px`).join(' · ')}</p><label><input type="checkbox" checked={Boolean(selectedOverride.horizontalText)} onChange={e => override(selected, { horizontalText: e.target.checked })} />Replace transform with horizontal text</label></>}
            <p>After insertion, use Link value in Properties to connect text, position, shade or visibility to your code.</p>
          </>}</section>
          <section aria-label="SVG import findings"><h3>Review findings</h3>{conversion && <p>{conversion.direct} direct · {conversion.approximated} approximated · {conversion.excluded} excluded · {unresolved.length} unresolved</p>}
            {reviews.length > 0 && <button type="button" onClick={() => setOptions(current => ({ ...current, accepted: [...current.accepted, ...reviews.map(f => f.id)] }))}>Accept {reviews.length} proposed approximation{reviews.length === 1 ? '' : 's'}</button>}
            <ul>{conversion?.findings.map(f => <li key={f.id} data-severity={f.severity}><button type="button" onClick={() => setSelected(f.sourceId)}>{f.message}</button>{f.severity === 'review' && <label><input type="checkbox" checked={options.accepted.includes(f.id)} onChange={e => setOptions(current => ({ ...current, accepted: e.target.checked ? [...current.accepted, f.id] : current.accepted.filter(id => id !== f.id) }))} />Accept change</label>}</li>)}</ul>
          </section>
        </div>
      </>}
      <footer><div aria-live="polite">{candidate?.ok ? `${conversion?.elements.length} editable layers · ${candidate.drawCalls} draw calls in destination screen · ${candidate.sourceBytes} Lua bytes` : candidate?.message ?? 'Choose and review artwork to continue.'}<p>Browser-only authoring. Counts do not measure Disting CPU usage; native-font and smooth previews are approximations.</p></div><button type="button" className="svg-import-insert" disabled={!candidate?.ok || loading || !conversion} onClick={() => {
        if (!scene || !conversion) return
        const current = materializeSvgImport(document, scene, conversion, options)
        if (!current.ok) { setError(current.message); return }
        onInsert(current.document, current.selection, `Imported ${conversion.elements.length} SVG layers; ${conversion.approximated} objects approximated, ${conversion.excluded} excluded.`)
      }}>Insert artwork</button></footer>
    </div>
  </div>
  return createPortal(panel, globalThis.document.querySelector('.disting-app') ?? globalThis.document.body)
}
