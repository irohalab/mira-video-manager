/*
 * Copyright 2022 IROHA LAB
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
import 'reflect-metadata';
import { Container } from 'inversify';
import { ConfigManager } from '../utils/ConfigManager';
import { FakeConfigManager } from '../test-helpers/FakeConfigManager';
import { ProcessorFactory, ProcessorFactoryInitiator } from './ProcessorFactory';
import { VideoProcessor } from './VideoProcessor';
import { ProfileFactory, ProfileFactoryInitiator } from './profiles/ProfileFactory';
import { BaseProfile } from './profiles/BaseProfile';
import { LocalConvertProcessor } from './LocalConvertProcessor';
import { JobMessage } from '../domains/JobMessage';
import { v4 as uuid4 } from 'uuid';
import { ConvertAction } from '../domains/ConvertAction';
import { basename, join, resolve } from 'path';
import { FileManageService } from '../services/FileManageService';
import { rm } from 'fs/promises';
import { ActionType } from '../domains/ActionType';
import { isPlayableContainer } from '../utils/VideoProber';
import { projectRoot } from '../test-helpers/helpers';
import { RemoteFile, Sentry, TYPES } from '@irohalab/mira-shared';
import { TYPES_VM } from '../TYPES';
import { FakeSentry } from '@irohalab/mira-shared/test-helpers/FakeSentry';
import { FakeDatabaseService } from '../test-helpers/FakeDatabaseService';
import { DatabaseService } from '../services/DatabaseService';
import { Vertex } from '../entity/Vertex';
import { FakeVertexRepository } from '../test-helpers/FakeVertexRepository';
import { randomUUID } from 'crypto';
import { ExtractAction } from '../domains/ExtractAction';
import { ExtractTarget } from '../domains/ExtractTarget';
import { ExtractSource } from '../domains/ExtractSource';
import { VertexStatus } from '../domains/VertexStatus';

type Cxt = { container: Container };

const testVideoFile = 'test-video-2.mkv';
const testSubtitleFile = 'test-video-2.ass';

test.beforeEach((t) => {
    const context = t.context as Cxt;
    const container = new Container({ autoBindInjectable: true });
    context.container = container;
    container.bind<ConfigManager>(TYPES.ConfigManager).to(FakeConfigManager);
    container.bind<DatabaseService>(TYPES.DatabaseService).to(FakeDatabaseService);
    container.bind<ProcessorFactoryInitiator>(TYPES_VM.ProcessorFactory).toFactory<VideoProcessor>(ProcessorFactory);
    container.bind<ProfileFactoryInitiator>(TYPES_VM.ProfileFactory).toFactory<BaseProfile>(ProfileFactory);
    container.bind<Sentry>(TYPES.Sentry).to(FakeSentry);
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    (configManager as FakeConfigManager).profilePath = join(projectRoot, 'temp/local-convert-processor');
});

test.afterEach(async (t) => {
    try {
        const context = t.context as Cxt;
        const container = context.container;
        const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
        const videoTempPath = configManager.videoFileTempDir();
        await rm(videoTempPath, { recursive: true });
    } catch (err) {
        console.warn(err);
    }
});

test('Default Profile', async (t) => {
    const context = t.context as Cxt;
    const fileManager = context.container.get<FileManageService>(FileManageService);
    const videoProcessor = context.container.get<VideoProcessor>(LocalConvertProcessor);
    const databaseService = context.container.get<DatabaseService>(TYPES.DatabaseService);
    const remoteTempPath = resolve(__dirname, '../../tests/');
    const jobMessage = new JobMessage();
    jobMessage.id = uuid4();
    jobMessage.videoFile = new RemoteFile();
    jobMessage.videoFile.filename = testVideoFile;
    jobMessage.videoFile.fileLocalPath = join(remoteTempPath, testVideoFile);
    jobMessage.downloadAppId = 'test_instance';
    jobMessage.jobId = randomUUID();
    const subtitleFile = new RemoteFile();
    subtitleFile.filename = testSubtitleFile;
    subtitleFile.fileLocalPath = join(remoteTempPath, testSubtitleFile);
    jobMessage.otherFiles = [subtitleFile];

    // copy files
    const videoFilePath = await fileManager.downloadFile(jobMessage.videoFile, jobMessage.downloadAppId, jobMessage.id);
    const subtitleFilePath = await fileManager.downloadFile(jobMessage.otherFiles[0], jobMessage.downloadAppId, jobMessage.id);

    const extractAction = new ExtractAction();
    extractAction.extractTarget = ExtractTarget.KeepContainer;
    extractAction.extractFrom = ExtractSource.VideoFile;
    const subExtractAction = new ExtractAction();
    subExtractAction.extractTarget = ExtractTarget.Subtitle;
    subExtractAction.extractFrom = ExtractSource.OtherFiles;

    const convertAction = new ConvertAction();
    convertAction.type = ActionType.Convert;
    convertAction.upstreamActionIds = [extractAction.id, subExtractAction.id];
    extractAction.downstreamIds = [convertAction.id];
    subExtractAction.downstreamIds = [convertAction.id];
    jobMessage.actions = {
        [convertAction.id]: convertAction,
        [extractAction.id]: extractAction,
        [subExtractAction.id]: subExtractAction
    };

    videoProcessor.registerLogHandler((log, ch) => {
        if (ch === 'stderr') {
            console.error(log);
        } else {
            console.log(log);
        }
    });

    const vertexRepo = databaseService.getVertexRepository() as FakeVertexRepository;
    const extractVertex = new Vertex();
    extractVertex.actionType = ActionType.Extract;
    extractVertex.action = extractAction;
    extractVertex.jobId = jobMessage.jobId;
    extractVertex.outputPath = videoFilePath;
    const subExtractVertex = new Vertex();
    subExtractVertex.actionType = ActionType.Extract;
    subExtractVertex.action = subExtractAction;
    subExtractVertex.jobId = jobMessage.jobId;
    subExtractVertex.outputPath = subtitleFilePath;

    const convertVertex = new Vertex();
    convertVertex.action = convertAction;
    convertVertex.jobId = jobMessage.jobId;
    convertVertex.status = VertexStatus.Pending;

    extractVertex.downstreamVertexIds = [convertVertex.id];
    extractVertex.status = VertexStatus.Finished;
    subExtractVertex.downstreamVertexIds = [convertVertex.id];
    subExtractVertex.status = VertexStatus.Finished;

    convertVertex.upstreamVertexIds = [extractVertex.id, subExtractVertex.id];
    convertVertex.upstreamVertexFinished = [true, true];

    vertexRepo.addVertex(convertVertex);
    vertexRepo.addVertex(extractVertex);
    vertexRepo.addVertex(subExtractVertex);
    await videoProcessor.prepare(jobMessage, convertVertex);
    const outputFilename = await videoProcessor.process(convertVertex);
    console.log('outputfile', outputFilename);
    t.true(await fileManager.checkExists(basename(outputFilename), jobMessage.id), 'output file should exists');
    await videoProcessor.dispose();
    t.true(await isPlayableContainer(outputFilename));
});
