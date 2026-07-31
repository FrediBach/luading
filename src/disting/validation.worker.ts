/// <reference lib="webworker" />

import { LuaFactory } from 'wasmoon'
import wasmoonWasmUrl from 'wasmoon/dist/glue.wasm?url'
import { createLuaValidationService } from './validation/syntax-validator'
import { createLuaSourceIndex } from './validation/source-index'
import { createValidationResponse } from './validation/worker-protocol'
import type {
  ValidationWorkerRequest,
} from './validation/types'

const workerScope = self as unknown as DedicatedWorkerGlobalScope
const factory = new LuaFactory(wasmoonWasmUrl)
const enginePromise = factory.createEngine()
const validationService = createLuaValidationService(() => enginePromise)

workerScope.onmessage = (event: MessageEvent<ValidationWorkerRequest>) => {
  if (event.data.type !== 'validate') return
  const { source, version } = event.data
  const sourceIndex = createLuaSourceIndex(source, version)
  void validationService.validate(source).then((diagnostics) => {
    workerScope.postMessage(createValidationResponse(version, diagnostics, sourceIndex))
  })
}
