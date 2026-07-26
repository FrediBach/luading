import { LuaFactory } from 'wasmoon'
import { DISTING_CONSTANTS } from '../emulation/lua-contract'
import { DISTING_API } from '../validation/api-manifest'

export async function createDistingLuaTestEngine(functionTimeout = 50) {
  const lua = await new LuaFactory().createEngine({ functionTimeout })

  for (const [name, value] of Object.entries(DISTING_CONSTANTS)) {
    lua.global.set(name, value)
  }
  for (const { name } of DISTING_API) {
    lua.global.set(name, () => undefined)
  }
  for (const name of [
    'getCpuCycleCount',
    'getCurrentAlgorithm',
    'getCurrentParameter',
    'getAlgorithmCount',
    'getParameterCount',
    'getParameter',
    'getBusVoltage',
    'findAlgorithm',
    'findParameter',
  ]) {
    lua.global.set(name, () => 1)
  }
  for (const name of ['getAlgorithmName', 'getParameterName']) {
    lua.global.set(name, () => 'Mock')
  }
  lua.global.set('sendI2CGetter', () => [0])

  return lua
}
