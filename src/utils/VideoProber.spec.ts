/*
 * Copyright 2026 IROHA LAB
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import test from 'ava';
import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { MediaProbeResult } from '../domains/Media/MediaProbeResult';
import { AudioStream } from './Runtime/AudioStream';
import { MediaContainer } from './Runtime/MediaContainer';
import { VideoStream } from './Runtime/VideoStream';
import { checkMp4Streamable, getStreamsWithFfprobe, isPlayableContainer, probeMedia } from './VideoProber';

const exec = promisify(execFile);
let tempDir: string;

test.before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mira-prober-'));
});

test.after.always(async () => {
    if (tempDir) {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test('probeMedia detects MP4 container and non-faststart layout on test-video-1.mp4', async t => {
    const mp4Path = join(__dirname, '../../tests/test-video-1.mp4');
    const result = await probeMedia(mp4Path);
    const container = new MediaContainer(result);
    t.true(container.isPlayable());
    t.false(container.isStreamable());
    t.is(container.videoStreamCount(), 1);
    t.is(container.audioStreamCount(), 1);
});

test('probeMedia detects faststart MP4 as streamable and rejects QuickTime MOV, M4A, and MKV', async t => {
    const faststartMp4 = join(tempDir, 'faststart.mp4');
    const quicktimeMov = join(tempDir, 'quicktime.mov');
    const audioOnlyM4a = join(tempDir, 'audio-only.m4a');
    await exec('ffmpeg', [
        '-v', 'error',
        '-f', 'lavfi', '-i', 'color=black:s=160x90:r=5:d=1',
        '-f', 'lavfi', '-i', 'sine=duration=1',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
        '-movflags', '+faststart',
        faststartMp4
    ]);
    await exec('ffmpeg', [
        '-v', 'error',
        '-f', 'lavfi', '-i', 'color=black:s=160x90:r=5:d=1',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        quicktimeMov
    ]);
    await exec('ffmpeg', [
        '-v', 'error',
        '-f', 'lavfi', '-i', 'sine=duration=1',
        '-c:a', 'aac',
        audioOnlyM4a
    ]);

    t.true(await checkMp4Streamable(faststartMp4));
    const faststartContainer = new MediaContainer(await probeMedia(faststartMp4));
    t.true(faststartContainer.isPlayable());
    t.true(faststartContainer.isStreamable());

    t.false(await isPlayableContainer(quicktimeMov));
    t.false(await isPlayableContainer(audioOnlyM4a));
    t.false(await isPlayableContainer(join(__dirname, '../../tests/test-video-2.mkv')));
});

function makeBox(type: string, payloadBytes: number, mode: 'standard' | 'largesize' | 'openEnded' = 'standard'): Buffer {
    if (mode === 'largesize') {
        const total = 16 + payloadBytes;
        const buf = Buffer.alloc(total);
        buf.writeUInt32BE(1, 0);
        buf.write(type, 4, 4, 'ascii');
        buf.writeBigUInt64BE(BigInt(total), 8);
        return buf;
    }
    const total = 8 + payloadBytes;
    const buf = Buffer.alloc(total);
    buf.writeUInt32BE(mode === 'openEnded' ? 0 : total, 0);
    buf.write(type, 4, 4, 'ascii');
    return buf;
}

test('checkMp4Streamable handles empty mdat placeholders, 64-bit largesize boxes, open-ended boxes, and corrupt headers', async t => {
    // Empty 8-byte mdat placeholder before moov, followed by 64-bit largesize mdat payload -> streamable
    const placeholderThenMoov = join(tempDir, 'placeholder-moov-largesize.mp4');
    await writeFile(placeholderThenMoov, Buffer.concat([
        makeBox('ftyp', 8),
        makeBox('mdat', 0),
        makeBox('moov', 16),
        makeBox('mdat', 24, 'largesize')
    ]));
    t.true(await checkMp4Streamable(placeholderThenMoov));

    // Non-empty 64-bit largesize mdat before open-ended moov (size === 0 to EOF) -> not streamable
    const mdatBeforeOpenMoov = join(tempDir, 'largesize-mdat-before-moov.mp4');
    await writeFile(mdatBeforeOpenMoov, Buffer.concat([
        makeBox('ftyp', 8),
        makeBox('mdat', 24, 'largesize'),
        makeBox('moov', 16, 'openEnded')
    ]));
    t.false(await checkMp4Streamable(mdatBeforeOpenMoov));

    // Malformed box with declared size smaller than header (4 < 8) -> terminates cleanly and returns false
    const malformedBox = join(tempDir, 'malformed-box.mp4');
    const badHeader = Buffer.alloc(16);
    badHeader.writeUInt32BE(4, 0);
    badHeader.write('free', 4, 4, 'ascii');
    await writeFile(malformedBox, badHeader);
    t.false(await checkMp4Streamable(malformedBox));
});

test('MediaContainer selects disposition.default===1 tracks, ignores attached_pic cover art, and falls back for duration', t => {
    const baseDisposition = {
        default: 0, dub: 0, original: 0, comment: 0, lyrics: 0, karaoke: 0,
        forced: 0, hearing_impaired: 0, visual_impaired: 0, clean_effects: 0,
        attached_pic: 0, timed_thumbnails: 0
    };
    const probeData: MediaProbeResult = {
        format: {
            filename: 'episode.mp4',
            nb_streams: 5,
            format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
            tags: { major_brand: 'isom' },
            isStreamable: true
        },
        streams: [
            {
                index: 0,
                codec_type: 'video',
                codec_name: 'mjpeg',
                width: 600,
                height: 600,
                pix_fmt: 'yuvj444p',
                disposition: { ...baseDisposition, default: 1, attached_pic: 1 }
            },
            {
                index: 1,
                codec_type: 'video',
                codec_name: 'hevc',
                width: 1920,
                height: 1080,
                pix_fmt: 'yuv420p10le',
                duration: '12.500',
                disposition: { ...baseDisposition, default: 0 }
            },
            {
                index: 2,
                codec_type: 'video',
                codec_name: 'h264',
                width: 1280,
                height: 720,
                pix_fmt: 'yuvj420p',
                duration: '24.250',
                disposition: { ...baseDisposition, default: 1 }
            },
            {
                index: 3,
                codec_type: 'audio',
                codec_name: 'mp3',
                disposition: { ...baseDisposition, default: 0 }
            },
            {
                index: 4,
                codec_type: 'audio',
                codec_name: 'aac',
                disposition: { ...baseDisposition, default: 1 }
            }
        ]
    };

    const container = new MediaContainer(probeData);
    t.is(container.videoStreamCount(), 2);
    t.is(container.getDefaultVideoStreamInfo()?.index, 2);
    t.is(container.getDefaultAudioStreamInfo()?.index, 4);
    t.is(container.getDuration(), 24.25);

    // Fallback to first non-attached_pic track when no track has disposition.default === 1
    probeData.streams[2].disposition = { ...baseDisposition, default: 0 };
    probeData.streams[4].disposition = { ...baseDisposition, default: 0 };
    const noDefaultContainer = new MediaContainer(probeData);
    t.is(noDefaultContainer.getDefaultVideoStreamInfo()?.index, 1);
    t.is(noDefaultContainer.getDefaultAudioStreamInfo()?.index, 3);
});

test('VideoStream and AudioStream enforce pixel-format, bit-depth, and null-stream boundaries', t => {
    t.true(new VideoStream({
        index: 0, codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080,
        pix_fmt: 'yuvj420p', bits_per_raw_sample: '8'
    }).isPlayable());

    t.false(new VideoStream({
        index: 0, codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080,
        pix_fmt: 'yuv444p', bits_per_raw_sample: '8'
    }).isPlayable());

    t.false(new VideoStream({
        index: 0, codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080,
        pix_fmt: 'yuv422p', bits_per_raw_sample: '8'
    }).isPlayable());

    const emptyVideo = new VideoStream(null);
    t.false(emptyVideo.isPlayable());
    t.is(emptyVideo.getWidth(), 0);
    t.is(emptyVideo.getHeight(), 0);
    t.false(new AudioStream(null).isPlayable());
});

test('probeMedia and getStreamsWithFfprobe reject with Error instances on missing or invalid files', async t => {
    const missingPath = join(tempDir, 'does-not-exist.mp4');
    const corruptPath = join(tempDir, 'not-a-media-file.mp4');
    await writeFile(corruptPath, 'not valid media bytes');

    await t.throwsAsync(() => probeMedia(missingPath), { instanceOf: Error });
    await t.throwsAsync(() => getStreamsWithFfprobe(corruptPath), { instanceOf: Error });
});