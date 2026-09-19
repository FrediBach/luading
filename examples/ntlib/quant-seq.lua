-- Quantised clock sequencer using ntlib.
-- Requires ntlib 1.0.
local nt = require "ntlib"
nt.require("1.0")
local param, clock, gate, quant = nt.param, nt.clock, nt.gate, nt.quant
local seq, rand, draw = nt.seq, nt.rand, nt.draw
local P = param.builder()
P:int("Steps", 1, 16, 8):enum("Scale", quant.SCALE_NAMES, 2):int("Root", 0, 11, 0):ms("Gate", 1, 500, 20)
local rng, clk, pulse, q, play, track
local outputs = { 0, 0 }
return {
  name = "ntlib Quant Seq", author = "Luading",
  init = function(self)
    rng, clk, pulse = rand.new(0x5eed), clock.new{}, gate.new{}
    q, play, track = quant.new{ scale = quant.SCALES.major }, seq.new{ length = 8 }, seq.track{ length = 16 }
    for i = 1, 16 do track:set(i, rng:int(-7, 7)) end
    return { inputs = { kTrigger }, outputs = { kStepped, kLinear }, parameters = P:build() }
  end,
  trigger = function(self, input) if input == 1 then clk:pulse(); play:advance(); pulse:trigger(P:read(self).gate) end end,
  step = function(self, dt)
    local p = P:read(self); if P:changed(self, "steps") then play:setLength(p.steps) end; if P:changed(self, "scale") then q:setScale(quant.SCALE_LIST[p.scale]) end; if P:changed(self, "root") then q:setRoot(p.root) end
    clk:process(dt); outputs[1] = q:degreeToVolts(track:get(play.index), 0); outputs[2] = pulse:process(dt); return outputs
  end,
  draw = function(self) local p = P:read(self); draw.steps(2, 14, 252, 12, nil, play.index, { count = p.steps, values = track }); draw.label(2, 40, quant.SCALE_NAMES[p.scale]); return true end,
}
