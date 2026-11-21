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
import { Container } from 'inversify';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { FakeConfigManager } from '../test-helpers/FakeConfigManager';
import { LocalConvertProcessor } from './LocalConvertProcessor';
import { ConvertAction } from '../domains/ConvertAction';
import { basename, join } from 'path';
import { FileManageService } from '../services/FileManageService';
import { ActionType } from '../domains/ActionType';
import { getStreamsWithFfprobe, isPlayableContainer } from '../utils/VideoProber';
import {
    bindInjectablesForProcessorTest,
    prepareJobMessage
} from '../test-helpers/helpers';
import { TYPES } from '@irohalab/mira-shared';
import { DatabaseService } from '../services/DatabaseService';
import { Vertex } from '../entity/Vertex';
import { FakeVertexRepository } from '../test-helpers/FakeVertexRepository';
import { ExtractAction } from '../domains/ExtractAction';
import { ExtractTarget } from '../domains/ExtractTarget';
import { ExtractSource } from '../domains/ExtractSource';
import { VertexStatus } from '../domains/VertexStatus';
import { ProfileFactory, ProfileFactoryInitiator } from './profiles/ProfileFactory';
import { TYPES_VM } from '../TYPES';
import { BaseProfile } from './profiles/BaseProfile';
import { ContainerOnlyProfile } from './profiles/ContainerOnlyProfile';
import { SoundOnlyProfile } from './profiles/SoundOnlyProfile';
import { VideoOnlyProfile } from './profiles/VideoOnlyProfile';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { DefaultExtractor } from './extractors/DefaultExtractor';
import { JobMessage } from '../domains/JobMessage';

const test = anyTest as TestFn<{ container: Container }>;
const exec = promisify(execFile);
let tempDir: string;
let source: string;
const subtitle = 'visible.srt';

test.before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mira-convert-'));
    source = join(tempDir, 'source.mkv');
    // Both codecs can be remuxed to MP4, but neither is the target of the transcoding profiles.
    await exec('ffmpeg', [
        '-v', 'error', '-f', 'lavfi', '-i', 'color=black:s=320x180:r=5:d=1',
        '-f', 'lavfi', '-i', 'sine=duration=1', '-c:v', 'mpeg4', '-c:a', 'libmp3lame',
        '-disposition:a:0', 'default', source
    ]);
    await writeFile(join(tempDir, subtitle), '1\n00:00:00,000 --> 00:00:01,000\nVisible captions\n');
});

test.after.always(async () => {
    await rm(tempDir, { recursive: true });
});

test.beforeEach((t) => {
    const container = new Container({ autoBindInjectable: true });
    t.context.container = container;
    bindInjectablesForProcessorTest(container);
    container.bind<ProfileFactoryInitiator>(TYPES_VM.ProfileFactory).toFactory<BaseProfile>(ProfileFactory);
    container.get<FakeConfigManager>(TYPES.ConfigManager).profilePath = tempDir;
});

function sourceJob(withSubtitle = false): JobMessage {
    const job = prepareJobMessage('source.mkv', withSubtitle ? [subtitle] : []);
    job.videoFile.fileLocalPath = source;
    if (withSubtitle) {
        job.otherFiles[0].fileLocalPath = join(tempDir, subtitle);
    }
    return job;
}

async function convert(container: Container, job: JobMessage, profile?: string): Promise<string> {
    const fileManager = container.get(FileManageService);
    const repo = container.get<DatabaseService>(TYPES.DatabaseService).getVertexRepository() as FakeVertexRepository;
    const convertAction = new ConvertAction();
    convertAction.profile = profile;
    const vertex = new Vertex();
    vertex.action = convertAction;
    vertex.jobId = job.jobId;
    vertex.actionType = ActionType.Convert;
    for (const file of [job.videoFile, ...(job.otherFiles || [])]) {
        const isVideo = file === job.videoFile;
        const action = new ExtractAction();
        action.extractorId = DefaultExtractor.Id;
        action.extractTarget = isVideo ? ExtractTarget.KeepContainer : ExtractTarget.Subtitle;
        action.extractFrom = isVideo ? ExtractSource.VideoFile : ExtractSource.OtherFiles;
        const upstream = new Vertex();
        upstream.action = action;
        upstream.actionType = ActionType.Extract;
        upstream.jobId = job.jobId;
        upstream.status = VertexStatus.Finished;
        upstream.outputPath = await fileManager.downloadFile(file, job.downloadAppId, job.id);
        repo.addVertex(upstream);
        vertex.upstreamVertexIds.push(upstream.id);
    }
    const processor = container.get(LocalConvertProcessor);
    try {
        await processor.prepare(job, vertex);
        return await processor.process(vertex);
    } finally {
        await processor.dispose();
    }
}

async function streamHash(path: string, stream: 'v' | 'a', codec: 'copy' | 'rawvideo' = 'copy'): Promise<string> {
    const { stdout } = await exec('ffmpeg', [
        '-v', 'error', '-i', path, '-map', `0:${stream}:0`, '-c', codec, '-threads', '1', '-f', 'streamhash', '-'
    ]);
    return stdout;
}

test('Default Profile', async t => {
    const job = prepareJobMessage('test-video-2.mkv', ['test-video-2.ass']);
    const path = await convert(t.context.container, job);
    t.true(await t.context.container.get(FileManageService).checkExists(basename(path), job.id));
    t.true(await isPlayableContainer(path));
});

test('ContainerOnlyProfile remuxes both streams unchanged into MP4', async t => {
    const path = await convert(t.context.container, sourceJob(), ContainerOnlyProfile.profileName);
    t.true(await isPlayableContainer(path));
    for (const stream of ['v', 'a'] as const) {
        t.is(await streamHash(path, stream), await streamHash(source, stream));
    }
});

test('SoundOnlyProfile encodes AAC and copies the video stream', async t => {
    const path = await convert(t.context.container, sourceJob(), SoundOnlyProfile.profileName);
    const streams = await getStreamsWithFfprobe(path);
    t.deepEqual(streams.map(s => s.codec_name), ['mpeg4', 'aac']);
    t.is(await streamHash(path, 'v'), await streamHash(source, 'v'));
});

test('VideoOnlyProfile encodes H.264, copies audio, and optionally burns subtitles into the frames', async t => {
    const plain = await convert(t.context.container, sourceJob(), VideoOnlyProfile.profileName);
    const captioned = await convert(t.context.container, sourceJob(true), VideoOnlyProfile.profileName);
    const originalAudio = await streamHash(source, 'a');
    for (const path of [plain, captioned]) {
        const streams = await getStreamsWithFfprobe(path);
        t.deepEqual(streams.map(s => s.codec_name), ['h264', 'mp3']);
        t.is(await streamHash(path, 'a'), originalAudio);
    }
    // Hash decoded pixels, not encoded packets: the caption must change the picture.
    t.not(await streamHash(captioned, 'v', 'rawvideo'), await streamHash(plain, 'v', 'rawvideo'));
});
