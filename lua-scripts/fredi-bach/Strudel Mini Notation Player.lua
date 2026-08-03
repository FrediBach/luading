-- Strudel Mini Notation Player
-- A hardcoded, deterministic Strudel mini-notation stress player for Disting NT.

-- The parser and scheduler are deliberately self-contained so this file can be
-- copied to Disting NT hardware without a browser helper or companion module.
-- One Strudel cycle is treated as a four-beat bar.

local MINI_NOTATION = [==[
<
  [c4 [d4 e4]*2 ~ [f4 -]/2.5]
  [[g3,b3,e4]@2 [a3,c4,e4]!2]
  [[c4?0.25 [d4|eb4]] e4(3,8,1)]
  [{c3 e3 g3, c2 g2}%6]
  [60 .. 63 . [g4 a4] . b4 _ 72:0.8]
>*2.75
]==]

local MAX_NODES = 512
local MAX_DEPTH = 16
local MAX_EXPANSION = 128
local MAX_EVENTS_PER_CYCLE = 512
local VOICE_COUNT = 4
local CYCLE_PULSE = 0.01
local EPSILON = 0.000000001

local parser = nil
local root = nil
local parse_error = nil
local node_count = 0

local playhead = 0
local rendered_through = -1
local event_queue = {}
local queue_head = 1
local dropped_events = 0
local last_cycle = -1
local cycle_gate_off = 0
local last_value = "-"
local last_midi = nil
local last_event_cycle = 0
local event_count = 0

local voices = {}
local output = {}

local function clamp(value, minimum, maximum)
    return math.max(minimum, math.min(maximum, value))
end

local function gcd(a, b)
    a = math.abs(math.floor(a))
    b = math.abs(math.floor(b))
    while b ~= 0 do
        a, b = b, a % b
    end
    return a
end

local function lcm(a, b)
    if a == 0 or b == 0 then return 0 end
    return math.floor(math.abs(a * b) / gcd(a, b))
end

local function new_node(kind, fields)
    node_count = node_count + 1
    if node_count > MAX_NODES then
        error("mini notation exceeds " .. MAX_NODES .. " syntax nodes", 0)
    end
    fields = fields or {}
    fields.kind = kind
    fields.id = node_count
    fields.weight = fields.weight or 1
    fields.repeat_count = fields.repeat_count or 1
    return fields
end

local function sequence_node(items)
    if #items == 0 then return new_node("rest") end
    if #items == 1 then return items[1] end
    return new_node("sequence", { children = items })
end

local function slowcat_node(items)
    if #items == 0 then return new_node("rest") end
    if #items == 1 then return items[1] end
    return new_node("slowcat", { children = items })
end

local function stack_node(items)
    if #items == 0 then return new_node("rest") end
    if #items == 1 then return items[1] end
    return new_node("stack", { children = items })
end

local function parser_error(state, message)
    error(string.format("mini notation column %d: %s", state.position, message), 0)
end

local function peek(state, offset)
    offset = offset or 0
    return state.source:sub(state.position + offset, state.position + offset)
end

local function skip_space(state)
    while state.position <= state.length
        and state.source:sub(state.position, state.position):match("%s") do
        state.position = state.position + 1
    end
end

local function is_stop(state, stops)
    local character = peek(state)
    return character == "" or stops[character] == true
end

local function parse_number(state, label, integer_only)
    skip_space(state)
    local start = state.position
    local character = peek(state)
    if character == "+" or character == "-" then
        state.position = state.position + 1
    end
    local digits = 0
    while peek(state):match("%d") do
        digits = digits + 1
        state.position = state.position + 1
    end
    if not integer_only and peek(state) == "." and peek(state, 1) ~= "." then
        state.position = state.position + 1
        while peek(state):match("%d") do
            digits = digits + 1
            state.position = state.position + 1
        end
    end
    if digits == 0 then parser_error(state, "expected " .. label) end
    local value = tonumber(state.source:sub(start, state.position - 1))
    if not value then parser_error(state, "invalid " .. label) end
    return value
end

