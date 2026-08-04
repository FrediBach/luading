# Local script persistence implementation plan

> **Historical snapshot.** Archived on 2026-08-04 after implementation. This
> plan preserves the original design and increment checklist; current behavior
> belongs in the architecture, workbench guide, and testing strategy.

## Status

Implemented on 2026-08-04.

Verification completed:

- focused project-model, in-memory store, real fake-IndexedDB adapter,
  recovery, backup, durability, hook, editor-view, command-bar, responsive, and
  interactive My Scripts tests passed;
- `npm test` passed 113 files and 619 tests after one transient existing
  Wasmoon timeout passed both its focused rerun and the complete rerun;
- `npm run check` passed linting, 96.63% statement / 90.93% branch / 100%
  function / 98.28% line coverage, TypeScript, all 619 tests, and the production
  build; and
- the in-app browser backend exposed no browser instances, so live Chromium,
  Firefox, Safari, keyboard-only, profile-transfer, and two-real-tab matrix
  cells were not verified in this environment.

## Goal

Let users develop Lua scripts over multiple browser sessions without an
account, a manual save step, or a Luading application backend. Source edits
will be saved automatically in a local script library, the last active document
will be restored on the next visit, and users will be able to back up and
restore the complete library in a portable file.

The first release will remain local-first and cost nothing to operate beyond
the existing static deployment. It will not promise cross-device sync or treat
browser storage as an infallible backup.

This plan covers four implementation increments:

1. extract a project model, persistence boundary, and project-library
   coordinator from `DistingPlayground`;
2. add IndexedDB migrations, hydration, autosave, recovery, and storage-failure
   handling;
3. add the **My Scripts** workflow, saved-state presentation, rename,
   duplicate, soft delete, and last-document restoration; and
4. add complete-library backup/restore and browser-storage durability
   messaging.

## User promise

After this work lands:

- a user can edit a script, close the browser, return to the same production
  origin, and continue from the locally saved source;
- New and Import create independent scripts instead of replacing the only
  in-memory document;
- opening a bundled example never mutates the bundled source, and its first
  edit creates a local copy;
- switching documents waits for or safely recovers the current pending edit;
- storage failures are visible and never presented as a successful save;
- Export still produces the exact current `.lua` source;
- a versioned Luading backup can carry all non-deleted local scripts to another
  browser or origin; and
- source persistence remains distinct from the existing runtime **Save state**
  action.

“Saved locally” means saved for the current browser profile and origin. It does
not mean synchronized, server-backed, immune to clearing site data, or
available in private browsing after that private session ends.

## Product decisions

### Local-first and account-free

- IndexedDB is the authoritative local project store.
- No sign-in, remote request, environment variable, API route, or application
  database is required for this version.
- The workbench remains usable when IndexedDB or `localStorage` is unavailable.
  In that degraded state it must clearly warn before an in-memory edit is
  replaced.
- Cloud synchronization, authentication, and remote conflict resolution are
  deferred. The local model will use stable IDs and revisions so a future sync
  adapter does not require a destructive schema rewrite.

### Projects, documents, and bundled templates

- A **project** is one user-owned Lua source document plus the module snapshot
  needed to reproduce its current Luading execution context.
- Project filenames include the `.lua` suffix and continue through the existing
  filename sanitization boundary.
- Bundled examples are immutable templates, not user projects.
- Selecting a bundled example opens a template document and records that
  selection as the last active document. The first source edit atomically
  creates a user project derived from the template, then applies the edit to
  that project.
- Opening the same bundled template later opens its pristine bundled source.
  Previously forked copies remain independently available under **My Scripts**.
- New creates and activates a user project immediately from
  `NEW_DISTING_SCRIPT`.
- Import creates and activates a user project immediately from the selected
  `.lua` file with an empty module map, preserving the current import contract.
- Export keeps its current meaning: download only the active editor source as
  a `.lua` file. It does not silently export runtime state, layout, or the whole
  project library.

### What is persisted

Version one persists:

- project ID, filename, source, and module snapshot;
- origin kind and optional bundled-template ID;
- creation, update, and last-opened timestamps;
- monotonically increasing local revision;
- soft-deletion timestamp;
- the active document reference;
- a small editor view snapshot for cursor line/column and scroll offsets; and
- storage-durability and backup-reminder presentation metadata where needed.

