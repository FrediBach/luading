import {
  DISPLAY_DESIGN_LIMITS,
  cloneDisplayDesign,
  createEmptyDisplayDesignSelection,
  normalizeDisplayDesignSelection,
  type DisplayDesignDocumentV1,
  type DisplayDesignSelection,
} from './display-design-model'

export interface DisplayDesignHistorySnapshot {
  document: DisplayDesignDocumentV1
  selection: DisplayDesignSelection
}

export interface DisplayDesignHistoryTransaction {
  label: string
  before: DisplayDesignHistorySnapshot
  after: DisplayDesignHistorySnapshot
}

export interface DisplayDesignHistory {
  present: DisplayDesignHistorySnapshot
  past: DisplayDesignHistoryTransaction[]
  future: DisplayDesignHistoryTransaction[]
}

export interface DisplayDesignTransactionUpdate {
  label: string
  document: DisplayDesignDocumentV1
  selection?: DisplayDesignSelection
}

function ownedSnapshot(
  document: DisplayDesignDocumentV1,
  selection: DisplayDesignSelection,
): DisplayDesignHistorySnapshot {
  const ownedDocument = cloneDisplayDesign(document)
  return {
    document: ownedDocument,
    selection: cloneDisplayDesign(normalizeDisplayDesignSelection(ownedDocument, selection)),
  }
}

function snapshotsEqual(left: DisplayDesignHistorySnapshot, right: DisplayDesignHistorySnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function createDisplayDesignHistory(
  document: DisplayDesignDocumentV1,
  selection = createEmptyDisplayDesignSelection(),
): DisplayDesignHistory {
  return { present: ownedSnapshot(document, selection), past: [], future: [] }
}

export function commitDisplayDesignTransaction(
  history: DisplayDesignHistory,
  update: DisplayDesignTransactionUpdate,
): DisplayDesignHistory {
  const before = ownedSnapshot(history.present.document, history.present.selection)
  const after = ownedSnapshot(update.document, update.selection ?? history.present.selection)
  if (snapshotsEqual(before, after)) return cloneDisplayDesign(history)
  const transaction: DisplayDesignHistoryTransaction = { label: update.label, before, after }
  return {
    present: ownedSnapshot(after.document, after.selection),
    past: [...cloneDisplayDesign(history.past), transaction].slice(-DISPLAY_DESIGN_LIMITS.maximumHistoryTransactions),
    future: [],
  }
}

export function applyDisplayDesignTransaction(
  history: DisplayDesignHistory,
  label: string,
  operation: (snapshot: DisplayDesignHistorySnapshot) => DisplayDesignHistorySnapshot,
): DisplayDesignHistory {
  const input = ownedSnapshot(history.present.document, history.present.selection)
  const output = operation(input)
  return commitDisplayDesignTransaction(history, {
    label,
    document: output.document,
    selection: output.selection,
  })
}

export function undoDisplayDesign(history: DisplayDesignHistory): DisplayDesignHistory {
  const transaction = history.past.at(-1)
  if (!transaction) return cloneDisplayDesign(history)
  return {
    present: ownedSnapshot(transaction.before.document, transaction.before.selection),
    past: cloneDisplayDesign(history.past.slice(0, -1)),
    future: [cloneDisplayDesign(transaction), ...cloneDisplayDesign(history.future)],
  }
}

export function redoDisplayDesign(history: DisplayDesignHistory): DisplayDesignHistory {
  const [transaction, ...remaining] = history.future
  if (!transaction) return cloneDisplayDesign(history)
  return {
    present: ownedSnapshot(transaction.after.document, transaction.after.selection),
    past: [...cloneDisplayDesign(history.past), cloneDisplayDesign(transaction)].slice(-DISPLAY_DESIGN_LIMITS.maximumHistoryTransactions),
    future: cloneDisplayDesign(remaining),
  }
}
