local M = {
  PER_OCTAVE = 1.0,
  PER_SEMITONE = 1 / 12,
  PER_CENT = 1 / 1200,
  NAMES_SHARP = { [0] = "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" },
  NAMES_FLAT = { [0] = "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B" },
}

local Tuning = {}
Tuning.__index = Tuning

local function validate(opts)
  opts = opts or {}
  local midiAt0V, a4 = opts.midiAt0V or 48, opts.a4 or 440
  if type(midiAt0V) ~= "number" then error("midiAt0V must be a number", 3) end
  if type(a4) ~= "number" or a4 <= 0 then error("a4 must be a positive number", 3) end
  return midiAt0V, a4
end

function M.tuning(opts)
  local midiAt0V, a4 = validate(opts)
  return setmetatable({ midiAt0V = midiAt0V, a4 = a4, _cache = {} }, Tuning)
end

function Tuning:toMidi(v) return self.midiAt0V + v * 12 end
function Tuning:fromMidi(n) return (n - self.midiAt0V) / 12 end
function Tuning:toHz(v) return self.a4 * 2 ^ ((self:toMidi(v) - 69) / 12) end
function Tuning:fromHz(hz) if hz <= 0 then return -math.huge end return self:fromMidi(69 + 12 * math.log(hz / self.a4, 2)) end
function Tuning:toSemis(v) return v * 12 end
function Tuning:fromSemis(s) return s / 12 end
function Tuning:toCents(v) return v * 1200 end
function Tuning:fromCents(c) return c / 1200 end
function Tuning:ratio(v) return 2 ^ v end
function Tuning:interval(a, b) return b - a end
function Tuning:transpose(v, semitones) return v + semitones / 12 end
function Tuning:detune(v, cents) return v + cents / 1200 end
function Tuning:octave(v, n) return v + n end
function Tuning:pitchClass(v) return math.floor(self:toMidi(v) + 0.5) % 12 end
function Tuning:octaveOf(v) return math.floor(self:toMidi(v) / 12) - 1 end
function Tuning:split(v)
  local midi = self:toMidi(v)
  local rounded = math.floor(midi + 0.5)
  return rounded % 12, math.floor(rounded / 12) - 1, (midi - rounded) * 100
end

local function noteNameMidi(self, n, opts)
  opts = opts or {}
  local rounded = math.floor(n + 0.5)
  local cents = math.floor((n - rounded) * 100 + ((n >= rounded) and 0.5 or -0.5))
  local names = opts.flats and M.NAMES_FLAT or M.NAMES_SHARP
  local result = names[rounded % 12]
  if opts.octave ~= false then result = result .. tostring(math.floor(rounded / 12) - 1) end
  if opts.cents and cents ~= 0 then result = result .. (cents > 0 and "+" or "") .. tostring(cents) .. "c" end
  return result
end

function Tuning:noteName(v, opts)
  local key = tostring(v) .. ":" .. tostring(opts and opts.flats) .. ":" .. tostring(not opts or opts.octave ~= false) .. ":" .. tostring(opts and opts.cents)
  if self._cache.key == key then return self._cache.value end
  local result = noteNameMidi(self, self:toMidi(v), opts)
  self._cache.key, self._cache.value = key, result
  return result
end
function Tuning:noteNameMidi(n, opts) return noteNameMidi(self, n, opts) end
function Tuning:parseNote(text)
  if type(text) ~= "string" then return nil, "note must be a string" end
  local letter, accidental, octave, cents = text:match("^%s*([A-Ga-g])([#b]?)(%-?%d+)([+-]?%d*)[cC]?%s*$")
  if not letter then return nil, "invalid note name" end
  local base = ({ C = 0, D = 2, E = 4, F = 5, G = 7, A = 9, B = 11 })[letter:upper()]
  if accidental == "#" then base = base + 1 elseif accidental == "b" then base = base - 1 end
  local midi = (tonumber(octave) + 1) * 12 + base + (tonumber(cents) or 0) / 100
  return self:fromMidi(midi)
end

local default = M.tuning()
function M.setDefault(opts) default = M.tuning(opts); return M end
for _, name in ipairs({ "toMidi", "fromMidi", "toHz", "fromHz", "toSemis", "fromSemis", "toCents", "fromCents", "ratio", "interval", "transpose", "detune", "octave", "pitchClass", "octaveOf", "split", "noteName", "noteNameMidi", "parseNote" }) do
  M[name] = function(...) return default[name](default, ...) end
end

return M
