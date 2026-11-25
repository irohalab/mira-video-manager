# Refactor Log & Summary: Replacing `mediainfo` with `ffprobe`

## 1. Background & Motivation

Previously, `mira-video-manager` depended on two separate media inspection CLI tools:
- **`mediainfo --Output=JSON -f`** (via `getStreamsInfo` in [VideoProber.ts](../../src/utils/VideoProber.ts)) for container/stream playability validation in [LocalVideoValidateProcessor.ts](../../src/processors/LocalVideoValidateProcessor.ts), metadata extraction in [JobMetadataHelperImpl.ts](../../src/JobManager/JobMetadataHelperImpl.ts), and rule evaluation in [ConditionParser.ts](../../src/utils/ConditionParser.ts).
- **`ffprobe -v error -print_format json -show_format -show_streams`** (via `getStreamsWithFfprobe`) for track selection in [SubtitleExtractor.ts](../../src/processors/extractors/SubtitleExtractor.ts), [AudioExtractor.ts](../../src/processors/extractors/AudioExtractor.ts), [DefaultExtractor.ts](../../src/processors/extractors/DefaultExtractor.ts), and [SoundOnlyProfile.ts](../../src/processors/profiles/SoundOnlyProfile.ts).

This split caused several operational problems:
1. **Unusable validation logs for writing extractor rules**: When a `META_JOB` failed in [LocalVideoValidateProcessor.ts](../../src/processors/LocalVideoValidateProcessor.ts), the vertex log printed `mediainfo` tracks (e.g., `@type: "Text"`, `Language: "en"`, `Title: "..."`). Operators could not use those fields directly when configuring `propertyName` / `propertyValueRegex` in `SubtitleExtractor` or `AudioExtractor`, which match `ffprobe` JSON fields (e.g., `tags.language: "eng"`, `tags.title`, `disposition.default`).
2. **Opaque validation failure messages**: `LocalVideoValidateProcessor` threw generic errors (`Container format is not playable`) and aborted on the first failed check without inspecting remaining streams or reporting detected codecs/pixel formats. From `job-log.json` or `vertex.error`, it was impossible to tell why a file failed or which conversion profile (`ContainerOnlyProfile`, `VideoOnlyProfile`, `SoundOnlyProfile`, or `DefaultProfile`) was needed.
3. **Extra system binary dependency & path quirks**: Maintaining `mediainfo` alongside `ffmpeg` required an additional system package in [Dockerfile](../../Dockerfile) and had previously required a file-rename workaround in `LocalVideoValidateProcessor.prepare()` because `mediainfo` failed to output metadata on paths containing non-ASCII characters.

---

## 2. Latent Bugs Discovered & Fixed

During the refactor, several existing bugs in the validation and runtime media layer were uncovered and resolved:

1. **Broken video and audio playability checks in `LocalVideoValidateProcessor`**:
   - *Before*: `new VideoStream(...)` and `new AudioStream(...)` were only checked for object truthiness (`if (!videoTrack)` / `if (!audioTrack)`), which is always `true`—even when `getDefaultVideoStreamInfo()` returned `null`—and `.isPlayable()` was never called. An `.mp4` with HEVC, 10-bit H.264 (`yuv420p10le`), MP3/Vorbis/FLAC audio, or missing audio silently passed validation.
   - *After*: `LocalVideoValidateProcessor` explicitly checks that default video and audio streams exist **and** satisfy `videoTrack.isPlayable()` and `audioTrack.isPlayable()`.
2. **`"Default": "No"` string truthiness bug in `MediaContainer`**:
   - *Before*: MediaInfo JSON serialized `Default` as `"Yes"` / `"No"` strings, so `.find(info => info.Default)` treated `"No"` as truthy when selecting default tracks.
   - *After*: `ffprobe` uses numeric `disposition.default` (`1` vs `0`), and `MediaContainer` checks `info.disposition?.default === 1` (while also excluding embedded cover art streams with `disposition.attached_pic === 1`).
3. **Premature `.mp4` rename on unvalidated files**:
   - *Before*: `LocalVideoValidateProcessor.prepare()` renamed `action.videoFilePath` to `<vertex.id>.mp4` *before* probing, obscuring the original filename/extension in logs and leaving failed `.mkv` files renamed to `.mp4` on disk.
   - *After*: `process()` probes `action.videoFilePath` first and renames to `<vertex.id>.mp4` only after validation passes.
