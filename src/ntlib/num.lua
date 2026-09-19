local M = { V_MIN = -10.0, V_MAX = 10.0 }
local abs, exp, floor, log, max, min, pi, sin, sqrt =
  math.abs, math.exp, math.floor, math.log, math.max, math.min, math.pi, math.sin, math.sqrt

function M.clamp(x, lo, hi) return min(max(x, lo), hi) end
function M.map(x, inLo, inHi, outLo, outHi)
  if inHi == inLo then return outLo end
  return outLo + (x - inLo) * (outHi - outLo) / (inHi - inLo)
end
function M.mapClamped(x, inLo, inHi, outLo, outHi)
  return M.map(M.clamp(x, min(inLo, inHi), max(inLo, inHi)), inLo, inHi, outLo, outHi)
end
function M.lerp(a, b, t) return a + (b - a) * t end
function M.unlerp(a, b, x) if a == b then return 0 end return (x - a) / (b - a) end
function M.wrap(x, lo, hi)
  local width = hi - lo
  if width == 0 then return lo end
  return lo + (x - lo) % width
end
function M.fold(x, lo, hi)
  local width = hi - lo
  if width <= 0 then return lo end
  local v = (x - lo) % (width * 2)
  if v > width then v = width * 2 - v end
  return lo + v
end
function M.round(x) if x < 0 then return math.ceil(x - 0.5) end return floor(x + 0.5) end
function M.snap(x, step) if step == 0 then return x end return M.round(x / step) * step end
function M.sign(x) if x < 0 then return -1 elseif x > 0 then return 1 end return 0 end
function M.approx(a, b, epsilon) return abs(a - b) <= (epsilon or 1e-9) end
function M.uni2bi(x) return x * 2 - 1 end
function M.bi2uni(x) return (x + 1) * 0.5 end
function M.xfade(a, b, t) return M.lerp(a, b, t) end
function M.xfadeEqualPower(a, b, t)
  t = M.clamp(t, 0, 1)
  return a * math.cos(t * pi * 0.5) + b * sin(t * pi * 0.5)
end
function M.curve(x, k)
  x, k = M.clamp(x, 0, 1), M.clamp(k or 0, -0.999999, 0.999999)
  if abs(k) < 1e-9 then return x end
  if k > 0 then return x ^ (1 + 4 * k) end
  return 1 - (1 - x) ^ (1 - 4 * k)
end
function M.softClip(x, limit)
  limit = abs(limit or 1)
  if limit == 0 then return 0 end
  local n = x / limit
  if n <= -1 then return -limit * 2 / 3 elseif n >= 1 then return limit * 2 / 3 end
  return limit * (n - n * n * n / 3)
end
function M.deadzone(x, width)
  width = M.clamp(abs(width or 0), 0, 0.999999)
  local magnitude = abs(x)
  if magnitude <= width then return 0 end
  return M.sign(x) * (magnitude - width) / (1 - width)
end
function M.pan(x)
  x = M.clamp(x, -1, 1)
  local angle = (x + 1) * pi * 0.25
  return math.cos(angle), sin(angle)
end
function M.db2lin(db) return 10 ^ (db / 20) end
function M.lin2db(x) if x <= 0 then return -120 end return max(-120, 20 * log(x, 10)) end
function M.clampV(v) return M.clamp(v, M.V_MIN, M.V_MAX) end

M.ease = {}
function M.ease.linear(x) return x end
function M.ease.inQuad(x) return x * x end
function M.ease.outQuad(x) return 1 - (1 - x) * (1 - x) end
function M.ease.inOutQuad(x) if x < 0.5 then return 2 * x * x end return 1 - ((-2 * x + 2) ^ 2) * 0.5 end
function M.ease.inCubic(x) return x * x * x end
function M.ease.outCubic(x) return 1 - (1 - x) ^ 3 end
function M.ease.inOutCubic(x) if x < 0.5 then return 4 * x ^ 3 end return 1 - ((-2 * x + 2) ^ 3) * 0.5 end
function M.ease.inSine(x) return 1 - math.cos(x * pi * 0.5) end
function M.ease.outSine(x) return sin(x * pi * 0.5) end
function M.ease.inOutSine(x) return -(math.cos(pi * x) - 1) * 0.5 end
function M.ease.inExpo(x) if x == 0 then return 0 end return 2 ^ (10 * x - 10) end
function M.ease.outExpo(x) if x == 1 then return 1 end return 1 - 2 ^ (-10 * x) end
function M.ease.inOutExpo(x)
  if x == 0 or x == 1 then return x end
  if x < 0.5 then return 2 ^ (20 * x - 10) * 0.5 end
  return (2 - 2 ^ (-20 * x + 10)) * 0.5
end

return M
