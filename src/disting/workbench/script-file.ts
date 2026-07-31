export const NEW_DISTING_SCRIPT = `-- New Script
-- Passes input 1 to output 1. Replace the example logic below.

local outputs = {}

-- Add shared state and helper functions above the returned table.
return {
  name = "New Script",
  author = "Your Name",

  init = function(self)
    -- Declare inputs, outputs, and parameters here.
    return {
      inputs = { kCV },
      inputNames = { "Input" },
      outputs = { kLinear },
      outputNames = { "Output" },
    }
  end,

  step = function(self, dt, inputs)
    -- This runs every 1 ms. Put signal processing here.
    outputs[1] = inputs[1]
    return outputs
  end,

  -- Add draw(), trigger(), gate(), MIDI, or UI callbacks here.
}`

export function luaDownloadFilename(suggestedName: string) {
  const stem = suggestedName
    .trim()
    .replace(/\.lua$/i, '')
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')

  return `${stem || 'disting-script'}.lua`
}

export async function readLuaScriptFile(file: Pick<File, 'text'>) {
  const source = await file.text()
  return source.startsWith('\uFEFF') ? source.slice(1) : source
}

export function createLuaScriptDownload(source: string, suggestedName: string) {
  return {
    blob: new Blob([source], { type: 'text/x-lua;charset=utf-8' }),
    filename: luaDownloadFilename(suggestedName),
  }
}
