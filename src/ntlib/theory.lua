local quant = require "ntlib.quant"
local M = {}
M.INTERVALS = { P1 = 0, m2 = 1, M2 = 2, m3 = 3, M3 = 4, P4 = 5, TT = 6, P5 = 7, m6 = 8, M6 = 9, m7 = 10, M7 = 11, P8 = 12 }
M.CHORDS = {
  maj = { 0, 4, 7 }, min = { 0, 3, 7 }, dim = { 0, 3, 6 }, aug = { 0, 4, 8 }, sus2 = { 0, 2, 7 }, sus4 = { 0, 5, 7 },
  maj6 = { 0, 4, 7, 9 }, min6 = { 0, 3, 7, 9 }, maj7 = { 0, 4, 7, 11 }, min7 = { 0, 3, 7, 10 }, dom7 = { 0, 4, 7, 10 },
  dim7 = { 0, 3, 6, 9 }, halfDim7 = { 0, 3, 6, 10 }, minMaj7 = { 0, 3, 7, 11 }, add9 = { 0, 4, 7, 14 },
  maj9 = { 0, 4, 7, 11, 14 }, min9 = { 0, 3, 7, 10, 14 }, dom9 = { 0, 4, 7, 10, 14 },
}
M.CHORD_NAMES = { "Major", "Minor", "Diminished", "Augmented", "Sus 2", "Sus 4", "Major 6", "Minor 6", "Major 7", "Minor 7", "Dominant 7", "Diminished 7", "Half-diminished 7", "Minor-major 7", "Add 9", "Major 9", "Minor 9", "Dominant 9" }
function M.copyOf(t) local out = {}; for i = 1, #t do out[i] = t[i] end return out end
function M.chord(root, quality, out) local chord = type(quality) == "table" and quality or M.CHORDS[quality]; if not chord then error("unknown chord quality", 2) end; for i = 1, #chord do out[i] = root + chord[i] end; return #chord end
function M.invert(out, n, inversion) inversion = math.floor(inversion or 0); if n == 0 then return 0 end; if inversion >= 0 then for _ = 1, inversion do local first = out[1]; for i = 1, n - 1 do out[i] = out[i + 1] end out[n] = first + 12 end else for _ = -1, inversion, -1 do local last = out[n]; for i = n, 2, -1 do out[i] = out[i - 1] end out[1] = last - 12 end end return n end
function M.spread(out, n, octaves) octaves = math.max(1, math.floor(octaves or 1)); for i = 1, n do out[i] = out[i] + math.floor((i - 1) * octaves / math.max(1, n - 1)) * 12 end return n end
function M.drop(out, n, which) which = math.floor(which or 2); local index = n - which + 1; if index >= 1 and index <= n then out[index] = out[index] - 12; table.sort(out, function(a, b) return a < b end) end return n end
function M.limitRange(out, n, lo, hi) for i = 1, n do while out[i] < lo do out[i] = out[i] + 12 end; while out[i] > hi do out[i] = out[i] - 12 end end table.sort(out, function(a, b) return a < b end); return n end
function M.leadTo(prev, prevN, next, nextN)
  for i = 1, nextN do local target = prev[math.min(i, prevN)] or next[i]; local best, distance = next[i], math.huge; for octave = -4, 4 do local candidate = next[i] + octave * 12; local d = math.abs(candidate - target); if d < distance then best, distance = candidate, d end end next[i] = best end
  table.sort(next, function(a, b) return a < b end); return nextN
end
local function intervals(mask) return quant.maskToIntervals(mask, {}) end
function M.degreeToSemis(mask, degree) local list = intervals(mask); if #list == 0 then return 0 end; local octave = math.floor((degree - 1) / #list); return list[(degree - 1) % #list + 1] + octave * 12 end
function M.semisToDegree(mask, semis) local list = intervals(mask); local octave = math.floor(semis / 12); local pc = semis - octave * 12; local best, distance = 1, math.huge; for i = 1, #list do local d = math.abs(pc - list[i]); if d < distance then best, distance = i, d end end return best, octave end
function M.diatonicTranspose(mask, semis, degrees) local degree, octave = M.semisToDegree(mask, semis); return M.degreeToSemis(mask, degree + degrees) + octave * 12 end
function M.triadOn(mask, degree, out) out[1], out[2], out[3] = M.degreeToSemis(mask, degree), M.degreeToSemis(mask, degree + 2), M.degreeToSemis(mask, degree + 4); return 3 end
function M.seventhOn(mask, degree, out) M.triadOn(mask, degree, out); out[4] = M.degreeToSemis(mask, degree + 6); return 4 end
local names = { [0] = "C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B" }
function M.chordName(root, quality, inversion) local chord = M.CHORDS[quality]; if not chord then return nil end; local suffix = ({ maj = "", min = "m", dim = "dim", aug = "+", dom7 = "7", min7 = "m7", maj7 = "maj7" })[quality] or quality; local result = names[root % 12] .. suffix; if inversion and inversion ~= 0 then result = result .. "/" .. names[(root + chord[inversion % #chord + 1]) % 12] end return result end
function M.romanNumeral(mask, degree) local roman = { "I", "II", "III", "IV", "V", "VI", "VII" }; local root = M.degreeToSemis(mask, degree); local third = M.degreeToSemis(mask, degree + 2) - root; local fifth = M.degreeToSemis(mask, degree + 4) - root; local value = roman[(degree - 1) % 7 + 1] or tostring(degree); if third % 12 == 3 then value = value:lower() end; if fifth % 12 == 6 then value = value .. "°" end; return value end
function M.parseProgression(text, out) out = out or {}; local lookup = { I = 1, II = 2, III = 3, IV = 4, V = 5, VI = 6, VII = 7 }; local n = 0; for token in text:gmatch("[^%-%s]+") do local cleaned = token:upper():gsub("[^IV]", ""); if lookup[cleaned] then n = n + 1; out[n] = lookup[cleaned] end end; for i = n + 1, #out do out[i] = nil end; return out end

return M
