# Web MIDI implementation plan

## Goal

Luading will support Web MIDI through two complementary paths:

1. Lua scripts will communicate with physical MIDI devices through the existing
   Disting contract: `midiMessage()` for input and `sendMIDI()` for output.
2. Simulated CV, gate, and trigger channels will be mappable to Web MIDI as a
   browser-local alternative to signal generators and WebAudio monitoring.

The Disting Lua contract remains authoritative. Browser device selection,
permissions, timing, and MIDI-to-voltage conversion are simulator conveniences
and must not become Lua globals or firmware-facing metadata.

The documented `sendMIDI()` destination mask remains intact:

| Bit | Disting destination |
| --- | --- |
| `0x1` | MIDI breakout |
| `0x2` | Select Bus |
| `0x4` | USB |
| `0x8` | Internal |

## Implementation status

The routing types, deterministic destination-mask routing, browser Web MIDI
manager, direct Lua MIDI input/output path, MIDI-backed CV/gate/trigger inputs,
unified output routing, deployment policy, and manual-validation runbook are
implemented. MIDI input mappings retain browser port selection on the main
thread and send only atomic voltage/pulse updates to the worker.

The repository pins same-origin MIDI access with
`Permissions-Policy: midi=(self)`. Deployment-specific virtual and physical
results are recorded with `docs/MIDI_MANUAL_VALIDATION.md`; they are not
substituted by fake-port automation.

## Data flow

```text
Physical MIDI input
        |
        +--> worker MIDI request --> Disting filtering --> Lua midiMessage()
        |
        +--> MIDI-to-voltage mapping --> worker external inputs
                                            |
                                            +--> normal 1 ms step/edge pipeline

Lua sendMIDI(mask, bytes)
        |
        +--> worker hardware event --> logical destination map --> Web MIDI outputs

Worker output trace
        |
        +--> existing WebAudio router
        +--> CV-to-MIDI router --> Web MIDI output
```

Web MIDI access stays on the browser main thread. The simulation worker never
owns browser devices, permissions, or port identifiers. Reusable conversion,
edge, and routing behavior belongs in `src/disting/emulation/`.

## 1. Routing data model

Add shared types for:

- MIDI input and output port descriptors;
- Web MIDI access states;
- the four logical Disting destinations and their bit values;
- logical-destination-to-browser-port assignments;
- browser-local MIDI input mappings;
- exclusive Off, WebAudio, and Web MIDI output routes; and
- external input updates that can cross the worker boundary without exposing
  browser port information to the worker.

Keep `AudioRouteDestination` as the WebAudio voice selection inside the new
top-level route union. Existing script-comment WebAudio defaults will later be
converted to this route form.

## 2. Pure MIDI routing behavior

Add `src/disting/emulation/midi-routing.ts` for deterministic behavior that does
not require browser APIs:

- expand a `sendMIDI()` mask into the four logical destinations;
- resolve logical destinations to configured browser ports;
- deduplicate a physical port selected for multiple logical destinations;
- normalize channels and MIDI bytes;
- treat note-on with velocity zero as note-off;
- convert CC, pitch bend, note pitch, velocity, gates, and triggers to voltage;
- convert output traces into CC, pitch-bend, and note events;
- track active notes for safe cleanup; and
- deduplicate and rate-limit continuous messages without dropping edges.

Output-trace events should retain their relative simulated timing. Browser MIDI
may schedule them with a small lead time, but this remains browser-local timing
and must not be presented as hardware timing fidelity.

## 3. Browser Web MIDI manager

Add a browser adapter and React-facing hook which:

- feature-detect `navigator.requestMIDIAccess`;
- request access only following an explicit user action;
- request `sysex: false`;
- enumerate input and output ports;
- open only selected ports;
- attach and remove `midimessage` and `statechange` handlers;
- retain disconnected selections so reconnecting can restore a route;
- close ports and remove handlers during cleanup; and
- report unsupported, denied, disconnected, invalid-message, and device errors
  without stopping the Lua worker.

The browser boundary must be injectable so tests can use fake `MIDIAccess`,
`MIDIInput`, and `MIDIOutput` objects.

## 4. Direct Lua MIDI path

Wire selected physical MIDI inputs through the existing worker MIDI request.
The worker will continue applying `init().midi` type and channel filters before
calling `midiMessage()`.

When Lua calls `sendMIDI()`:

- keep emitting and logging the existing typed hardware event;
- resolve each set destination bit through the browser routing table;
- fan out combined masks such as `0xF`;
- deduplicate identical physical destinations;
- send a zero mask nowhere; and
- surface browser transmission errors without turning them into Lua errors.