Version one does not persist:

- Lua VM state or `self.state` captured by **Save state**;
- script parameter values or the active parameter preset;
- clock position, input generator state, voltages, output routes, traces,
  diagnostics, console entries, or performance samples;
- Web MIDI permissions, port identities, assignments, or Web Audio activation;
- workspace layout, theme, and text size through the project database, because
  their existing best-effort `localStorage` ownership remains unchanged; or
- validation results, since they are recomputed for the restored source
  version.

### Autosave behavior

- Source edits update the in-memory project immediately and schedule an
  IndexedDB commit after 300-500 ms of inactivity.
- Editor view changes use a longer debounce because cursor and scroll updates
  are less critical than source.
- Run, New, Import, project/template selection, duplicate, delete, document
  visibility loss, and workbench unmount request a flush before they replace or
  dispose the active document.
- A successful transaction advances the saved revision and changes the status
  to **Saved locally**.
- The status must never say **Saved locally** for a revision that only exists in
  React state.
- `pagehide` and `visibilitychange` cannot make an asynchronous IndexedDB write
  fully reliable. A compact synchronous recovery journal in `localStorage`
  protects the most recent active source until its IndexedDB transaction
  succeeds.
- The journal contains only the active project/template identity, filename,
  source, source revision/timestamp, and bundled origin ID. It does not copy the
  entire project library or unrelated simulator state.
- A successful IndexedDB commit removes an older or matching journal entry.
  Hydration recovers a newer valid journal entry into a named recovery project
  instead of silently overwriting a stored project.

### Storage failure and data-loss prevention

- Every storage adapter operation returns a typed result or throws a typed
  persistence error; UI code does not infer success from absence of a browser
  exception.
- If IndexedDB fails but the recovery journal succeeds, continue editing in a
  degraded mode and show that durable project storage is unavailable.
- If both IndexedDB and the journal fail, mark the document unsaved. Before an
  operation would replace that source, present choices to stay, export the
  current `.lua`, or explicitly discard and continue.
- Quota, permission, blocked-upgrade, serialization, and unknown failures share
  a concise user-facing category but retain their detailed message in the
  console for diagnosis.
- Private browsing is not detected by browser-brand heuristics. Luading reports
  only the storage capabilities and failures it actually observes.
- Browser storage is same-origin. Documentation and UI must explain that
  preview deployments or a future production-domain change do not
  automatically share local projects.

### Multiple tabs

- Each workbench instance has an ephemeral instance ID and communicates saved
  project revisions through `BroadcastChannel` when available.
- A project write uses optimistic concurrency: its transaction compares the
  project revision loaded by the tab with the current stored revision.
- A stale tab must never overwrite a newer stored revision. It creates a new
  project containing its in-memory source, names it as a conflict copy, keeps
  the user on that copy, and announces what happened.
- Without `BroadcastChannel`, transactional revision checks still prevent the
  overwrite. The channel only makes conflict discovery faster.

### Deletion and recovery

- Delete is a soft delete that records `deletedAt`; ordinary queries hide the
  project.
- The UI offers an immediate Undo action after deletion.
- Version one does not need a full Trash browser. Soft-deleted records remain
  in backups only when an explicit future format opts into them; version-one
  backups omit them.
- Automatic age-based purging is deferred until there is evidence that local
  libraries need it. This avoids turning an untested cleanup timer into a data
  loss path.

## Data model

Keep the browser-facing model under `src/disting/workbench/`. It is a Luading
workbench extension and must not enter the Lua contract or simulation-worker
protocol.

```ts
type ScriptProjectOrigin =
  | { kind: 'new' }
  | { kind: 'import' }
  | { kind: 'bundled'; exampleId: string }
  | { kind: 'duplicate'; projectId: string }
  | { kind: 'recovery' }

interface ScriptProject {
  id: string
  filename: string
  source: string
  modules: Record<string, string>
  origin: ScriptProjectOrigin
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
  revision: number
  deletedAt?: number
  editorView?: EditorViewSnapshot
}

interface EditorViewSnapshot {
  line: number
  column: number
  scrollTop: number
  scrollLeft: number
}

type ActiveDocumentRef =
  | { kind: 'project'; projectId: string }
  | { kind: 'bundled'; exampleId: string }

interface ProjectStoreMetadata {
  key: 'workspace'
  activeDocument?: ActiveDocumentRef
}
```

