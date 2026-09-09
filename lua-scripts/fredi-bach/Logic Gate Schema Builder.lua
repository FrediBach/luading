-- Logic Gate Schema Builder
-- Patch an 8x4 logic grid with live high-signal backgrounds and saved layouts.

-- Encoder 1: column; Encoder 2: row (both wrap).
-- Pot 3 press: previous tile; Encoder 2 press: next tile.
-- Tiles cycle: empty, I1-I4, W, N, W+N, NOT, AND, OR, XOR, NAND, NOR, O1-O4.
-- Every occupied tile broadcasts its result east AND south. W reads west,
-- N reads north, W+N merges with OR, NOT inverts west, binary gates read W/N.
-- Outputs read west and also forward that signal. Duplicate output tiles OR
-- together; an output without a tile is low. Grid edges/empty tiles are low.
-- This directed, acyclic patch evaluates fully each 1 ms step, with no extra
-- delay per tile or feedback. Gate inputs use the firmware's gate callbacks.
-- Bright background = high; the cursor is an outline, independent of signal.
-- Demo: O1=I1, O2=I1 AND I2, O3=I3 XOR I4, O4=NOT I4.
-- Save state stores the layout/cursor, never stale live input levels.
-- Generator comments below are Luading-only conveniences.

local COLS, ROWS = 8, 4
local labels = { ".", "I1", "I2", "I3", "I4", "W", "N", "W+N",
    "NOT", "AND", "OR", "XOR", "NAND", "NOR", "O1", "O2", "O3", "O4" }
local demo = {
    2, 6, 6, 15, 1, 1, 1, 1,
    3, 6, 10, 16, 1, 1, 1, 1,
    4, 6, 6, 6, 1, 1, 1, 1,
    5, 6, 12, 17, 5, 9, 6, 18,
}
local cells, levels = {}, {}
local gates = { false, false, false, false }
local outputs = { 0, 0, 0, 0 }
local column, row = 1, 1

-- Wasmoon restores JSON objects as indexable userdata; hardware uses tables.
local function isIndexable(value)
    return type(value) == "table" or type(value) == "userdata"
end

local function validInteger(value, low, high, fallback)
    if type(value) == "number" and value == math.floor(value)
        and value >= low and value <= high then return value end
    return fallback
end

local function evaluate()
    for port = 1, 4 do outputs[port] = 0 end
    for y = 1, ROWS do
        for x = 1, COLS do
            local index = (y - 1) * COLS + x
            local tile = cells[index]
            local west = x > 1 and levels[index - 1] or false
            local north = y > 1 and levels[index - COLS] or false
            local high = false
            if tile >= 2 and tile <= 5 then high = gates[tile - 1]
            elseif tile == 6 then high = west
            elseif tile == 7 then high = north
            elseif tile == 8 then high = west or north
            elseif tile == 9 then high = not west
            elseif tile == 10 then high = west and north
            elseif tile == 11 then high = west or north
            elseif tile == 12 then high = west ~= north
            elseif tile == 13 then high = not (west and north)
            elseif tile == 14 then high = not (west or north)
            elseif tile >= 15 then
                high = west
                if high then outputs[tile - 14] = 5 end
            end
            levels[index] = high
        end
    end
    return outputs
end

local function cycle(delta)
    local index = (row - 1) * COLS + column
    cells[index] = (cells[index] - 1 + delta) % #labels + 1
    -- Live levels and physical outputs refresh together on the next step.
end

return {
    name = "Logic Gate Schema Builder",
    author = "Luading",

    init = function(self)
        local saved = isIndexable(self.state) and self.state or {}
        local restore = saved.version == 1 and isIndexable(saved.cells)
        for index = 1, COLS * ROWS do
            cells[index] = restore and validInteger(saved.cells[index], 1, #labels, 1)
                or demo[index]
            levels[index] = false
        end
        column = validInteger(saved.column, 1, COLS, 1)
        row = validInteger(saved.row, 1, ROWS, 1)
        gates = { false, false, false, false }
        evaluate()
        return {
            inputs = {
                kGate, -- Type: Gate, Synced: true, Division: 1/4
                kGate, -- Type: Gate, Synced: true, Division: 1/8
                kGate, -- Type: Gate, Synced: true, Division: 1/2
                kGate, -- Type: Gate, Synced: true, Division: 1/16
            },
            inputNames = { "In 1", "In 2", "In 3", "In 4" },
            outputs = {
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
                kStepped, -- Type: Off
            },
            outputNames = { "Out 1", "Out 2", "Out 3", "Out 4" },
        }
    end,

    gate = function(self, input, rising)
        gates[input] = rising
        -- Batch simultaneous input edges before the combinational evaluation.
    end,

    step = function(self, dt, inputs)
        return evaluate()
    end,

    ui = function(self) return true end,
    encoder1Turn = function(self, delta) column = (column - 1 + delta) % COLS + 1 end,
    encoder2Turn = function(self, delta) row = (row - 1 + delta) % ROWS + 1 end,
    pot3Push = function(self) cycle(-1) end,
    encoder2Push = function(self) cycle(1) end,

    draw = function(self)
        drawTinyText(2, 6, "LOGIC GRID", 15)
        local selected = (row - 1) * COLS + column
        drawTinyText(254, 6, column .. "," .. row .. " " .. labels[cells[selected]]
            .. (levels[selected] and " HIGH" or " LOW"), 15, "right")
        for y = 1, ROWS do
            for x = 1, COLS do
                local index = (y - 1) * COLS + x
                local left, top = 2 + (x - 1) * 32, 10 + (y - 1) * 11
                local high = levels[index]
                drawRectangle(left + 1, top + 1, left + 28, top + 8, high and 15 or 1)
                drawTinyText(left + 15, top + 7, labels[cells[index]],
                    high and 0 or 9, "centre")
                if index == selected then drawBox(left, top, left + 29, top + 9, 15) end
            end
        end
        drawTinyText(2, 62, "E1:X E2:Y  P3:PREV E2P:NEXT", 9)
        return true
    end,

    serialise = function(self)
        local copy = {}
        for index = 1, COLS * ROWS do copy[index] = cells[index] end
        return { version = 1, cells = copy, column = column, row = row }
    end,
}
