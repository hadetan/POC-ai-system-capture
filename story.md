# Migrate Transcription Provider to AssemblyAI

User Story
----------
As a developer and product owner, I want to remove Gemini and fully integrate AssemblyAI as the only transcription provider in the project so that streaming transcription works reliably with low latency and the repository remains lean.

Acceptance Criteria (ACs)
-------------------------
- [x] AC1 — AssemblyAI is the only supported provider
  - `TRANSCRIPTION_PROVIDER` defaults to `assembly` and the app throws an error if `ASSEMBLYAI_API_KEY` is not configured when streaming is enabled.
  - All references to `gemini` are removed from code, config, README, `.env`, and `.env.example`.

- [x] AC2 — Realtime streaming client works and API parity
  - Implement `transcription/streaming/assembly-client.js` that provides the same public interface and events as the previous real-time client: `connect()`, `sendAudio(Buffer, meta)`, `disconnect()`, `isReady()`.
  - Events emitted by the client must include: `transcription` (with server-provided absolute text + optional `latencyMs`), `chunk-sent` (when a chunk is sent with `sequence` and `wsSendTs`), `error`, `disconnected`, and `usage` (if provided by the provider).
  - `transcription/streaming/service.js` uses the `AssemblyLiveClient` for streaming sessions.
  - There are no Gemini fallbacks — the service rejects starting without `ASSEMBLYAI_API_KEY` when `TRANSCRIPTION_PROVIDER=assembly`.

- [x] AC3 — Batch (file) provider implemented
  - Implement `transcription/providers/assemblyai.js` implementing the same interface as the previous batch provider (prepareAudio, transcribe)
  - Stream or upload files to AssemblyAI endpoints and return `{text, provider, model}` similar to the old provider.
  - `transcription/worker.js` uses the `AssemblyProvider` for batch transcriptions and not `GeminiProvider`.

- [ ] AC4 — Low-latency & audio handling guarantees
  - `PersistentAudioConverter` continues to produce PCM 16kHz 16-bit mono (no change to codec path).
  - The `TARGET_CHUNK_SIZE` in `LiveStreamingSession` remains tuned for ~100ms chunk (3200 bytes) and is configurable.
  - End-to-end latency must be tested (logs collected), and we should observe median partial transcript latencies under 200ms under normal conditions.

- [ ] AC5 — Tests, CI & harness
  - Add unit tests for the `AssemblyProvider` (mock HTTP responses) and the `AssemblyLiveClient` (mock WS server / messages to test event emissions).
  - Add a test harness script `scripts/test-realtime-assembly.js` that streams a PCM file to the live client and logs transcripts/latency.
  - Add CI or instructions to run the test harness locally.

- [x] AC6 — Cleanup & documentation
  - Remove `transcription/providers/gemini.js`, `transcription/streaming/live-client.js` and any unreferenced Gemini artifacts.
  - Update `config/transcription.js` to require `ASSEMBLYAI_API_KEY` and set `TRANSCRIPTION_PROVIDER` to `assembly` by default.
  - Update `.env.example` with `ASSEMBLYAI_API_KEY` example and remove Gemini keys.
  - Update `README.md` transcription section to document the new provider and testing instructions.
  - Remove `@google/genai` from `package.json` dependencies (or comment it out if there's a future optional fallback.

- [x] AC7 — No config bloat
  - Remove unused config envs related to Gemini model selection (e.g., `TRANSCRIPTION_MODEL`) unless still required by AssemblyAI.
  - Keep essential config tunables: `TRANSCRIPTION_CHUNK_TIMESLICE_MS`, `TRANSCRIPTION_MAX_CHUNK_BYTES`, `TRANSCRIPTION_SILENCE_FILL_MS`, `TRANSCRIPTION_SILENCE_FRAME_MS`.

Definition of Done (DoD)
-------------------------
- Code compiles, tests pass and local manual test harness works with a valid `ASSEMBLYAI_API_KEY`.
- The app must not reference Gemini in any file.
- The app must fail fast if `TRANSCRIPTION_PROVIDER=assembly` and `ASSEMBLYAI_API_KEY` is missing.
- The streaming session should be operational with the `AssemblyLiveClient`, and `session-update` events should be emitted like before.
- The repository is updated (README and `.env.example`) and patches committed / PR created for review.

Implementation tasks
---------------------
- [x] Create `transcription/streaming/assembly-client.js` (Realtime WS client)
- [x] Create `transcription/providers/assemblyai.js` (Batch provider)
- [x] Update `transcription/streaming/service.js` and remove Gemini client import
- [x] Update `config/transcription.js` to reference `ASSEMBLYAI_API_KEY` and set default provider to `assembly`
- [x] Update `transcription/worker.js` to use the new `AssemblyProvider`
- [x] Remove `transcription/providers/gemini.js` and `transcription/streaming/live-client.js` and other obsolete gemini references
- [ ] Add tests and `scripts/test-realtime-assembly.js`
- [x] Update README and `.env.example`

Notes and caveats
------------------
- AssemblyAI's exact realtime handshake (auth format + JSON structure) must be validated against their official docs; the client will implement the format they specify.
- TLS and secure handling of `ASSEMBLYAI_API_KEY` are required for production; keep keys out of repo.

Execution plan
--------------
1. Add assembly client skeleton + provider and wire into `service.js` with mock client as an option for quick testing.
2. Build a simple test harness and run a streaming test locally with a real `ASSEMBLYAI_API_KEY`.
3. Remove Gemini files and dependencies after local verification.
4. Add unit and integration tests.
5. Update docs and release notes.
