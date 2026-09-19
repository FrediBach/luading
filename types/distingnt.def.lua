---@meta

kCV, kGate, kTrigger = 0, 1, 2
kStepped, kLinear = 0, 1
kNone, kDb, kPercent, kHz, kSemitones, kCents, kMs, kSeconds, kFrames = 0, 1, 2, 3, 4, 5, 6, 7, 8
kMIDINote, kMillivolts, kVolts, kBPM, kDb_minInf = 9, 10, 11, 12, 13
kBy10, kBy100, kBy1000 = 10, 100, 1000

---@param x1 number
---@param y1 number
---@param x2 number
---@param y2 number
---@param colour? number
function drawBox(x1, y1, x2, y2, colour) end
function drawSmoothBox(x1, y1, x2, y2, colour) end
function drawRectangle(x1, y1, x2, y2, colour) end
function drawLine(x1, y1, x2, y2, colour) end
function drawSmoothLine(x1, y1, x2, y2, colour) end
function drawCircle(x, y, radius, colour) end
function drawSmoothCircle(x, y, radius, colour) end
function drawText(x, y, text, colour, alignment) end
function drawTinyText(x, y, text, colour, alignment) end
function drawStandardParameterLine() end
function sendMIDI(destinations, ...) end
function setParameter(algorithm, parameter, value) end
function getParameter(algorithm, parameter) end