4. **Non-Error rejection & float millisecond duration**:
   - `VideoProber` now attaches `child.on('error', ...)` and rejects with `Error` instances (preserving `.message` and `.stack` for `VertexManagerImpl.onVertexError`).
   - `JobMetadataHelperImpl` rounds `Math.round(container.getDuration() * 1000)` so microsecond-precision `ffprobe` durations (`"11.006259"`) always produce integer milliseconds.

---

## 3. Architecture & Technical Design

### 3.1 Tool-Agnostic Media Domain Interfaces (`src/domains/Media/`)

Obsolete `src/domains/MediaInfo/*` interfaces were replaced with tool-agnostic media interfaces under `src/domains/Media/`:
- [StreamDisposition.ts](../../src/domains/Media/StreamDisposition.ts) — `StreamDisposition` (`default`, `forced`, `attached_pic`, etc.)
- [MediaTags.ts](../../src/domains/Media/MediaTags.ts) — `MediaTags` (`language`, `title`, `major_brand`, `compatible_brands`, plus string index signature)
- [ContainerInfo.ts](../../src/domains/Media/ContainerInfo.ts) — `ContainerInfo` (`filename`, `format_name`, `duration`, `tags`, and computed `isStreamable`)
- [StreamInfo.ts](../../src/domains/Media/StreamInfo.ts) — Discriminated union `StreamInfo` (`VideoStreamInfo | AudioStreamInfo | SubtitleStreamInfo | OtherStreamInfo`) keyed on `codec_type`
- [MediaProbeResult.ts](../../src/domains/Media/MediaProbeResult.ts) — `MediaProbeResult` (`{ format: ContainerInfo, streams: StreamInfo[] }`)

Property names (`codec_name`, `codec_type`, `pix_fmt`, `disposition.default`, `tags.language`, `format_name`, `duration`) intentionally match `ffprobe` JSON output 1:1 so logged stream objects match the exact `propertyName` paths used by extractors and profiles.

### 3.2 Playability & MP4 `isStreamable()` Rules

| Check | Implementation |
| :--- | :--- |
| `MediaContainer.isPlayable()` | `format.format_name` includes `'mp4'` **and** `tags.major_brand` / `compatible_brands` matches MP4/ISO brands (`isom`, `iso2`–`iso6`, `mp41`, `mp42`, `avc1`, `dash`, `cmfc`, `cmf2`, `m4v`), explicitly rejecting QuickTime `.mov` (`qt`), `.m4a`/`.m4b`, `.mj2` (`mjp2`), MKV (`matroska,webm`), AVI, and MPEG-TS. |
| `MediaContainer.isStreamable()` | Precomputed in `probeMedia()` via `checkMp4Streamable()`: walks top-level ISO BMFF 8/16-byte box headers (`pread` without reading media payloads, supporting 64-bit `largesize` > 4 GB) and returns `true` when `moov` precedes the first non-empty `mdat` (`-movflags +faststart`). Kept synchronous on `MediaContainer` for `ConditionParser`'s `vm` sandbox. |
| `VideoStream.isPlayable()` | `codec_name === 'h264'`, `pix_fmt` in `{'yuv420p', 'yuvj420p'}`, and `bits_per_raw_sample` is `8` (or unset for standard 8-bit streams). |
| `AudioStream.isPlayable()` | `codec_name === 'aac'`. |

### 3.3 Validation Logging & Aggregated Error Format

`LocalVideoValidateProcessor.process()` now:
1. Logs `probeResult.format` and each stream in `probeResult.streams` (`JSON.stringify(..., null, 2)`), identical to [LocalExtractProcessor.ts](../../src/processors/LocalExtractProcessor.ts).
2. Logs warnings for non-faststart MP4s, multiple audio streams, and embedded subtitle streams *before* throwing.
3. Evaluates **all** playability dimensions (container, default video stream, default audio stream) and throws a single descriptive error listing every incompatibility alongside any compatible parts:
   ```text
   Video validation failed: container format is not playable MP4 (format_name="matroska,webm", major_brand="n/a"); video stream #0 is not playable (codec_name="hevc", profile="Main 10", pix_fmt="yuv420p10le", bits_per_raw_sample="10"; expected h264 yuv420p 8-bit) [compatible: audio#1=aac(ok)]
   ```