Rules:

- IDs come from `crypto.randomUUID()` with a tested fallback only if the
  supported browser matrix requires one.
- Timestamps are Unix milliseconds captured through an injectable clock in
  model tests.
- Revisions begin at `1` and advance exactly once per successful source/module
  transaction. View-only saves may update `lastOpenedAt` and `editorView`
  without pretending that source changed.
- Filenames pass through `luaDownloadFilename()` or a shared stem normalizer so
  persisted names and exported names cannot diverge.
- Source must be a string. Module maps must contain string keys and string
  values and must be defensively copied at storage boundaries.
- Hydration validates every stored record. A malformed record is quarantined
  from the visible library and reported; it must not crash the workbench or be
  normalized into a misleading valid project.

## IndexedDB schema and migration policy

Use database name `luading-workbench` and integer schema version `1`.

Object stores:

| Store | Key | Indexes | Purpose |
| --- | --- | --- | --- |
| `projects` | `id` | `updatedAt`, `lastOpenedAt`, `deletedAt` | User-owned scripts and soft deletions |
| `metadata` | `key` | none | Active document and future store-level metadata |

Implementation decisions:

- Hide IndexedDB behind a `ProjectStore` interface. React components and pure
  project transitions do not issue raw `IDBRequest`s.
- Prefer a small, maintained Promise wrapper around IndexedDB rather than
  spreading request/event conversion throughout the feature. Any new runtime
  dependency must be justified by bundle impact and kept behind the adapter.
- Use one read-write transaction for compare-and-save, fork-on-conflict,
  duplicate, delete/active-document fallback, and backup restore.
- Register `blocked`, `versionchange`, and connection-close handling. An older
  Luading tab should close its connection and ask for reload rather than
  indefinitely blocking a schema upgrade.
- Future migrations are additive where possible and run only inside
  `onupgradeneeded`. Never clear an object store as a migration shortcut.
- A migration failure leaves the old database untouched when the platform
  transaction rolls back and puts the workbench into visible degraded mode.

Suggested modules:

```text
src/disting/workbench/projects.ts
  Domain types, validation, normalization, naming, transitions, and backup model

src/disting/workbench/project-store.ts
  ProjectStore interface, typed errors, in-memory adapter contract, and results

src/disting/workbench/indexeddb-project-store.ts
  IndexedDB schema, migrations, transactions, and capability detection

src/disting/workbench/project-recovery.ts
  Small localStorage journal validation, write, recovery, and cleanup

src/disting/workbench/useProjectLibrary.ts
  Hydration, active-document ownership, autosave queue, conflicts, and UI actions

src/disting/workbench/ProjectMenu.tsx
  My Scripts, bundled templates, rename/duplicate/delete, and storage actions

src/disting/workbench/project-backup.ts
  Versioned backup serialization, validation, collision handling, and download
```

Exact file boundaries may be adjusted during implementation, but
`DistingPlayground.tsx` must consume a focused hook/view model rather than
absorbing the database, debounce, migration, backup, and conflict logic.

## Persistence boundary

The store interface should express atomic intent instead of exposing generic
key/value operations:

```ts
interface ProjectStore {
  hydrate(): Promise<ProjectWorkspaceSnapshot>
  createProject(project: NewScriptProject): Promise<ScriptProject>
  saveProject(change: ProjectSaveRequest): Promise<ProjectSaveResult>
  updateProjectMetadata(change: ProjectMetadataRequest): Promise<ScriptProject>
  duplicateProject(projectId: string, filename: string): Promise<ScriptProject>
  softDeleteProject(projectId: string): Promise<ActiveDocumentRef | undefined>
  restoreProject(projectId: string): Promise<ScriptProject>
  setActiveDocument(active: ActiveDocumentRef): Promise<void>
  importBackup(backup: ProjectBackup): Promise<ProjectBackupImportResult>
  close(): void
}
```

