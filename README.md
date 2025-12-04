# Screen & Audio Capture

Electron proof of concept for capturing the entire screen with optional system audio across Linux, macOS, and Windows. Recordings are saved as `.webm` files in the user's `Videos/` directory with timestamped filenames.

## Prerequisites
- Node.js 18+ (tested with v22.20.0) and npm 9+.
- **Linux**: PipeWire desktop portal (`xdg-desktop-portal`, `wireplumber`) for screen + audio capture.
- **macOS**: macOS 13+ with Screen Recording permission granted. Install a loopback device (e.g. BlackHole) to capture system audio.
- **Windows**: Windows 10/11 with desktop capture permissions enabled.

## Quick Start (Development)
```bash
cd /home/asus/ws/poc-screen-and-audio-capture
npm install
npm start
```

Click **Start Recording** to launch the desktop portal, choose the desired screen/window, then use **Stop Recording** to finalize the `.webm`. Status messages highlight whether system audio is included and where the file was saved.

## AI Transcription (Gemini)
- Copy `.env.example` to `.env` and set `GEMINI_API_KEY` plus any optional overrides.
- Install FFmpeg on your system or provide `TRANSCRIPTION_FFMPEG_PATH` so the app can extract audio from recordings.
- Ensure `TRANSCRIPTION_ENABLED=true` (default when an API key is present); recordings enqueue a transcription job once the `.webm` file is saved.
- Leave `TRANSCRIPTION_MODEL` unset to use `models/gemini-1.5-flash-latest`, or override it with any model supported by your Gemini API plan.
- Transcripts write to `Videos/ScreenAudioCapture/transcripts/<recording-name>.txt` with metadata headers.
- Status messages in the UI reflect queued, running, and completed transcription jobs; errors surface without blocking new recordings.
- Set `TRANSCRIPTION_ENABLED=false` in your environment to skip AI processing while keeping video capture intact.

### Controlling chunk size (media recorder timeslice)

- Use the `TRANSCRIPTION_CHUNK_TIMESLICE_MS` environment variable to control how often `MediaRecorder` emits audio chunks in the renderer. Example to use 200ms:
```bash
TRANSCRIPTION_CHUNK_TIMESLICE_MS=200 npm start
```
- If unset, the default is 120ms. Values are sanitized to a reasonable range (20–5000 ms).
- This affects how frequently the renderer emits `transcription:chunk` IPC events — smaller values increase periodic IPC frequency and data volume, larger values reduce IPC frequency but increase per-chunk size and potential latency.

### Silence handling & latency instrumentation

- Configure `TRANSCRIPTION_SILENCE_FILL_MS` (default 200 ms) to inject small zero-PCM frames whenever no real audio arrives, which keeps downstream ASR pipelines responsive during pauses.
- `TRANSCRIPTION_SILENCE_FRAME_MS` (default 20 ms) controls the duration of each synthetic frame.
- The streaming service now logs end-to-end timing (capture → IPC → converter → WebSocket → transcript) so you can confirm whether latency spikes originate in the app or with the provider.

## Building Installers
Electron Builder can generate platform-specific artifacts:
- **Linux AppImage**
	```bash
	npm run build -- --linux
	```
- **macOS dmg**
	```bash
	npm run build -- --mac
	```
- **Windows nsis installer**
	```bash
	npm run build -- --win
	```

The resulting files appear under `dist/` with names such as `ScreenAudioCapture-<version>-mac.dmg`, `ScreenAudioCapture-<version>-win.exe`, and `ScreenAudioCapture-<version>-x86_64.AppImage`.

> **macOS signing**: Replace the sample publisher identifiers with your Team ID and run notarization before distributing. The provided entitlements plist enables Screen Recording and audio input permissions.

## Platform Audio Notes
- **Linux**: PipeWire delivers system audio alongside the desktop stream. If tracks are unavailable, the app continues with video-only capture.
- **Windows**: Chromium requests WASAPI loopback audio for the selected display. When unavailable, recording falls back to video-only and a status message appears.
- **macOS**: macOS does not expose system audio natively. Install a loopback driver and set it as the system/default input to capture output audio; otherwise recordings contain video-only.
