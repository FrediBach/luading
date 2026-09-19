local num = require "ntlib.num"
local volts = require "ntlib.volts"
local clock = require "ntlib.clock"
local M = { NOTE_OFF = 1, NOTE_ON = 2, POLY_AT = 3, CC = 4, PROGRAM = 5, CHAN_AT = 6, BEND = 7, SYSEX = 8, UNKNOWN = 0, CLOCK = 9, START = 10, CONTINUE = 11, STOP = 12, RESET = 13 }
local realtime = { [0xf8] = M.CLOCK, [0xfa] = M.START, [0xfb] = M.CONTINUE, [0xfc] = M.STOP, [0xff] = M.RESET }
function M.isRealtime(status) return realtime[math.floor(status or 0)] ~= nil end
function M.parse(b0, b1, b2)
  b0, b1, b2 = math.floor(b0 or 0) & 0xff, math.floor(b1 or 0) & 0x7f, math.floor(b2 or 0) & 0x7f
  if realtime[b0] then return realtime[b0], 0, b1, b2 end
  if b0 == 0xf0 or b0 == 0xf7 then return M.SYSEX, 0, b1, b2 end
  local status, channel = b0 & 0xf0, (b0 & 0x0f) + 1
  local kind = ({ [0x80] = M.NOTE_OFF, [0x90] = M.NOTE_ON, [0xa0] = M.POLY_AT, [0xb0] = M.CC, [0xc0] = M.PROGRAM, [0xd0] = M.CHAN_AT, [0xe0] = M.BEND })[status] or M.UNKNOWN
  return kind, channel, b1, b2
end
function M.isNoteOn(kind, velocity) return kind == M.NOTE_ON and (velocity or 0) > 0 end
local function channel(ch) return num.clamp(math.floor(ch or 1), 1, 16) - 1 end
local function byte(value) return num.clamp(math.floor(value or 0), 0, 127) end
function M.noteOn(ch, note, velocity) return 0x90 | channel(ch), byte(note), byte(velocity) end
function M.noteOff(ch, note, velocity) return 0x80 | channel(ch), byte(note), byte(velocity) end
function M.cc(ch, number, value) return 0xb0 | channel(ch), byte(number), byte(value) end
function M.program(ch, number) return 0xc0 | channel(ch), byte(number) end
function M.bend(ch, value) value = num.clamp(math.floor(value or 8192), 0, 16383); return 0xe0 | channel(ch), value & 0x7f, (value >> 7) & 0x7f end
function M.bendSemis(ch, semitones, range) range = math.max(1e-9, math.abs(range or 2)); return M.bend(ch, math.floor(8192 + num.clamp(semitones / range, -1, 1) * 8191 + 0.5)) end
function M.cc14(ch, number, value) value = num.clamp(math.floor(value), 0, 16383); local a, b, c = M.cc(ch, number, value >> 7); local d, e, f = M.cc(ch, number + 32, value & 0x7f); return a, b, c, d, e, f end
function M.nrpn(ch, parameter, value, out) out = out or {}; parameter, value = num.clamp(math.floor(parameter), 0, 16383), num.clamp(math.floor(value), 0, 16383); out[1] = { M.cc(ch, 99, parameter >> 7) }; out[2] = { M.cc(ch, 98, parameter & 0x7f) }; out[3] = { M.cc(ch, 6, value >> 7) }; out[4] = { M.cc(ch, 38, value & 0x7f) }; return out end

local MidiClock = {}; MidiClock.__index = MidiClock
function M.clock(opts) opts = opts or {}; return setmetatable({ tracker = clock.new{ ppqn = opts.ppqn or 24, bpm = opts.bpm or 120, smoothing = opts.smoothing or 0.25 }, running = false }, MidiClock) end
function MidiClock:byte(status) local kind = realtime[status]; local ticked, started, stopped = false, false, false; if kind == M.CLOCK and self.running then self.tracker:pulse(); ticked = true elseif kind == M.START then self.running, started = true, true; self.tracker:reset() elseif kind == M.CONTINUE then self.running, started = true, true elseif kind == M.STOP then self.running, stopped = false, true end return ticked, started, stopped end
function MidiClock:process(dt) if self.running then return self.tracker:process(dt) end return self.tracker.phase, self.tracker.beat, self.tracker.bpm end