`saveProject()` returns either the saved project or a conflict result containing
the newly created conflict copy. Revision comparison and conflict-copy creation
happen in the same transaction.

Provide an in-memory adapter for deterministic hook/model tests and as an
explicit session-only fallback. Do not silently call an in-memory save
“local persistence.”

## Startup and hydration flow

The current coordinator starts a simulation worker immediately on mount. That
must be gated so the default script is not briefly loaded and then replaced by
the restored document.

Startup will:

1. create the project-store adapter on the main thread;
2. open and migrate IndexedDB;
3. validate stored projects and metadata;
4. compare any recovery journal with the stored active project revision;
5. recover newer journal source into a separate recovery project;
6. resolve the active document, falling back in order to the most recently
   opened non-deleted project, the recorded bundled example, and the current
   default source;
7. populate `sourceRef`, modules, filename, project/template identity, and
   editor view before mounting/loading the active editor model;
8. create the validation and simulation workers exactly once for the resolved
   source; and
9. expose the library only after hydration settles successfully or enters a
   named degraded mode.

While this runs, the existing booting presentation remains visible. Do not
mount Monaco with one source and immediately replace its model after hydration,
because that loses view state and creates avoidable validation work.

## Editor integration

Extend `DistingCodeEditor` through typed props rather than reaching into its
Monaco model from the project hook:

```ts
type DistingCodeEditorProps = {
  // existing props
  initialView?: EditorViewSnapshot
  documentKey: string
  onViewChange?(view: EditorViewSnapshot): void
}
```

- `documentKey` identifies a project revision family or bundled template and
  prevents a view snapshot from being applied to the wrong source.
- Capture cursor and scroll changes through Monaco events and normalize finite,
  non-negative values before forwarding them.
- Clamp restored cursor positions to the hydrated model.
- The textarea fallback restores the cursor where supported and otherwise
  degrades to source-only restoration without blocking editing.
- External source application continues using the existing
  `applyingExternalValueRef` guard so hydration or document selection does not
  look like a user edit.

## Workbench integration and UX

### Script menu

Evolve the current script selector into these sections:

1. **My Scripts**, sorted by most recently opened with deterministic filename
   tie-breaking;
2. the existing bundled groups, preserving their current group names and
   search behavior; and
3. an empty state explaining that New, Import, or editing an example creates a
   local script.

Search covers project filenames, bundled names, bundled IDs, and group names.
The active row uses `aria-current="true"`. Soft-deleted projects do not appear.

### Project actions

- **New** creates `New Script.lua`, adding a numeric suffix when necessary.
- **Import** retains the existing `.lua` filter and BOM removal, then creates a
  project. Importing a filename that already exists creates a uniquely named
  project; it does not overwrite by filename.
- **Rename** validates and normalizes the filename, preserves `.lua`, and keeps
  focus/error feedback inside an accessible dialog or popover.
- **Duplicate** copies source, modules, and bundled provenance but resets
  creation/update timestamps and assigns a new ID/revision.
- **Delete** soft-deletes the active project, selects the most recently opened
  remaining project or default bundled source, and offers Undo. Bundled
  templates cannot be deleted or renamed.
- **Export** remains available for both projects and bundled templates and uses
  the current editor source byte-for-byte.

### Save presentation

Expose a small source-persistence state near the script identity or in the
status bar:

```ts
type SourceSaveStatus =
  | { kind: 'template' }
  | { kind: 'saving' }
  | { kind: 'saved'; savedAt: number }
  | { kind: 'degraded'; recoverable: boolean; message: string }
  | { kind: 'unsaved'; message: string }
  | { kind: 'conflict'; conflictProjectId: string }
```

Labels must use “source,” “draft,” or “saved locally” where clarification is
needed. They must not reuse the unqualified term “state,” because **Save state**
already represents serialised Lua runtime state.

Status updates use an `aria-live="polite"` region without announcing every
keystroke. Announce successful save only after a transition from saving or
failure, and announce failures/conflicts immediately.

## Backup and restore format

Add a versioned JSON backup with a dedicated extension such as
`.luading-backup.json`:

