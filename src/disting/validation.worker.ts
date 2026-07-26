/// <reference lib="webworker" />

import { validateLuaSource } from './validation/static-validator'
import type {
  ValidationWorkerRequest,
  ValidationWorkerResponse,
} from './validation/types'

const workerScope = self as unknown as DedicatedWorkerGlobalScope

workerScope.onmessage = (event: MessageEvent<ValidationWorkerRequest>) => {
  if (event.data.type !== 'validate') return
  workerScope.postMessage({
    type: 'validated',
    version: event.data.version,
    diagnostics: validateLuaSource(event.data.source),
  } satisfies ValidationWorkerResponse)
}