local function parse_token(state)
    local start = state.position
    while state.position <= state.length do
        local character = peek(state)
        if character:match("%s")
            or character == "[" or character == "]"
            or character == "<" or character == ">"
            or character == "{" or character == "}"
            or character == "," or character == "|"
            or character == "(" or character == ")"
            or character == "*" or character == "/"
            or character == "@" or character == "!"
            or character == "?" or character == "%"
            or character == "_" then
            break
        end
        if character == "." then
            local previous = state.source:sub(state.position - 1, state.position - 1)
            local following = peek(state, 1)
            if following == "." or not (previous:match("%d") and following:match("%d")) then
                break
            end
        end
        if character == "-" and state.position == start and not peek(state, 1):match("%d") then
            break
        end
        state.position = state.position + 1
    end
    if state.position == start then
        parser_error(state, "expected an event")
    end
    return state.source:sub(start, state.position - 1)
end

local parse_pattern

local function parse_euclidean(state, child)
    state.position = state.position + 1
    local beats = parse_number(state, "Euclidean beat count", true)
    skip_space(state)
    if peek(state) ~= "," then parser_error(state, "expected ',' after Euclidean beats") end
    state.position = state.position + 1
    local segments = parse_number(state, "Euclidean segment count", true)
    local offset = 0
    skip_space(state)
    if peek(state) == "," then
        state.position = state.position + 1
        offset = parse_number(state, "Euclidean offset", true)
    end
    skip_space(state)
    if peek(state) ~= ")" then parser_error(state, "expected ')' after Euclidean rhythm") end
    state.position = state.position + 1
    if beats < 0 or segments < 1 or beats > segments or segments > MAX_EXPANSION then
        parser_error(state, "Euclidean rhythm must satisfy 0 <= beats <= segments <= " .. MAX_EXPANSION)
    end
    return new_node("euclidean", {
        child = child,
        beats = beats,
        segments = segments,
        offset = offset,
    })
end

local function parse_postfix(state, node)
    while true do
        skip_space(state)
        local character = peek(state)
        if character == "*" or character == "/" then
            state.position = state.position + 1
            local factor = parse_number(state, "positive speed factor", false)
            if factor <= 0 then parser_error(state, "speed factor must be positive") end
            node = new_node(character == "*" and "fast" or "slow", {
                child = node,
                factor = factor,
            })
        elseif character == "@" then
            state.position = state.position + 1
            local adjacent = peek(state)
            if adjacent:match("[%d+%-]") then
                local amount = parse_number(state, "positive weight", false)
                if amount <= 0 then parser_error(state, "weight must be positive") end
                node.weight = node.weight + amount - 1
            else
                node.weight = node.weight + 1
            end
        elseif character == "_" then
            state.position = state.position + 1
            node.weight = node.weight + 1
        elseif character == "!" then
            state.position = state.position + 1
            local adjacent = peek(state)
            local count = 2
            if adjacent:match("[%d+%-]") then
                count = parse_number(state, "replication count", true)
            end
            if count < 1 or count > MAX_EXPANSION then
                parser_error(state, "replication count must be between 1 and " .. MAX_EXPANSION)
            end
            node.repeat_count = node.repeat_count * count
        elseif character == "?" then
            state.position = state.position + 1
            local probability = 0.5
            local adjacent = peek(state)
            if adjacent:match("[%d+%-]") then
                probability = parse_number(state, "degradation probability", false)
            end
            if probability < 0 or probability > 1 then
                parser_error(state, "degradation probability must be between 0 and 1")
            end
            node = new_node("degrade", { child = node, probability = probability })
        elseif character == "(" then
            node = parse_euclidean(state, node)
        elseif character == "%" then
            state.position = state.position + 1
            local steps = parse_number(state, "polymeter step count", true)
            if node.kind ~= "polymeter" then
                parser_error(state, "'%' is only valid after a polymeter")
            end
            if steps < 1 or steps > MAX_EXPANSION then
                parser_error(state, "polymeter step count must be between 1 and " .. MAX_EXPANSION)
            end
            node.steps = steps
        else
            return node
        end
    end
end

