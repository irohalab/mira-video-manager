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

import anyTest, { TestFn } from 'ava';
import 'reflect-metadata';
import { execFile } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import { Container } from 'inversify';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { promisify } from 'util';
import { RemoteFile, TYPES } from '@irohalab/mira-shared';
import { ActionType } from '../domains/ActionType';
import { JobMessage } from '../domains/JobMessage';
import { ValidateAction } from '../domains/ValidateAction';
import { Vertex } from '../entity/Vertex';
import { FileManageService } from '../services/FileManageService';
import { FakeConfigManager } from '../test-helpers/FakeConfigManager';
import { bindInjectablesForProcessorTest } from '../test-helpers/helpers';
import { LocalVideoValidateProcessor } from './LocalVideoValidateProcessor';
import { randomUUID } from 'crypto';

const test = anyTest as TestFn<{ container: Container }>;
const exec = promisify(execFile);

let tempDir: string;
let playableUnicodeMp4: string;
let incompatibleMkv: string;
let tenBitH264Mp4: string;
let yuv444H264Mp4: string;
let videoOnlyMp4: string;
let multiAudioCoverArtNonFaststartMp4: string;

test.before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mira-validate-'));
    playableUnicodeMp4 = join(tempDir, '[テスト] 再生可能_1080p.mp4');
    incompatibleMkv = join(tempDir, 'incompatible-with-sub.mkv');
    tenBitH264Mp4 = join(tempDir, 'tenbit-h264.mp4');
    yuv444H264Mp4 = join(tempDir, 'yuv444p-h264.mp4');
    videoOnlyMp4 = join(tempDir, 'video-only.mp4');
    multiAudioCoverArtNonFaststartMp4 = join(tempDir, 'multi-audio-cover-nonfaststart.mp4');
    const coverJpg = join(tempDir, 'cover.jpg');
    const srtPath = join(tempDir, 'sub.srt');

    await exec('ffmpeg', [
        '-v', 'error',
        '-f', 'lavfi', '-i', 'color=black:s=320x180:r=5:d=1',
        '-f', 'lavfi', '-i', 'sine=duration=1',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-movflags', '+faststart',
        playableUnicodeMp4
    ]);

    const { writeFile } = await import('fs/promises');
    await writeFile(srtPath, '1\n00:00:00,000 --> 00:00:01,000\nHello\n');
    await exec('ffmpeg', [
        '-v', 'error',
        '-f', 'lavfi', '-i', 'color=black:s=320x180:r=5:d=1',
        '-f', 'lavfi', '-i', 'sine=duration=1',
        '-i', srtPath,
        '-c:v', 'mpeg4',
        '-c:a', 'libmp3lame',
        '-c:s', 'srt',
        '-metadata:s:s:0', 'language=jpn',
        '-metadata:s:s:0', 'title=Japanese Sub',
        incompatibleMkv
    ]);

    await exec('ffmpeg', [
        '-v', 'error',
        '-f', 'lavfi', '-i', 'color=black:s=320x180:r=5:d=1',
        '-f', 'lavfi', '-i', 'sine=duration=1',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p10le',
        '-c:a', 'aac',
        '-movflags', '+faststart',
        tenBitH264Mp4
    ]);

    await exec('ffmpeg', [
        '-v', 'error',
        '-f', 'lavfi', '-i', 'color=black:s=320x180:r=5:d=1',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        videoOnlyMp4
    ]);

    await exec('ffmpeg', [
        '-v', 'error',
        '-f', 'lavfi', '-i', 'color=black:s=320x180:r=5:d=1',
        '-f', 'lavfi', '-i', 'sine=duration=1',
        '-c:v', 'libx264', '-pix_fmt', 'yuv444p',
        '-c:a', 'aac',
        '-movflags', '+faststart',
        yuv444H264Mp4
    ]);

    await exec('ffmpeg', [
        '-v', 'error',
        '-f', 'lavfi', '-i', 'color=red:s=64x64:d=1',
        '-frames:v', '1',
        coverJpg
    ]);
    await exec('ffmpeg', [
        '-v', 'error',
        '-f', 'lavfi', '-i', 'color=black:s=320x180:r=5:d=1',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
        '-f', 'lavfi', '-i', 'sine=frequency=880:duration=1',
        '-i', coverJpg,
        '-map', '0:v:0', '-map', '1:a:0', '-map', '2:a:0', '-map', '3:v:0',
        '-c:v:0', 'libx264', '-pix_fmt:v:0', 'yuvj420p', '-color_range:v:0', 'pc',
        '-c:a', 'aac',
        '-c:v:1', 'mjpeg', '-disposition:v:1', 'attached_pic',
        multiAudioCoverArtNonFaststartMp4
    ]);
});