---

## 4. Summary of Changed Files

- **Added**:
  - [src/domains/Media/StreamDisposition.ts](../../src/domains/Media/StreamDisposition.ts)
  - [src/domains/Media/MediaTags.ts](../../src/domains/Media/MediaTags.ts)
  - [src/domains/Media/ContainerInfo.ts](../../src/domains/Media/ContainerInfo.ts)
  - [src/domains/Media/StreamInfo.ts](../../src/domains/Media/StreamInfo.ts)
  - [src/domains/Media/MediaProbeResult.ts](../../src/domains/Media/MediaProbeResult.ts)
  - [src/processors/LocalVideoValidateProcessor.spec.ts](../../src/processors/LocalVideoValidateProcessor.spec.ts)
  - `docs/refactor/replace-mediainfo.md` (this document)
- **Removed**:
  - `src/domains/MediaInfo/{AudioInfo,ContainerInfo,TextInfo,TrackInfo,VideoInfo}.ts`
- **Modified**:
  - [src/utils/VideoProber.ts](../../src/utils/VideoProber.ts) & [src/utils/VideoProber.spec.ts](../../src/utils/VideoProber.spec.ts)
  - [src/utils/Runtime/MediaContainer.ts](../../src/utils/Runtime/MediaContainer.ts), [src/utils/Runtime/VideoStream.ts](../../src/utils/Runtime/VideoStream.ts), [src/utils/Runtime/AudioStream.ts](../../src/utils/Runtime/AudioStream.ts)
  - [src/processors/LocalVideoValidateProcessor.ts](../../src/processors/LocalVideoValidateProcessor.ts)
  - [src/utils/ConditionParser.ts](../../src/utils/ConditionParser.ts) & [src/utils/ConditionParser.spec.ts](../../src/utils/ConditionParser.spec.ts)
  - [src/JobManager/JobMetadataHelperImpl.ts](../../src/JobManager/JobMetadataHelperImpl.ts)
  - [src/processors/LocalExtractProcessor.ts](../../src/processors/LocalExtractProcessor.ts), [src/processors/extractors/SubtitleExtractor.ts](../../src/processors/extractors/SubtitleExtractor.ts), [src/processors/extractors/AudioExtractor.ts](../../src/processors/extractors/AudioExtractor.ts), [src/processors/extractors/DefaultExtractor.ts](../../src/processors/extractors/DefaultExtractor.ts)
  - [Dockerfile](../../Dockerfile), [README.md](../../README.md), [AGENTS.md](../../AGENTS.md), [docs/rule-guide.md](../rule-guide.md), [docs/design/llm-video-conversion-agent.md](../design/llm-video-conversion-agent.md)

---

## 5. Rule Condition Migration Notes

- **Unchanged**: All helper methods on `video_container`, `video_stream`, and `audio_stream` (`isPlayable()`, `isStreamable()`, `videoStreamCount()`, `audioStreamCount()`, `subtitlesCount()`, `getDuration()`, `getWidth()`, `getHeight()`) keep identical signatures and semantics.
- **Raw `getInfo()` / `getContainerInfo()` bracket access**: Any rule condition indexing raw object properties now reads `ffprobe`-aligned keys instead of MediaInfo PascalCase keys (for example, `video_container.getContainerInfo()['duration']` instead of `['Duration']`, and `video_stream.getInfo()['codec_name']` instead of `['Format']`).

---

## 6. Validation Results

- Targeted unit tests passed (`23/23`):
  `npm test -- src/utils/VideoProber.spec.ts src/utils/ConditionParser.spec.ts src/processors/LocalVideoValidateProcessor.spec.ts src/JobManager/JobMetaDataHelperImpl.spec.ts src/processors/LocalConvertProcessor.spec.ts src/services/JobScheduler.spec.ts`
- TypeScript build passed:
  `npm run build`
- Full AVA unit test suite passed (`58/58`):
  `npm test`
- E2E scripts (`e2e:*`) were not run as they require external services (PostgreSQL, RabbitMQ, S3).