```ts
interface ProjectBackupV1 {
  format: 'luading-project-backup'
  version: 1
  exportedAt: string
  projects: Array<{
    id: string
    filename: string
    source: string
    modules: Record<string, string>
    origin: ScriptProjectOrigin
    createdAt: number
    updatedAt: number
  }>
}
```

Backup rules:

- Export all non-deleted projects in deterministic filename/ID order.
- Do not include active-device state, runtime state, editor view, storage
  permission results, diagnostics, or browser device identities.
- Serialize JSON with stable field ordering and a trailing newline so backups
  are inspectable and diffable.
- Validate the format marker, exact supported integer version, project count,
  every field type, source/module strings, finite timestamps, and a conservative
  total decoded size before opening an IndexedDB write transaction.
- A malformed project rejects the complete backup; do not partially import a
  file that was presented as one backup unit.
- Restore is additive. Preserve an imported ID only when it is unused. If an ID
  collides, assign a new ID and use a unique filename; never overwrite local
  content implicitly.
- If a colliding project is byte-for-byte equivalent, it may be reported as
  skipped instead of duplicated, but equivalence must include source and
  modules rather than filename alone.
- Restore all accepted projects in one transaction and report created, skipped,
  and renamed counts.
- Keep ordinary `.lua` Import and full-library restore as visibly distinct
  actions with distinct file accept filters.

## Storage durability UX

On hydration, query `navigator.storage.persisted()` when available. Provide an
explicit **Protect local drafts** action that calls
`navigator.storage.persist()` from user interaction.

Presentation rules:

- If persistent storage is granted, say that the browser should retain local
  drafts unless the user clears site data. Do not call it a backup.
- If it is not granted or unsupported, say that drafts are saved locally but
  may be removed under storage pressure and offer **Back up all scripts**.
- If the persistence request is declined, keep the project library fully
  usable and do not repeatedly prompt on startup.
- Show current usage/quota only when `navigator.storage.estimate()` returns
  finite values. Treat it as approximate browser information, not a capacity
  guarantee.
- Explain same-origin behavior and private-session limitations in the
  workbench guide and the backup/storage popover.

## Implementation increments

Each increment is coherent, independently tested, and leaves the workbench in a
usable state. Run its focused tests immediately before starting the next
increment.

### Increment 1: project model and coordination boundary

Deliverables:

- Add pure project types, validation, filename allocation, active-document
  selection, project/template transitions, and save-status modeling.
- Define `ProjectStore` plus a deterministic in-memory implementation for tests.
- Add `useProjectLibrary` with dependency injection for the store, clock, UUID,
  and debounce scheduler.
- Route current New, Import, example selection, editor changes, modules, and
  filename state through the hook/view model.
- Keep persistence session-only in this increment; do not claim cross-session
  saving yet.
- Gate initial source resolution so later IndexedDB hydration can occur before
  worker startup without changing worker ownership.
- Preserve existing Import/Export behavior and fresh-worker script loading.

Focused verification:

- pure model tests for naming, cloning, bundled-template fork, active fallback,
  validation, and immutable transitions;
- hook/coordinator tests for source/module/filename alignment across New,
  Import, template selection, first edit, and Run;
- existing `script-file`, command-bar, script-menu, shortcut, validation, and
  worker-load tests; and
- a regression proving no persistence types or browser-storage values cross the
  worker protocol.

### Increment 2: IndexedDB, hydration, autosave, and recovery

Deliverables:

- Implement schema version 1, connection lifecycle, transactional revision
  checks, and typed errors.
- Add IndexedDB hydration before validation/simulation worker creation.
- Add source and editor-view save queues with explicit flush/cancel semantics.
- Add the `localStorage` recovery journal and boot-time recovery project.
- Add optimistic multi-tab protection and optional `BroadcastChannel`
  notification.
- Add degraded in-memory behavior, unsaved guards, and detailed console errors.
- Restore the last active project or pristine bundled template without first
  running the default source.

Focused verification:

- IndexedDB adapter tests using an isolated browser-compatible fake database;
- migration, blocked-upgrade, malformed-record, transaction rollback, revision
  conflict, soft-delete, and connection-close tests;
