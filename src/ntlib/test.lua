local M = { sig = {} }
local Harness = {}; Harness.__index = Harness
function M.harness(opts)
  opts = opts or {}; local script = opts.script
  if type(script) == "string" then if type(ntlibTestLoad) ~= "function" then error("path loading requires the simulator ntlibTestLoad adapter", 2) end script = ntlibTestLoad(script) end
  if type(script) ~= "table" then error("harness script must be a table or simulator path", 2) end
  local self = setmetatable({ script = script, stepRate = opts.stepRate or 1000, dt = 1 / (opts.stepRate or 1000), time = 0, inputs = {}, outputValues = {}, drives = {}, recordings = {}, parameters = {} }, Harness)
  script.parameters = self.parameters; local metadata = script.init and script.init(script) or {}; self.metadata = metadata
  for i = 1, #(metadata.parameters or {}) do local d = metadata.parameters[i]; self.parameters[i] = type(d[2]) == "table" and d[3] or d[4] / (d[6] or 1) end
  return self
end
function Harness:setInput(index, value) self.inputs[index] = value; return self end
function Harness:pulse(index, width) self.inputs[index] = 10; self.pulses = self.pulses or {}; self.pulses[index] = width or self.dt; return self end
function Harness:setParam(name, value) for i = 1, #(self.metadata.parameters or {}) do if self.metadata.parameters[i][1] == name then self.parameters[i] = value; return self end end error("unknown parameter: " .. tostring(name), 2) end
function Harness:drive(index, fn) self.drives[index] = fn; return self end
function Harness:step()
  for index, fn in pairs(self.drives) do self.inputs[index] = fn(self.time) end
  self.inputHigh = self.inputHigh or {}
  for index = 1, #(self.metadata.inputs or {}) do
    local high, before = (self.inputs[index] or 0) >= 1, self.inputHigh[index] == true
    local kind = self.metadata.inputs[index]
    if kind == kTrigger and high and not before and self.script.trigger then self.script.trigger(self.script, index)
    elseif kind == kGate and high ~= before and self.script.gate then self.script.gate(self.script, index, high) end
    self.inputHigh[index] = high
  end
  local out = self.script.step and self.script.step(self.script, self.dt, self.inputs)
  if out then for i, value in pairs(out) do self.outputValues[i] = value end end
  if self.pulses then for index, remaining in pairs(self.pulses) do remaining = remaining - self.dt; if remaining <= 0 then self.inputs[index], self.pulses[index] = 0, nil else self.pulses[index] = remaining end end end
  self.time = self.time + self.dt
  for _, recording in pairs(self.recordings) do recording:_push(self.time, self.outputValues[recording.index] or 0) end
  return self
end
function Harness:run(seconds) for _ = 1, math.floor(seconds * self.stepRate + 0.5) do self:step() end return self end
function Harness:output(index) return self.outputValues[index] or 0 end
function Harness:outputs() return self.outputValues end
local Recording = {}; Recording.__index = Recording
function Harness:record(index) local recording = setmetatable({ index = index, samples = {}, changes = {} }, Recording); self.recordings[#self.recordings + 1] = recording; return recording end
function Recording:_push(time, value) local previous = self.samples[#self.samples]; self.times = self.times or {}; self.samples[#self.samples + 1], self.times[#self.times + 1] = value, time; if previous == nil or previous ~= value then self.changes[#self.changes + 1] = { t = time, v = value } end end
function Recording:events() return self.changes end
function Recording:edges(threshold) local out, high = {}, false; for i = 1, #self.samples do local now = self.samples[i] >= threshold; if now and not high then out[#out + 1] = self.times[i] end; high = now end return out end
function Recording:intervals(threshold) local edges, out = self:edges(threshold), {}; for i = 2, #edges do out[#out + 1] = edges[i] - edges[i - 1] end return out end
function Recording:min() local v = math.huge; for i = 1, #self.samples do v = math.min(v, self.samples[i]) end return v end
function Recording:max() local v = -math.huge; for i = 1, #self.samples do v = math.max(v, self.samples[i]) end return v end
function Recording:mean() local total = 0; for i = 1, #self.samples do total = total + self.samples[i] end return #self.samples == 0 and 0 or total / #self.samples end
function Harness:frame() if type(ntlibTestFrame) ~= "function" then error("frame capture requires the simulator ntlibTestFrame adapter", 2) end return ntlibTestFrame(self.script) end
function M.sig.clock(bpm, voltage, width) local period, high = 60 / bpm, width or 0.01; return function(time) return time % period < high and (voltage or 10) or 0 end end
function M.sig.ramp(lo, hi, seconds) return function(time) local phase = math.min(1, math.max(0, time / seconds)); return lo + (hi - lo) * phase end end
function M.sig.sine(freq, amplitude, offset) return function(time) return (offset or 0) + (amplitude or 1) * math.sin(2 * math.pi * freq * time) end end
function M.sig.steps(values, duration) return function(time) return values[math.floor(time / duration) % #values + 1] end end
function M.sig.fromCsv(path) if type(ntlibTestCsv) ~= "function" then error("CSV signals require the simulator ntlibTestCsv adapter", 2) end return ntlibTestCsv(path) end

local Suite = {}; Suite.__index = Suite
function M.suite(name, fn) local suite = setmetatable({ name = name, cases = {} }, Suite); M._suites = M._suites or {}; M._suites[#M._suites + 1] = suite; fn(suite); return suite end
function Suite:case(name, fn) self.cases[#self.cases + 1] = { name = name, fn = fn }; return self end
function Suite:equal(actual, expected, message) if actual ~= expected then error(message or ("expected " .. tostring(expected) .. ", got " .. tostring(actual)), 2) end end
function Suite:near(actual, expected, epsilon, message) if math.abs(actual - expected) > (epsilon or 1e-9) then error(message or ("expected " .. tostring(actual) .. " near " .. tostring(expected)), 2) end end
function Suite:truthy(value, message) if not value then error(message or "expected truthy value", 2) end end
function Suite:falsy(value, message) if value then error(message or "expected falsy value", 2) end end
function Suite:throws(fn, message) if pcall(fn) then error(message or "expected function to throw", 2) end end
function Suite:noAlloc(fn) collectgarbage("collect"); local before = collectgarbage("count"); fn(); collectgarbage("collect"); local after = collectgarbage("count"); if after > before + 0.001 then error("function allocated memory", 2) end end
function M.run() local passes, failures, index = 0, 0, 0; for _, suite in ipairs(M._suites or {}) do for _, case in ipairs(suite.cases) do index = index + 1; local ok, err = pcall(case.fn); if ok then passes = passes + 1; print("ok " .. index .. " - " .. suite.name .. ": " .. case.name) else failures = failures + 1; print("not ok " .. index .. " - " .. suite.name .. ": " .. case.name .. " - " .. tostring(err)) end end end; print("1.." .. index); return passes, failures end
function M.matchGolden(frame, name) if type(ntlibTestGolden) ~= "function" then error("golden matching requires the simulator ntlibTestGolden adapter", 2) end return ntlibTestGolden(frame, name) end

return M