local function parse_atom(state, depth)
    if depth > MAX_DEPTH then parser_error(state, "nesting exceeds " .. MAX_DEPTH) end
    skip_space(state)
    local character = peek(state)
    local node
    if character == "[" then
        state.position = state.position + 1
        node = parse_pattern(state, { ["]"] = true }, depth + 1, "sequence")
        skip_space(state)
        if peek(state) ~= "]" then parser_error(state, "expected ']'") end
        state.position = state.position + 1
    elseif character == "<" then
        state.position = state.position + 1
        node = parse_pattern(state, { [">"] = true }, depth + 1, "slowcat")
        skip_space(state)
        if peek(state) ~= ">" then parser_error(state, "expected '>'") end
        state.position = state.position + 1
    elseif character == "{" then
        state.position = state.position + 1
        node = parse_pattern(state, { ["}"] = true }, depth + 1, "polymeter")
        skip_space(state)
        if peek(state) ~= "}" then parser_error(state, "expected '}'") end
        state.position = state.position + 1
    elseif character == "~" or (character == "-" and not peek(state, 1):match("%d")) then
        state.position = state.position + 1
        node = new_node("rest")
    else
        node = new_node("event", { value = parse_token(state) })
    end
    return parse_postfix(state, node)
end

local function append_repetitions(destination, node)
    local count = node.repeat_count or 1
    node.repeat_count = 1
    for _ = 1, count do
        if #destination >= MAX_EXPANSION then
            error("mini notation sequence expansion exceeds " .. MAX_EXPANSION .. " items", 0)
        end
        destination[#destination + 1] = node
    end
end

local function parse_sequence(state, stops, depth)
    local feet = { {} }
    while true do
        skip_space(state)
        local character = peek(state)
        if is_stop(state, stops) or character == "," or character == "|" then break end
        if character == "." and peek(state, 1) ~= "." then
            if #feet[#feet] == 0 then parser_error(state, "empty foot") end
            state.position = state.position + 1
            feet[#feet + 1] = {}
        else
            local node = parse_atom(state, depth)
            skip_space(state)
            if node.kind == "event" and tonumber(node.value) and peek(state) == "." and peek(state, 1) == "." then
                state.position = state.position + 2
                local finish = parse_number(state, "numeric range endpoint", false)
                local first = tonumber(node.value)
                local direction = finish >= first and 1 or -1
                local count = math.floor(math.abs(finish - first) + EPSILON) + 1
                if count > MAX_EXPANSION or math.abs(finish - first - direction * (count - 1)) > EPSILON then
                    parser_error(state, "numeric ranges need integral steps and at most " .. MAX_EXPANSION .. " values")
                end
                node.repeat_count = 1
                for index = 0, count - 1 do
                    append_repetitions(feet[#feet], new_node("event", {
                        value = tostring(first + index * direction),
                        weight = node.weight,
                    }))
                end
            else
                append_repetitions(feet[#feet], node)
            end
        end
    end
    if #feet[#feet] == 0 then parser_error(state, "empty foot") end
    if #feet == 1 then return sequence_node(feet[1]), #feet[1] end
    local grouped = {}
    for _, foot in ipairs(feet) do grouped[#grouped + 1] = sequence_node(foot) end
    return sequence_node(grouped), #grouped
end

local function parse_choice(state, stops, depth)
    local choices = {}
    local first, count = parse_sequence(state, stops, depth)
    choices[1] = first
    local maximum_count = count
    skip_space(state)
    while peek(state) == "|" do
        state.position = state.position + 1
        local choice, choice_count = parse_sequence(state, stops, depth)
        choices[#choices + 1] = choice
        maximum_count = math.max(maximum_count, choice_count)
        skip_space(state)
    end
    if #choices == 1 then return first, maximum_count end
    return new_node("choice", { children = choices }), maximum_count
end

local function make_polymeter(lanes, lane_counts)
    local common = 1
    for _, count in ipairs(lane_counts) do
        common = lcm(common, count)
        if common > MAX_EXPANSION then common = MAX_EXPANSION break end
    end
    local lane_slowcats = {}
    for index, lane in ipairs(lanes) do
        local items = lane.kind == "sequence" and lane.children or { lane }
        lane_slowcats[index] = slowcat_node(items)
    end
    return new_node("polymeter", {
        children = lane_slowcats,
        lane_counts = lane_counts,
        steps = common,
    })
end

parse_pattern = function(state, stops, depth, alignment)
    local lanes = {}
    local lane_counts = {}
    local lane, count = parse_choice(state, stops, depth)
    lanes[1], lane_counts[1] = lane, count
    skip_space(state)
    while peek(state) == "," do
        state.position = state.position + 1
        local next_lane, next_count = parse_choice(state, stops, depth)
        lanes[#lanes + 1], lane_counts[#lane_counts + 1] = next_lane, next_count
        skip_space(state)
    end
    if alignment == "polymeter" then return make_polymeter(lanes, lane_counts) end
    if alignment == "slowcat" then
        local aligned = {}
        for index, item in ipairs(lanes) do
            aligned[index] = slowcat_node(item.kind == "sequence" and item.children or { item })
        end
        return stack_node(aligned)
    end
    return stack_node(lanes)
end

local function parse_mini(source)
    node_count = 0
    local state = { source = source, position = 1, length = #source }
    local result = parse_pattern(state, {}, 1, "sequence")
    skip_space(state)
    if state.position <= state.length then parser_error(state, "unexpected '" .. peek(state) .. "'") end
    return result
end

local function random_unit(cycle, identity, salt)
    local value = (math.floor(cycle) * 1103515245 + identity * 12345 + salt * 2654435761) % 2147483647
    value = (value * 48271 + 1) % 2147483647
    return value / 2147483647
end

local function add_event(events, value, start_time, stop_time)
    if stop_time <= start_time + EPSILON then return end
    if #events >= MAX_EVENTS_PER_CYCLE then
        dropped_events = dropped_events + 1
        return
    end
    events[#events + 1] = { value = value, start_time = start_time, stop_time = stop_time }
end

local query_node

local function map_events(source, destination, source_cycle, target_start, target_duration, target_stop)
    for _, event in ipairs(source) do
        local mapped_start = target_start + (event.start_time - source_cycle) * target_duration
        local mapped_stop = target_start + (event.stop_time - source_cycle) * target_duration
        add_event(destination, event.value, mapped_start, math.min(mapped_stop, target_stop))
    end
end

local function query_squeezed(child, cycle, slot_start, slot_duration, query_begin, query_end, events, seed)
    local overlap_begin = math.max(query_begin, slot_start)
    local overlap_end = math.min(query_end, slot_start + slot_duration)
    if overlap_begin >= overlap_end - EPSILON then return end
    local child_begin = cycle + (overlap_begin - slot_start) / slot_duration
    local child_end = cycle + (overlap_end - slot_start) / slot_duration
    local child_events = {}
    query_node(child, child_begin, child_end, child_events, seed)
    map_events(child_events, events, cycle, slot_start, slot_duration, slot_start + slot_duration)
end

query_node = function(node, query_begin, query_end, events, seed)
    if query_begin >= query_end - EPSILON or node.kind == "rest" then return end
    if node.kind == "event" then
        local first_cycle = math.floor(query_begin + EPSILON)
        local final_cycle = math.ceil(query_end - EPSILON) - 1
        for cycle = first_cycle, final_cycle do
            if cycle >= query_begin - EPSILON and cycle < query_end - EPSILON then
                add_event(events, node.value, cycle, cycle + 1)
            end
        end
    elseif node.kind == "sequence" then
        local total_weight = 0
        for _, child in ipairs(node.children) do total_weight = total_weight + child.weight end
        local first_cycle = math.floor(query_begin)
        local final_cycle = math.ceil(query_end) - 1
        for cycle = first_cycle, final_cycle do
            local position = 0
            for _, child in ipairs(node.children) do
                local duration = child.weight / total_weight
                query_squeezed(child, cycle, cycle + position, duration, query_begin, query_end, events, seed)
                position = position + duration
            end
        end
    elseif node.kind == "slowcat" then
        local first_cycle = math.floor(query_begin)
        local final_cycle = math.ceil(query_end) - 1
        for cycle = first_cycle, final_cycle do
            local index = (cycle % #node.children) + 1
            query_node(node.children[index], math.max(query_begin, cycle), math.min(query_end, cycle + 1), events, seed)
        end
    elseif node.kind == "stack" then
        for _, child in ipairs(node.children) do query_node(child, query_begin, query_end, events, seed) end
    elseif node.kind == "fast" or node.kind == "slow" then
        local factor = node.kind == "fast" and node.factor or (1 / node.factor)
        local transformed = {}
        query_node(node.child, query_begin * factor, query_end * factor, transformed, seed)
        for _, event in ipairs(transformed) do
            add_event(events, event.value, event.start_time / factor, event.stop_time / factor)
        end
    elseif node.kind == "choice" then
        local first_cycle = math.floor(query_begin)
        local final_cycle = math.ceil(query_end) - 1
        for cycle = first_cycle, final_cycle do
            local index = math.floor(random_unit(cycle, node.id, seed) * #node.children) + 1
            query_node(node.children[index], math.max(query_begin, cycle), math.min(query_end, cycle + 1), events, seed)
        end
    elseif node.kind == "degrade" then
        local candidates = {}
        query_node(node.child, query_begin, query_end, candidates, seed)
        for _, event in ipairs(candidates) do
            local event_key = math.floor(event.start_time * 100000 + 0.5)
            if random_unit(math.floor(event.start_time), node.id + event_key, seed) >= node.probability then
                add_event(events, event.value, event.start_time, event.stop_time)
            end
        end
    elseif node.kind == "euclidean" then
        local first_cycle = math.floor(query_begin)
        local final_cycle = math.ceil(query_end) - 1
        for cycle = first_cycle, final_cycle do
            for segment = 0, node.segments - 1 do
                local rotated = (segment - node.offset) % node.segments
                if (rotated * node.beats) % node.segments < node.beats then
                    local duration = 1 / node.segments
                    query_squeezed(node.child, cycle, cycle + segment * duration, duration,
                        query_begin, query_end, events, seed)
                end
            end
        end
    elseif node.kind == "polymeter" then
        for _, child in ipairs(node.children) do
            local transformed = {}
            query_node(child, query_begin * node.steps, query_end * node.steps, transformed, seed)
            for _, event in ipairs(transformed) do
                add_event(events, event.value, event.start_time / node.steps, event.stop_time / node.steps)
            end
        end
    end
end

local function event_order(left, right)
    if math.abs(left.start_time - right.start_time) > EPSILON then
        return left.start_time < right.start_time
    end
    if math.abs(left.stop_time - right.stop_time) > EPSILON then
        return left.stop_time < right.stop_time
    end
    return left.value < right.value
end

local function render_cycle(cycle, seed)
    local events = {}
    query_node(root, cycle, cycle + 1, events, seed)
    table.sort(events, event_order)
    for _, event in ipairs(events) do event_queue[#event_queue + 1] = event end
    rendered_through = cycle
end

local function reset_playback(seed)
    playhead = 0
    rendered_through = -1
    event_queue = {}
    queue_head = 1
    dropped_events = 0
    last_cycle = -1
    cycle_gate_off = 0
    last_value = "-"
    last_midi = nil
    last_event_cycle = 0
    event_count = 0
    for index = 1, VOICE_COUNT do
        voices[index] = { pitch = 0, gate = 0, gate_off = 0 }
        output[index * 2 - 1] = 0
        output[index * 2] = 0
    end
    output[VOICE_COUNT * 2 + 1] = 0
    render_cycle(0, seed)
    render_cycle(1, seed)
end

local NOTE_OFFSETS = { c = 0, d = 2, e = 4, f = 5, g = 7, a = 9, b = 11 }

local function event_pitch(value)
    local pitch_text, payload = value:match("^([^:]+):?(.*)$")
    local midi = tonumber(pitch_text)
    if not midi then
        local letter, accidental, octave = pitch_text:lower():match("^([a-g])([#sb]*)(-?%d*)$")
        if letter then
            local octave_number = tonumber(octave)
            if octave_number == nil then octave_number = 3 end
            midi = (octave_number + 1) * 12 + NOTE_OFFSETS[letter]
            for index = 1, #accidental do
                local symbol = accidental:sub(index, index)
                midi = midi + ((symbol == "#" or symbol == "s") and 1 or -1)
            end
        end
    end
    if not midi then
        local hash = 0
        for index = 1, #pitch_text do hash = (hash * 33 + pitch_text:byte(index)) % 48 end
        midi = 36 + hash
    end
    local velocity = tonumber(payload) or 1
    return midi, clamp(velocity, 0, 1)
end

local function find_voice()
    for index, voice in ipairs(voices) do
        if voice.gate == 0 then return index end
    end
    local selected = 1
    for index = 2, VOICE_COUNT do
        if voices[index].gate_off < voices[selected].gate_off then selected = index end
    end
    dropped_events = dropped_events + 1
    return selected
end

local function start_event(event, gate_ratio)
    local midi, velocity = event_pitch(event.value)
    local voice_index = find_voice()
    local voice = voices[voice_index]
    voice.pitch = (midi - 60) / 12
    voice.gate = 5 * velocity
    voice.gate_off = event.start_time + (event.stop_time - event.start_time) * gate_ratio
    output[voice_index * 2 - 1] = voice.pitch
    output[voice_index * 2] = voice.gate
    last_value = event.value
    last_midi = midi
    last_event_cycle = event.start_time
    event_count = event_count + 1
end

local function compact_queue()
    if queue_head < 129 then return end
    local compacted = {}
    for index = queue_head, #event_queue do compacted[#compacted + 1] = event_queue[index] end
    event_queue = compacted
    queue_head = 1
end

local function note_name(midi)
    if not midi then return "-" end
    local names = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" }
    local rounded = math.floor(midi + 0.5)
    return names[(rounded % 12) + 1] .. tostring(math.floor(rounded / 12) - 1)
end

local program = {
    name = "Strudel Mini Player",
    author = "Luading",

    -- Luading simulator extension; ignored by Disting NT.
    luading = {
        parameterPresets = {
            {name = "Default", values = {120, 50, 1}},
            {name = "Slow Legato", values = {80, 85, 1}},
            {name = "Fast Tight", values = {180, 25, 7}}
        }
    },

    init = function(self)
        local ok, result = pcall(parse_mini, MINI_NOTATION)
        if not ok then
            parse_error = tostring(result)
            error(parse_error, 0)
        end
        root = result
        parser = true
        reset_playback(1)
        return {
            inputs = {
                kTrigger, -- Type: Trigger, Synced: true, Division: 2 bars
            },
            inputNames = { "Reset" },
            outputs = {
                kStepped, -- Type: Synth Note
                kStepped, -- Type: Synth Trigger
                kStepped, -- Type: Synth Note
                kStepped, -- Type: Synth Trigger
                kStepped, -- Type: Synth Note
                kStepped, -- Type: Synth Trigger
                kStepped, -- Type: Synth Note
                kStepped, -- Type: Synth Trigger
                kStepped, -- Type: Hi-hat Trigger
            },
            outputNames = {
                "Pitch 1", "Gate 1", "Pitch 2", "Gate 2",
                "Pitch 3", "Gate 3", "Pitch 4", "Gate 4", "Cycle",
            },
            parameters = {
                { "Tempo", 30, 300, 120, kBPM },
                { "Gate", 1, 95, 50, kPercent },
                { "Seed", 0, 9999, 1 },
            },
        }
    end,

    trigger = function(self, input)
        if input == 1 then reset_playback(self.parameters[3]) end
        return output
    end,

    step = function(self, dt, inputs)
        if not parser or parse_error then return output end
        local cycles_per_second = self.parameters[1] / 240
        playhead = playhead + dt * cycles_per_second
        local seed = self.parameters[3]
        while rendered_through < math.floor(playhead) + 1 do render_cycle(rendered_through + 1, seed) end

        for voice_index, voice in ipairs(voices) do
            if voice.gate ~= 0 and playhead >= voice.gate_off - EPSILON then
                voice.gate = 0
                output[voice_index * 2] = 0
            end
        end

        local gate_ratio = self.parameters[2] / 100
        while queue_head <= #event_queue and event_queue[queue_head].start_time <= playhead + EPSILON do
            start_event(event_queue[queue_head], gate_ratio)
            queue_head = queue_head + 1
        end
        compact_queue()

        local cycle = math.floor(playhead)
        if cycle ~= last_cycle then
            last_cycle = cycle
            output[VOICE_COUNT * 2 + 1] = 5
            cycle_gate_off = playhead + CYCLE_PULSE * cycles_per_second
        elseif output[VOICE_COUNT * 2 + 1] ~= 0 and playhead >= cycle_gate_off then
            output[VOICE_COUNT * 2 + 1] = 0
        end
        return output
    end,

    draw = function(self)
        drawText(6, 9, "STRUDEL MINI", 15)
        drawTinyText(250, 8, tostring(self.parameters[1]) .. " BPM", 10, "right")
        drawTinyText(6, 20, "< [] {} , | * / @ ! ? ( )", 7)
        drawTinyText(6, 30, "CYCLE " .. string.format("%.3f", playhead), 10)
        drawTinyText(250, 30, "EV " .. tostring(event_count), 10, "right")
        drawText(6, 46, note_name(last_midi), 15)
        drawTinyText(48, 45, last_value:sub(1, 18), 12)
        drawTinyText(250, 45, "DROP " .. tostring(dropped_events), dropped_events > 0 and 15 or 7, "right")
        drawTinyText(6, 58, "hardcoded pattern / seed " .. tostring(self.parameters[3]), 7)
        return true
    end,
}

return program
