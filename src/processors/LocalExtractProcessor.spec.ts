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
import { Container } from 'inversify';
import { TYPES } from '@irohalab/mira-shared';
import { FakeConfigManager } from '../test-helpers/FakeConfigManager';
import { basename, extname, join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { bindInjectablesForProcessorTest, prepareJobMessage, projectRoot } from '../test-helpers/helpers';
import { TYPES_VM } from '../TYPES';
import { ExtractorFactory, ExtractorInitiator } from './ExtractorFactory';
import { Extractor } from './extractors/Extractor';
import { FileManageService } from '../services/FileManageService';
import { ExtractAction } from '../domains/ExtractAction';
import { ExtractTarget } from '../domains/ExtractTarget';
import { ExtractSource } from '../domains/ExtractSource';
import { LocalExtractProcessor } from './LocalExtractProcessor';
import { Vertex } from '../entity/Vertex';
import { ActionType } from '../domains/ActionType';
import { DefaultExtractor } from './extractors/DefaultExtractor';
import { AudioExtractor } from './extractors/AudioExtractor';
import { FileExtractor } from './extractors/FileExtractor';
import { SubtitleExtractor } from './extractors/SubtitleExtractor';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { JobMessage } from '../domains/JobMessage';
import { getStreamsWithFfprobe } from '../utils/VideoProber';

const test = anyTest as TestFn<{ container: Container }>;
let tempDir: string;
const multiTrackFile = 'multi-track.mkv';

test.before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mira-extract-'));
    const captions = join(tempDir, 'english.srt');
    await writeFile(captions, '1\n00:00:00,000 --> 00:00:01,000\nEnglish captions\n');
    await promisify(execFile)('ffmpeg', [
        '-v', 'error', '-i', join(projectRoot, 'tests/test-video-with-sub.mkv'),
        '-i', join(projectRoot, 'tests/test-video-2.mkv'), '-i', captions,
        '-map', '0:v', '-map', '0:a', '-map', '1:a', '-map', '0:s', '-map', '2:s', '-c', 'copy',
        '-metadata:s:a:0', 'language=fra', '-disposition:a:0', '0',
        '-metadata:s:a:1', 'language=eng', '-disposition:a:1', 'default',
        '-metadata:s:s:0', 'language=fra', '-metadata:s:s:1', 'language=eng',
        join(tempDir, multiTrackFile)
    ]);
});

test.after.always(async () => {
    await rm(tempDir, { recursive: true });
});

test.beforeEach((t) => {
    const container = new Container({ autoBindInjectable: true });
    t.context.container = container;
    bindInjectablesForProcessorTest(container);
    container.bind<ExtractorInitiator>(TYPES_VM.ExtractorFactory).toFactory<Extractor>(ExtractorFactory);
    container.get<FakeConfigManager>(TYPES.ConfigManager).profilePath = tempDir;
});

function multiTrackJob(): JobMessage {
    const job = prepareJobMessage(multiTrackFile);
    job.videoFile.fileLocalPath = join(tempDir, multiTrackFile);
    return job;
}

async function extract(container: Container, job: JobMessage, options: Partial<ExtractAction>): Promise<string> {
    const fileManager = container.get(FileManageService);
    for (const file of [job.videoFile, ...(job.otherFiles || [])]) {
        await fileManager.downloadFile(file, job.downloadAppId, job.id);
    }
    const vertex = new Vertex();
    vertex.actionType = ActionType.Extract;
    vertex.action = Object.assign(new ExtractAction(), { extractFrom: ExtractSource.VideoFile }, options);
    vertex.jobId = job.jobId;
    const processor = container.get(LocalExtractProcessor);
    try {
        await processor.prepare(job, vertex);
        return await processor.process(vertex);
    } finally {
        await processor.dispose();
    }
}

function extractAudio(container: Container, extraData: { propertyName?: string; propertyValueRegex?: string; selectDefault?: boolean }) {
    return extract(container, multiTrackJob(), {
        extractorId: AudioExtractor.Id, extractTarget: ExtractTarget.AudioStream, extraData
    });
}