- fake-timer tests for debounce, flush-before-switch, stale completion, failure,
  journal recovery, and unmount behavior;
- a two-instance test proving a stale tab creates a conflict copy rather than
  overwriting newer source; and
- a startup regression proving only the hydrated source is sent to validation
  and simulation loading.

### Increment 3: My Scripts and project management UX

Deliverables:

- Add **My Scripts** to the script menu while preserving bundled grouping and
  search.
- Add saved/saving/degraded/unsaved/conflict presentation.
- Add rename, duplicate, soft delete, Undo, and active-document fallback.
- Add editor cursor/scroll capture and restoration per project.
- Add accessible destructive-switch handling when no recovery mechanism is
  available.
- Ensure narrow/touch layouts retain access to the active script and project
  actions without horizontal overflow.

Focused verification:

- pure filtering/sorting/action-state tests;
- server-rendered accessible labels, current-row state, empty state, save
  status, dialog errors, Undo, and template disclosure;
- duplicate filename and active-delete fallback tests;
- editor-view normalization and wrong-document rejection tests;
- responsive rendering and existing command-bar regression tests; and
- keyboard-only manual checks for open, rename, duplicate, delete/undo, switch,
  and export.

### Increment 4: backup, restore, and durability guidance

Deliverables:

- Add deterministic version-one library backup serialization and download.
- Add strict full-file restore validation and atomic additive import.
- Add collision, equivalent-project, and unique-filename reporting.
- Add `persisted()`, user-triggered `persist()`, and optional `estimate()`
  capability handling.
- Add storage/backup UI explaining local-only, same-origin, private-session,
  eviction, and site-data-clearing limits.
- Update canonical documentation for the shipped behavior and archive this plan
  only after the full completion checklist passes.

Focused verification:

- backup round-trip, stable ordering, Unicode, BOM, unsupported version,
  malformed record, size limit, ID collision, equivalent skip, unique rename,
  and atomic rollback tests;
- durability capability tests for granted, declined, unsupported, throwing, and
  non-finite estimate results;
- rendering/accessibility tests for backup/restore and durability messaging;
- manual restore between two separate browser profiles or origins; and
- a failure test proving an invalid backup leaves the existing library
  unchanged.

## Test strategy and required commands

This feature changes main-thread state ownership, browser persistence, Monaco
coordination, and user-facing workbench behavior. It does not change the public
Lua API, worker scheduling, or firmware conformance contract.

Testing layers:

- Keep domain rules pure and cover them without React or browser globals.
- Exercise the real IndexedDB adapter with a standards-compatible fake in
  Vitest; also inject explicit failures instead of relying only on environment
  behavior.
- Test the hook/save queue with fake timers and controllable promises so stale
  writes and document switches are deterministic.
- Test components through current server-rendering/accessibility conventions.
- Preserve the real Wasmoon boundary tests for New/imported/restored source
  loading. Restored source must use the same runtime bridge as current editor
  source.
- No new conformance expectation is required unless implementation
  accidentally changes public Lua behavior. If it does, stop and re-scope the
  work rather than absorbing that change into this feature.

Live browser matrix after increment 4:

| Scenario | Chromium | Firefox | Safari |
| --- | --- | --- | --- |
| Edit, wait for Saved locally, reload | Required | Required | Required |
| Edit and immediately switch projects | Required | Required | Required |
| Close/reopen after a recent edit | Required | Required | Required |
| New, Import, template fork, rename, duplicate | Required | Required | Required |
| Delete and Undo | Required | Required | Required |
| Two tabs edit the same project | Required | Required | Required |
| IndexedDB blocked/unavailable fallback | Required | Required | Required |
| Backup in one profile, restore in another | Required | Required | Required |
| Persistent-storage request presentation | Required | Required | Required |
| Narrow viewport and keyboard-only actions | Required | Required | Required |

Record exact browser versions and any unavailable matrix cells. Private-mode
behavior is useful additional evidence but is not assumed uniform across
browsers.

After every increment, run the most focused affected test files. After all four
increments, run:

```bash
npm test
npm run check
```

Do not describe the implementation as complete while either command fails.

## Documentation work when behavior lands