test.after.always(async () => {
    if (tempDir) {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test.beforeEach(t => {
    const container = new Container({ autoBindInjectable: true });
    t.context.container = container;
    bindInjectablesForProcessorTest(container);
    container.get<FakeConfigManager>(TYPES.ConfigManager).profilePath = tempDir;
});

async function runValidate(
    container: Container,
    sourcePath: string
): Promise<{ outputPath: string; logs: Array<{ ch: 'stdout' | 'stderr'; msg: string }>; jobId: string; vertexId: string }> {
    const fileManager = container.get(FileManageService);
    const job = new JobMessage();
    job.id = randomUUID();
    job.jobId = randomUUID();
    job.downloadAppId = 'test_instance';
    job.videoFile = new RemoteFile();
    job.videoFile.filename = basename(sourcePath);
    job.videoFile.fileLocalPath = sourcePath;
    await fileManager.downloadFile(job.videoFile, job.downloadAppId, job.id);

    const vertex = new Vertex();
    vertex.jobId = job.jobId;
    vertex.action = new ValidateAction();
    vertex.actionType = ActionType.Validate;

    const logs: Array<{ ch: 'stdout' | 'stderr'; msg: string }> = [];
    const processor = container.get(LocalVideoValidateProcessor);
    processor.registerLogHandler((msg, ch) => logs.push({ ch, msg }));
    try {
        await processor.prepare(job, vertex);
        const outputPath = await processor.process(vertex);
        return { outputPath, logs, jobId: job.id, vertexId: vertex.id };
    } catch (err) {
        (err as any).logs = logs;
        (err as any).jobMessageId = job.id;
        (err as any).originalFilename = job.videoFile.filename;
        (err as any).vertexId = vertex.id;
        throw err;
    } finally {
        await processor.dispose();
    }
}

test('validates playable MP4 with non-ASCII filename, logs stream JSON, and renames output', async t => {
    const fileManager = t.context.container.get(FileManageService);
    const { outputPath, logs, jobId, vertexId } = await runValidate(t.context.container, playableUnicodeMp4);

    t.is(basename(outputPath), `${vertexId}.mp4`);
    t.true(await fileManager.checkExists(`${vertexId}.mp4`, jobId));
    t.false(await fileManager.checkExists(basename(playableUnicodeMp4), jobId));
    t.true(logs.some(entry => entry.msg.includes('"codec_name": "h264"')));
    t.true(logs.some(entry => entry.msg.includes('"codec_name": "aac"')));
});

test('reports all incompatible dimensions and logs extractor-ready ffprobe stream tags on MKV failure', async t => {
    const fileManager = t.context.container.get(FileManageService);
    const err: any = await t.throwsAsync(() => runValidate(t.context.container, incompatibleMkv));

    // Error message identifies container, video codec, and audio codec incompatibilities together.
    t.regex(err.message, /container format is not playable MP4.*matroska,webm/);
    t.regex(err.message, /video stream #0 is not playable.*codec_name="mpeg4"/);
    t.regex(err.message, /audio stream #1 is not playable.*codec_name="mp3"/);

    // Original MKV was NOT prematurely renamed to <vertex.id>.mp4.
    t.true(await fileManager.checkExists(err.originalFilename, err.jobMessageId));
    t.false(await fileManager.checkExists(`${err.vertexId}.mp4`, err.jobMessageId));

    // Vertex logs include ffprobe stream properties (tags.language, tags.title, disposition) for SubtitleExtractor.
    const combinedLogs = (err.logs as Array<{ ch: string; msg: string }>).map(l => l.msg).join('\n');
    t.regex(combinedLogs, /"language":\s*"jpn"/);
    t.regex(combinedLogs, /"title":\s*"Japanese Sub"/);
    t.regex(combinedLogs, /"disposition":/);
    t.regex(combinedLogs, /WARNING: found 1 subtitle stream/);
});

test('rejects MP4 with 10-bit H.264 video while reporting compatible container and audio', async t => {
    const err = await t.throwsAsync(() => runValidate(t.context.container, tenBitH264Mp4));
    t.regex(err.message, /video stream #0 is not playable.*codec_name="h264".*pix_fmt="yuv420p10le"/);
    t.regex(err.message, /\[compatible: container=mp4\(ok\), audio#1=aac\(ok\)\]/);
});

test('rejects MP4 missing an audio stream', async t => {
    const err = await t.throwsAsync(() => runValidate(t.context.container, videoOnlyMp4));
    t.regex(err.message, /no audio stream found/);
    t.regex(err.message, /\[compatible: container=mp4\(ok\), video#0=h264\/yuv420p\(ok\)\]/);
});

test('rejects MP4 with 8-bit yuv444p H.264 video', async t => {
    const err = await t.throwsAsync(() => runValidate(t.context.container, yuv444H264Mp4));
    t.regex(err.message, /video stream #0 is not playable.*codec_name="h264".*pix_fmt="yuv444p".*bits_per_raw_sample="8"/);
    t.regex(err.message, /\[compatible: container=mp4\(ok\), audio#1=aac\(ok\)\]/);
});

test('accepts yuvj420p MP4 with attached_pic cover art while emitting non-faststart and multi-audio warnings', async t => {
    const { logs } = await runValidate(t.context.container, multiAudioCoverArtNonFaststartMp4);
    const stderrMsgs = logs.filter(l => l.ch === 'stderr').map(l => l.msg);

    t.true(stderrMsgs.some(m => m.includes('WARNING: MP4 moov atom is placed after mdat (not faststart)')));
    t.true(stderrMsgs.some(m => m.includes('WARNING: found more than one audio streams (2)')));
});

test('falls back to vertex.outputPath when source file was already renamed in an earlier run', async t => {
    const fileManager = t.context.container.get(FileManageService);
    const job = new JobMessage();
    job.id = randomUUID();
    job.jobId = randomUUID();
    job.downloadAppId = 'test_instance';
    job.videoFile = new RemoteFile();
    job.videoFile.filename = basename(playableUnicodeMp4);
    job.videoFile.fileLocalPath = playableUnicodeMp4;
    await fileManager.downloadFile(job.videoFile, job.downloadAppId, job.id);

    const vertex = new Vertex();
    vertex.jobId = job.jobId;
    vertex.action = new ValidateAction();
    vertex.actionType = ActionType.Validate;

    const processor = t.context.container.get(LocalVideoValidateProcessor);
    await processor.prepare(job, vertex);
    const firstOutput = await processor.process(vertex);
    // Second process() call simulates a retry/resume after action.videoFilePath was already moved to vertex.outputPath
    const secondOutput = await processor.process(vertex);
    await processor.dispose();

    t.is(secondOutput, firstOutput);
    t.true(await fileManager.checkExists(`${vertex.id}.mp4`, job.id));
});
