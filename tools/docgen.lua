-- Extract the hand-maintained LuaLS definition surface as Markdown headings.
-- Usage: lua tools/docgen.lua [types/ntlib.def.lua]
local path = arg[1] or "types/ntlib.def.lua"
local file = assert(io.open(path, "rb"))
local pending = {}
print("# ntlib API reference\n")
for line in file:lines() do
  local documentation = line:match("^%-%-%-(.*)$")
  if documentation and not documentation:match("^@") then pending[#pending + 1] = documentation:gsub("^%s+", "") end
  local name = line:match("^function%s+([%w%._:]+)%s*%(")
  if name then print("## `" .. name .. "`\n"); if #pending > 0 then print(table.concat(pending, " ") .. "\n") end; pending = {} elseif not line:match("^%-%-%-") then pending = {} end
end
file:close()