- Update `docs/ARCHITECTURE.md` with the project store, active-document
  ownership, hydration-before-worker flow, autosave/recovery flow, and storage
  failure/conflict behavior.
- Update the state-ownership table so editor text is mirrored into the local
  project store while Monaco remains authoritative when mounted.
- Update `docs/WORKBENCH_GUIDE.md` with My Scripts, template forking, autosave
  labels, rename/duplicate/delete/undo, exact `.lua` Export behavior, backup and
  restore, and local-storage limitations.
- Update `docs/TESTING.md` with the IndexedDB adapter, save-queue, recovery,
  multi-tab, backup, and live-browser guarantees and limitations.
- Do not update `docs/CONFORMANCE_STATUS.md` unless firmware-facing support or a
  known hardware-fidelity limitation changes; local source persistence is a
  browser workbench feature.
- Keep this plan in future tense while active. When complete, move it to
  `docs/archive/implementation-plans/`, add a dated historical banner with the
  final verification, and update `docs/README.md`.

## Risks and mitigations

### Last edit lost during abrupt termination

IndexedDB commits are asynchronous and lifecycle events are not guaranteed.
Use a short source debounce, flush at every controllable boundary, and maintain
the compact synchronous recovery journal until the authoritative transaction
succeeds. Never claim perfect recovery from process or device failure.

### Coordinator complexity grows further

`DistingPlayground.tsx` is already a concentrated coordinator. Keep database
connections, save scheduling, recovery, conflict handling, and backup parsing
inside the project-library boundary, exposing typed state/actions to the
coordinator.

### Stale async work applies to a new document

Tag every save, view-state update, storage error, and hydration completion with
the project/document ID and source revision. Ignore stale completions exactly as
validation and worker responses already reject stale source versions.

### Bundled modules drift after an application update

A forked project stores the module snapshot used when it was created. Pristine
templates continue using the current bundled modules. Backup includes project
module snapshots so a restored project keeps its local execution context.

### Storage messaging creates false confidence

Use **Saved locally** rather than **Saved** or **Backed up**. Always pair local
durability information with Export/backup access and explain clearing site data
and origin boundaries.

### Large or malicious backup blocks the browser

Apply a conservative file/decoded-size and project-count limit before full
validation, validate iteratively where practical, reject unsupported schemas,
and perform no database mutation until the complete backup is valid.

### Browser implementation differences

Keep capability detection and failures inside adapters, avoid browser-name
branches, and complete the live Chromium/Firefox/Safari matrix. The app must
retain import/edit/export functionality even when persistence is unavailable.

## Completion criteria

The four-increment implementation is complete only when:

- source survives reload and later sessions on the same browser origin without
  explicit user saving;
- New, Import, bundled-template fork, switching, rename, duplicate, delete/undo,
  and exact `.lua` Export preserve their documented data boundaries;
- the last active project or pristine bundled template restores before worker
  startup, including a valid editor view where supported;
- IndexedDB failures and an unavailable recovery journal cannot cause a silent
  destructive switch;
- concurrent tabs cannot silently overwrite one another;
- backup and restore round-trip every non-deleted project, including module
  snapshots, and invalid backups are atomic no-ops;
- UI text distinguishes local source persistence, portable backup, and Lua
  runtime **Save state**;
- affected pure, adapter, hook, rendering, accessibility, Wasmoon-boundary, and
  documentation tests pass;
- the live browser matrix is completed or its exact unavailable cells are
  reported;
- `docs/ARCHITECTURE.md`, `docs/WORKBENCH_GUIDE.md`, and `docs/TESTING.md`
  describe the landed behavior and limitations;
- `npm test` passes; and
- `npm run check` passes.

## Deferred work

- Accounts, authentication, cross-device synchronization, sharing, and a
  hosted database.
- GitHub/Gist integration or direct repository commits.
- File System Access API handles and write-through saving to user-selected
  files or directories.
- Service-worker/PWA installation and offline application-shell caching.
- Full project revision history, named snapshots, diff UI, or a Trash browser.
- Automatic purge of soft-deleted records.
- Persisting runtime state, parameters, signals, routes, traces, diagnostics,
  or browser device identities.
- Multiple editable Lua/module files inside one project.