The manual MIDI utility remains available and uses the same worker request.
Update the API manifest and editor documentation so `sendMIDI()` no longer
claims to be log-only.

## 5. Web MIDI input sources (implemented)

Extend the reusable signal model and worker protocol with external held values
and queued pulses. An incoming browser message should be able to update several
inputs atomically before the next control step, so a pitch update is visible
before a simultaneous gate edge.

Supported input mappings:

- CV: CC, pitch bend, note-to-V/oct, or note velocity;
- gate: note gate or thresholded CC; and
- trigger: a one-control-step note-on pulse or CC threshold crossing.

Each mapping selects a port, omni or specific channel, message-specific filter,
and voltage range. Switching sources resets the input edge state. All mapped
values then use the normal 1 ms sampling, trace, trigger, gate, and `step()`
pipeline.

## 6. Unified output routing (implemented)

Replace the WebAudio-only hook with one output-routing coordinator. It consumes
each fresh trace segment once and sends each channel to exactly one top-level
route:

- Off;
- a WebAudio voice;
- MIDI CC;
- MIDI pitch bend; or
- MIDI note/gate.

A MIDI note/gate route may use a fixed note or another output as its V/oct pitch
source. Route changes, program reloads, disconnects, and component cleanup must
release notes started by Luading. Existing WebAudio defaults remain supported.

MIDI clock, MIDI 2.0/UMP, SysEx, NRPN, and paired 14-bit CC are out of scope for
the first implementation.

## 7. User interface

Provide a global MIDI control whenever a program is loaded, even if the script
does not declare inbound MIDI metadata. A script may call `sendMIDI()` without
implementing `midiMessage()`.

The global control will show:

- permission and support state;
- connected input and output devices;
- enabled physical inputs; and
- browser output assignments for Breakout, Select Bus, USB, and Internal.

Keep the existing manual byte sender as a deterministic fallback.

Input inspectors gain a Signal generator/Web MIDI source choice and mapping
controls. Output routing popovers gain Off, WebAudio, and Web MIDI sections.
Channel tiles display Live, Ready, Disconnected, or Error without changing
scope assignment behavior.

All controls require keyboard operation, useful accessible names, focus return,
narrow-layout support, and announced asynchronous status.

## 8. Documentation and deployment

Update `docs/ARCHITECTURE.md`, `docs/TESTING.md`, API support descriptions,
editor hover text, and user-facing help. Explain browser compatibility,
permissions, browser-local scheduling, and the distinction from hardware
fidelity.

The Vercel deployment configuration explicitly permits same-origin MIDI access
with `Permissions-Policy: midi=(self)`, pinned by a deployment-configuration
test. The effective production response is rechecked after deployment. Port
selections and channel routes follow existing WebAudio behavior and reset with
the loaded program. Persisting device identifiers is deferred until its privacy
and stale-device behavior are explicitly designed.

## Test workflow

After each coherent increment, run its focused test files. Coverage will include:

- mask expansion, combined masks, zero masks, and duplicate destinations;
- MIDI parsing, channel filtering, clamping, and note-on-zero handling;
- permission, enumeration, hot-plug, reconnect, and cleanup with fake ports;
- direct input delivery through the existing Disting filters;
- direct `sendMIDI()` delivery and non-fatal browser errors;
- atomic input updates, held gates, one-step triggers, and edge ordering;
- output CC/pitch/note deduplication, timing, and active-note cleanup; and
- accessible supported, unsupported, denied, and disconnected UI states.

Run the bundled-script corpus after runtime wiring, especially scripts already
using `midiMessage()` or `sendMIDI()`.

Before handoff, run:

```bash
npm test
npm run test:conformance
npm run check
```

Manual validation uses `docs/MIDI_MANUAL_VALIDATION.md` with a virtual MIDI
loopback device and, when available, a physical controller. It covers connect,
permission denial, disconnect/reconnect, inbound filtering, destination masks,
both conversion directions, and cleanup of active notes.

## Acceptance criteria

- Selected physical messages reach `midiMessage()` only through existing
  Disting filters.
- `sendMIDI()` reaches only browser ports selected by its destination mask.
- Permission and device failures never crash or pause Lua.
- MIDI-backed inputs enter the normal 1 ms signal and edge pipeline.
- Every output has one unambiguous Off, WebAudio, or Web MIDI route.
- Route changes and disconnects do not leave active notes hanging.
- Unsupported browsers retain all existing simulator and manual-MIDI behavior.
- Browser device state never leaks into the Lua contract or simulation worker.
- Documentation, tests, conformance, coverage, lint, and production build pass.
