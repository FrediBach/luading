export const DEFAULT_DISTING_SCRIPT = `-- Vector LFO
-- A Disting-style Lua algorithm for exercising the browser simulator.

local phase = 0.0
local flash = 0
local out = {}

return {
  name = "Vector LFO",
  author = "Luading",

  init = function(self)
    return {
      inputs = { kCV, kTrigger },
      inputNames = { "Rate CV", "Reset" },
      outputs = { kStepped, kLinear },
      outputNames = { "Square", "Triangle" },
      parameters = {
        { "Base rate", 5, 500, 100, kHz, kBy100 },
        { "Depth", 0, 100, 100, kPercent },
      },
    }
  end,

  trigger = function(self, input)
    if input == 2 then
      phase = 0.0
      flash = 8
    end
  end,

  step = function(self, dt, inputs)
    local rate = self.parameters[1] + inputs[1]
    phase = phase + dt * math.max(0.01, rate)
    phase = phase - math.floor(phase)

    local depth = self.parameters[2] / 100.0
    out[1] = (phase < 0.5 and 5.0 or -5.0) * depth
    out[2] = (20.0 * math.min(phase, 1.0 - phase) - 5.0) * depth
    return out
  end,

  draw = function(self)
    drawText(8, 12, self.name, 15)
    drawTinyText(248, 11, string.format("%.2f Hz", self.parameters[1]), 10, "right")
    drawLine(8, 52, 248, 52, 3)

    local x = 8 + phase * 240
    drawLine(x, 20, x, 55, 15)
    drawSmoothCircle(x, 36, flash > 0 and 5 or 3, 15)
    drawTinyText(8, 62, "OUT  SQ", 8)
    drawTinyText(248, 62, "TRI  OUT", 8, "right")

    if flash > 0 then flash = flash - 1 end
    return true -- suppress the firmware's standard parameter line
  end,
}`
