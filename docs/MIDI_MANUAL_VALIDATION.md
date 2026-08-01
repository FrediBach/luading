# Web MIDI manual validation

This runbook verifies browser and device behavior that fake-port tests cannot.
Use it against the production deployment after the candidate revision has been
deployed. Record facts observed in the browser; do not treat browser timing as
Disting NT timing fidelity.

## Test record

| Field | Value |
| --- | --- |
| Date and tester | Not run |
| Luading revision | Not run |
| Deployment URL | `https://luading.vercel.app/` |
| Browser and version | Not run |
| Operating system | Not run |
| Virtual MIDI ports | Not run |
| Physical controller/interface | Not available / Not run |

Use **Pass**, **Fail**, **Blocked**, or **Not run** for every result. A physical
device being unavailable is **Blocked**, not **Pass**. Add the observed port,
channel, message bytes, and any console status to the notes when useful.

## Prerequisites

1. Create a virtual MIDI loopback route with distinct Luading input and output
   endpoints, or use a monitor that can both send and receive MIDI.
2. Open the production deployment in a Web MIDI-capable browser.
3. Load **Note Range Limiter Script**, set its **MIDI Ch** parameter to the test
   channel, and use it for note filtering and `sendMIDI()` routing. Edit a copy
   when an exact mask such as zero must be exercised directly.
4. Keep a MIDI monitor open for exact outbound byte and timestamp order checks.
5. If available, connect a physical controller or interface and repeat the
   virtual-port cases marked **Physical repeat**.

## Deployment and permission

| Case | Expected result | Virtual | Physical | Notes |
| --- | --- | --- | --- | --- |
| Production policy | The document response includes `Permissions-Policy: midi=(self)` and loads over HTTPS. | Not run | N/A | |
| Explicit request | No MIDI prompt appears before **Connect Web MIDI**; choosing it requests non-SysEx access. | Not run | N/A | |
| Permission granted | Connected input/output names appear without pausing or reloading Lua. | Not run | Not run | Physical repeat |
| Permission denied | Denial is announced as a MIDI error; Lua and the manual byte sender remain usable. | Not run | N/A | Use a fresh permission state/profile. |
| Unsupported browser/context | Web MIDI is reported unavailable while non-MIDI simulation and manual MIDI remain usable. | Not run | N/A | |

## Ports and lifecycle

| Case | Expected result | Virtual | Physical | Notes |
| --- | --- | --- | --- | --- |
| Input selection | Only enabled input ports deliver messages. | Not run | Not run | Physical repeat |
| Output assignment | Each Breakout/Select Bus/USB/Internal selector retains its disconnected port choice during a same-program reconnect. | Not run | Not run | Physical repeat |
| Hot unplug | The port becomes Disconnected/Error without stopping Lua. | Not run | Not run | Physical repeat |
| Reconnect | Reconnecting the same port restores delivery without duplicating listeners or messages. | Not run | Not run | Physical repeat |
| Program change | Port selections and input/output channel routes reset with the newly loaded program. | Not run | Not run | Physical repeat |

## Direct Lua MIDI contract

Use distinguishable browser output ports where possible, then also assign one
physical port to more than one logical destination to check deduplication.

| Case | Expected result | Virtual | Physical | Notes |
| --- | --- | --- | --- | --- |
| Inbound type filter | Only message types declared by `init().midi` reach `midiMessage()`. | Not run | Not run | Physical repeat |
| Inbound channel filter | Only the declared 1-based MIDI channel reaches `midiMessage()`; omni accepts all channels. | Not run | Not run | Physical repeat |
| Note-on velocity zero | `9n note 00` is handled as note-off by mappings while direct Lua delivery retains valid MIDI bytes. | Not run | Not run | Physical repeat |
| Single destination | `sendMIDI(0x1, ...)` reaches only the Breakout-assigned browser port. | Not run | Not run | Physical repeat |
| Combined mask | `sendMIDI(0xF, ...)` reaches each uniquely assigned browser port once. | Not run | Not run | Physical repeat |
| Duplicate port | A port assigned to multiple selected destination bits receives one copy. | Not run | Not run | Physical repeat |
| Zero mask | `sendMIDI(0, ...)` reaches no browser port. | Not run | Not run | Physical repeat |
| Send failure | A disconnected/rejecting output reports an error without becoming a Lua runtime error. | Not run | Not run | Physical repeat |

## MIDI-to-input conversion

Watch the input tile and scope while sending exact messages. Configure more than
one mapping from the same input message where needed to verify atomic updates.

| Case | Expected result | Virtual | Physical | Notes |
| --- | --- | --- | --- | --- |
| CC to CV | CC 0 and 127 reach the configured voltage-range endpoints; channel and CC filters exclude mismatches. | Not run | Not run | Physical repeat |
| Pitch bend to CV | Values 0, 8192, and 16383 reach the configured minimum, center, and maximum. | Not run | Not run | Physical repeat |
| Note to V/oct and velocity | Note pitch and velocity produce the configured CV values before the matching gate edge. | Not run | Not run | Physical repeat |
| Polyphonic note gate | Gate stays high until every held matching note is released. | Not run | Not run | Physical repeat |
| Note trigger | Each matching note-on creates exactly one 1 ms high pulse followed by low. | Not run | Not run | Physical repeat |
| CC threshold | Gate follows both threshold edges; trigger fires only on a below-to-above crossing. | Not run | Not run | Physical repeat |

## Output-to-MIDI conversion and cleanup

| Case | Expected result | Virtual | Physical | Notes |
| --- | --- | --- | --- | --- |
| Exclusive route | A channel selected for Web MIDI produces no Web Audio route at the same time. | Not run | Not run | Physical repeat |
| CC output | Endpoint voltages map to CC 0 and 127; unchanged values are deduplicated and dense changes are rate-limited. | Not run | Not run | Physical repeat |
| Pitch-bend output | Endpoint and center voltages map to 0, 8192, and 16383 with correct least/most-significant bytes. | Not run | Not run | Physical repeat |
| Fixed-note gate | A rising gate sends one note-on and a falling gate sends the matching note-off. | Not run | Not run | Physical repeat |
| V/oct note change | While gated, a pitch change sends the old note-off before the new note-on. | Not run | Not run | Physical repeat |
| Route change/program reload | Changing route or program releases every note owned by Luading. | Not run | Not run | Physical repeat |
| Disconnect/reconnect cleanup | A note active during disconnect is released when the same output reconnects; no stuck note remains. | Not run | Not run | Physical repeat |

## Completion

Manual validation passes only when every required virtual case is **Pass**, all
available physical repeats are **Pass**, no active note remains after cleanup,
and any browser/device-specific limitation is recorded. Copy the completed test
record and matrices into the release evidence or commit an explicitly dated
result; do not overwrite an earlier hardware record with an unrun template.