local NoteStack = {}; NoteStack.__index = NoteStack
function M.noteStack(opts) opts = opts or {}; local priority = opts.priority or "last"; if priority ~= "last" and priority ~= "low" and priority ~= "high" then error("invalid note priority", 2) end; return setmetatable({ size = math.max(1, math.floor(opts.size or 16)), priority = priority, notes = {}, velocities = {}, serials = {}, serial = 0 }, NoteStack) end
function NoteStack:_selected() if #self.notes == 0 then return nil end; local best = 1; for i = 2, #self.notes do if (self.priority == "last" and self.serials[i] > self.serials[best]) or (self.priority == "low" and self.notes[i] < self.notes[best]) or (self.priority == "high" and self.notes[i] > self.notes[best]) then best = i end end return self.notes[best], self.velocities[best] end
function NoteStack:on(note, velocity) for i = #self.notes, 1, -1 do if self.notes[i] == note then table.remove(self.notes, i); table.remove(self.velocities, i); table.remove(self.serials, i) end end; if #self.notes >= self.size then table.remove(self.notes, 1); table.remove(self.velocities, 1); table.remove(self.serials, 1) end; self.serial = self.serial + 1; self.notes[#self.notes + 1], self.velocities[#self.velocities + 1], self.serials[#self.serials + 1] = note, velocity, self.serial; local n, v = self:_selected(); return n, v, true end
function NoteStack:off(note) local before = self:_selected(); for i = #self.notes, 1, -1 do if self.notes[i] == note then table.remove(self.notes, i); table.remove(self.velocities, i); table.remove(self.serials, i) end end; local n, v = self:_selected(); return n, v, before ~= n end
function NoteStack:count() return #self.notes end
function NoteStack:panic() for i = #self.notes, 1, -1 do self.notes[i], self.velocities[i], self.serials[i] = nil, nil, nil end return self end

local Voices = {}; Voices.__index = Voices
function M.voices(opts)
  opts = opts or {}; local count = math.max(1, math.floor(opts.count or 4)); local self = setmetatable({ count = count, steal = opts.steal or "oldest", unison = math.max(1, math.floor(opts.unison or 1)), detune = opts.detune or 0, retrigger = opts.retrigger ~= false, rotate = opts.rotate ~= false, notes = {}, vels = {}, active = {}, ages = {}, serial = 0, cursor = 0 }, Voices); for i = 1, count do self.notes[i], self.vels[i], self.active[i], self.ages[i] = 0, 0, false, 0 end return self
end
function Voices:_choose(note)
  local start = self.rotate and self.cursor + 1 or 1; for offset = 0, self.count - 1 do local i = (start + offset - 1) % self.count + 1; if not self.active[i] then return i end end
  if self.steal == "none" then return nil end
  local best = 1; for i = 2, self.count do local choose = self.steal == "oldest" and self.ages[i] < self.ages[best] or self.steal == "newest" and self.ages[i] > self.ages[best] or self.steal == "lowest" and self.notes[i] < self.notes[best] or self.steal == "highest" and self.notes[i] > self.notes[best] or self.steal == "quietest" and self.vels[i] < self.vels[best]; if choose then best = i end end return best
end
function Voices:on(note, velocity) local voice = self:_choose(note); if not voice then return nil end; local stolen = self.active[voice] and self.notes[voice] or nil; self.serial = self.serial + 1; self.notes[voice], self.vels[voice], self.active[voice], self.ages[voice], self.cursor = note, velocity, true, self.serial, voice; return voice, stolen end
function Voices:off(note) for i = 1, self.count do if self.active[i] and self.notes[i] == note then self.active[i] = false; return i end end return nil end
function Voices:panic() for i = 1, self.count do self.active[i] = false end return self end
function Voices:voice(i) return self.notes[i], self.vels[i], self.active[i], self.ages[i] end
function Voices:forEach(fn) for i = 1, self.count do fn(i, self.notes[i], self.vels[i], self.active[i], self.ages[i]) end end

local Mpe = {}; Mpe.__index = Mpe
function M.mpe(opts) opts = opts or {}; if not opts.voices then error("mpe requires a voice allocator", 2) end; return setmetatable({ voices = opts.voices, masterChannel = opts.masterChannel or 1, memberLow = opts.memberLow or 2, memberHigh = opts.memberHigh or 16, bendRange = opts.bendRange or 48, channels = {}, bends = {}, pressures = {}, timbres = {} }, Mpe) end
function Mpe:message(b0, b1, b2)
  local kind, ch, d1, d2 = M.parse(b0, b1, b2); if ch < self.memberLow or ch > self.memberHigh then return nil end
  if M.isNoteOn(kind, d2) then local voice = self.voices:on(d1, d2); if voice then self.channels[voice], self.bends[voice], self.pressures[voice], self.timbres[voice] = ch, 0, d2 / 127, 0 end return voice
  elseif kind == M.NOTE_OFF or (kind == M.NOTE_ON and d2 == 0) then return self.voices:off(d1)
  elseif kind == M.BEND then local value = d1 | (d2 << 7); for i = 1, self.voices.count do if self.channels[i] == ch then self.bends[i] = (value - 8192) / 8192 * self.bendRange; return i end end
  elseif kind == M.CHAN_AT then for i = 1, self.voices.count do if self.channels[i] == ch then self.pressures[i] = d1 / 127; return i end end
  elseif kind == M.CC and d1 == 74 then for i = 1, self.voices.count do if self.channels[i] == ch then self.timbres[i] = d2 / 127; return i end end end
  return nil
end
function Mpe:pitch(i) return volts.fromMidi(self.voices.notes[i] + (self.bends[i] or 0)) end
function Mpe:pressure(i) return self.pressures[i] or 0 end
function Mpe:timbre(i) return self.timbres[i] or 0 end

return M