test('AudioExtractor selects audio by a case-insensitive regex on an ffprobe tag', async t => {
    for (const [regex, codec, extension] of [['^FR(A)?$', 'vorbis', '.ogg'], ['^EN(G)?$', 'aac', '.aac']]) {
        const path = await extractAudio(t.context.container, { propertyName: 'tags.language', propertyValueRegex: regex });
        t.is(extname(path), extension);
        const streams = await getStreamsWithFfprobe(path);
        t.deepEqual(streams.map(s => [s.codec_type, s.codec_name]), [['audio', codec]]);
    }
});

test('AudioExtractor selects the stream with the default disposition', async t => {
    const path = await extractAudio(t.context.container, { selectDefault: true });
    t.deepEqual((await getStreamsWithFfprobe(path)).map(s => s.codec_name), ['aac']);
});

test('AudioExtractor selects an earlier property match before a later default stream', async t => {
    const path = await extractAudio(t.context.container, {
        selectDefault: true, propertyName: 'tags.language', propertyValueRegex: '^fra$'
    });
    t.deepEqual((await getStreamsWithFfprobe(path)).map(s => s.codec_name), ['vorbis']);
});

test('SubtitleExtractor extracts the captions matching a nested ffprobe property', async t => {
    const path = await extract(t.context.container, multiTrackJob(), {
        extractorId: SubtitleExtractor.Id, extractTarget: ExtractTarget.Subtitle,
        extraData: { propertyName: 'tags.language', propertyValueRegex: '^EN(G)?$' }
    });
    t.is(extname(path), '.srt');
    t.regex(await readFile(path, 'utf8'), /English captions/);
});

test('SubtitleExtractor does not pick an arbitrary track without a matching property', async t => {
    await t.throwsAsync(extract(t.context.container, multiTrackJob(), {
        extractorId: SubtitleExtractor.Id, extractTarget: ExtractTarget.Subtitle, extraData: {}
    }), { message: 'Could not find track that match condition' });
});

test('FileExtractor passes through the original video path', async t => {
    const job = prepareJobMessage('test-video-2.mkv');
    const path = await extract(t.context.container, job, {
        extractorId: FileExtractor.Id, extractTarget: ExtractTarget.KeepContainer
    });
    t.is(path, t.context.container.get(FileManageService).getLocalPath(job.videoFile.filename, job.id));
});

test('FileExtractor keeps the original video path even when an output filename is requested', async t => {
    const job = prepareJobMessage('test-video-2.mkv');
    const fileManager = t.context.container.get(FileManageService);
    const outputFilename = 'next.mkv';
    const path = await extract(t.context.container, job, {
        extractorId: FileExtractor.Id, extractTarget: ExtractTarget.KeepContainer, outputFilename
    });
    t.is(path, fileManager.getLocalPath(job.videoFile.filename, job.id));
    t.false(await fileManager.checkExists(outputFilename, job.id));
    t.deepEqual(await readFile(path), await readFile(job.videoFile.fileLocalPath));
});

test('FileExtractor filters otherFiles by filename hint before falling back to extension', async t => {
    const job = prepareJobMessage('test-video-2.mkv', ['test-video-1.mp4', 'test-video-with-sub.mkv']);
    const path = await extract(t.context.container, job, {
        extractorId: FileExtractor.Id, extractFrom: ExtractSource.OtherFiles, extractTarget: ExtractTarget.KeepContainer,
        extraData: { fileNameHint: 'WITH-SUB\\.mkv$' }
    });
    t.is(path, t.context.container.get(FileManageService).getLocalPath('test-video-with-sub.mkv', job.id));
});

test('DefaultExtractor extract ass from mkv', async t => {
    const job = prepareJobMessage('test-video-with-sub.mkv');
    const path = await extract(t.context.container, job, {
        extractorId: DefaultExtractor.Id, extractTarget: ExtractTarget.Subtitle, outputExtname: 'ass'
    });
    t.true(await t.context.container.get(FileManageService).checkExists(basename(path), job.id));
});
