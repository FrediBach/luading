-- LUT Logic Router
-- Builds a combinational gate router from a compact, hardcoded truth table.

-- Each non-empty line is one output word. Lines are ordered by the binary
-- input word from all-low to all-high; input 1 is the most-significant bit.
-- Therefore log2(line count) is the input count, and line width is the output
-- count. This example is a 1-to-4 router: In 1 enables the output selected by
-- In 2 and In 3.
local LUT = [==[
0000
0000
0000
0000
1000
0100
0010
0001
]==]

local MAX_PORTS = 28
local HIGH_VOLTAGE = 5.0

local rows = {}
local input_count = 0
local output_count = 0
local input_states = {}
local output_voltages = {}
local current_row = 1
local initial_output_pending = false

local function lut_error(message)
    error("LUT: " .. message, 0)
end

local function parse_lut(source)
    local parsed_rows = {}
    local width = nil
    local line_number = 0

    source = source:gsub("\r\n", "\n"):gsub("\r", "\n")
    for line in (source .. "\n"):gmatch("(.-)\n") do
        line_number = line_number + 1
        line = line:gsub("^%s+", ""):gsub("%s+$", "")
        if line ~= "" then
            if not line:match("^[01]+$") then
                lut_error("line " .. line_number .. " must contain only 0 and 1")
            end
            width = width or #line
            if #line ~= width then
                lut_error("line " .. line_number .. " has width " .. #line
                    .. "; expected " .. width)
            end
            parsed_rows[#parsed_rows + 1] = line
        end
    end

    if #parsed_rows == 0 then lut_error("must contain at least one row") end
    if width > MAX_PORTS then
        lut_error("defines " .. width .. " outputs; maximum is " .. MAX_PORTS)
    end

    local inputs = 0
    local expected_rows = 1
    while expected_rows < #parsed_rows do
        expected_rows = expected_rows * 2
        inputs = inputs + 1
    end
    if expected_rows ~= #parsed_rows then
        lut_error("row count " .. #parsed_rows .. " is not a power of two")
    end
    if inputs > MAX_PORTS then
        lut_error("defines " .. inputs .. " inputs; maximum is " .. MAX_PORTS)
    end

    return parsed_rows, inputs, width
end

local function selected_row()
    local value = 0
    for index = 1, input_count do
        value = value * 2 + (input_states[index] and 1 or 0)
    end
    return value + 1
end

local function apply_row(row_index)
    current_row = row_index
    local word = rows[row_index]
    for index = 1, output_count do
        output_voltages[index] = word:sub(index, index) == "1" and HIGH_VOLTAGE or 0.0
    end
    return output_voltages
end

local function input_word()
    if input_count == 0 then return "-" end
    local bits = {}
    for index = 1, input_count do
        bits[index] = input_states[index] and "1" or "0"
    end
    return table.concat(bits)
end

return {
    name = "LUT Logic Router",
    author = "Luading",

    init = function(self)
        rows, input_count, output_count = parse_lut(LUT)

        local input_types = {}
        local input_names = {}
        input_states = {}
        for index = 1, input_count do
            input_types[index] = kGate
            input_names[index] = "In " .. index
            input_states[index] = false
        end

        local output_types = {}
        local output_names = {}
        output_voltages = {}
        for index = 1, output_count do
            output_types[index] = kStepped
            output_names[index] = "Out " .. index
        end

        apply_row(1)
        initial_output_pending = true

        return {
            inputs = {
                table.unpack(input_types), -- Type: Gate, Synced: true, Division: 1/4
            },
            inputNames = input_names,
            outputs = {
                table.unpack(output_types), -- Type: Off
            },
            outputNames = output_names,
        }
    end,

    gate = function(self, input, rising)
        input_states[input] = rising
        initial_output_pending = false
        return apply_row(selected_row())
    end,

    -- Emit the all-low lookup row once after init. Later changes are handled
    -- by gate(), without polling input voltages in the 1 ms control loop.
    step = function(self, dt, inputs)
        if initial_output_pending then
            initial_output_pending = false
            return output_voltages
        end
        return {}
    end,

    draw = function(self)
        drawText(6, 10, "LUT LOGIC ROUTER", 15)
        drawTinyText(250, 8, input_count .. " IN / " .. output_count .. " OUT", 10, "right")
        drawTinyText(6, 24, "IN  " .. input_word(), 12)
        drawTinyText(6, 36, "OUT " .. rows[current_row], 15)
        drawTinyText(6, 49, "ROW " .. current_row .. " / " .. #rows, 10)
        drawTinyText(6, 60, "I1=MSB  1=5V", 7)
        return true
    end,
}
