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
import { join, resolve, basename } from 'path';
import { FileManageService } from '../services/FileManageService';
import { rm } from 'fs/promises';
import { ActionType } from '../domains/ActionType';
import { isPlayableContainer } from '../utils/VideoProber';
import { projectRoot } from '../test-helpers/helpers';
import { RemoteFile, TYPES } from '@irohalab/mira-shared';
import { TYPES_VM } from '../TYPES';

type Cxt = { container: Container };

const testVideoFile = 'test-video-2.mkv';
const testSubtitleFile = 'test-video-2.ass';

test.beforeEach((t) => {
    const context = t.context as Cxt;
    const container = new Container({ autoBindInjectable: true });
    context.container = container;
    container.bind<ConfigManager>(TYPES.ConfigManager).to(FakeConfigManager);
    container.bind<ProcessorFactoryInitiator>(TYPES_VM.ProcessorFactory).toFactory<VideoProcessor>(ProcessorFactory);
    container.bind<ProfileFactoryInitiator>(TYPES_VM.ProfileFactory).toFactory<BaseProfile>(ProfileFactory);
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
    const remoteTempPath = resolve(__dirname, '../../tests/');
    const jobMessage = new JobMessage();
    jobMessage.id = uuid4();
    jobMessage.videoFile = new RemoteFile();
    jobMessage.videoFile.filename = testVideoFile;
    jobMessage.videoFile.fileLocalPath = join(remoteTempPath, testVideoFile);
    jobMessage.downloadAppId = 'test_instance';
    const action = new ConvertAction();
    action.type = ActionType.Convert;
    action.index = 0;
    jobMessage.actions = [action];
    const subtitleFile = new RemoteFile();
    subtitleFile.filename = testSubtitleFile;
    subtitleFile.fileLocalPath = join(remoteTempPath, testSubtitleFile);
    jobMessage.otherFiles = [subtitleFile];

    videoProcessor.registerLogHandler((log, ch) => {
        if (ch === 'stderr') {
            console.error(log);
        } else {
            console.log(log);
        }
    });

    await videoProcessor.prepare(jobMessage, jobMessage.actions[0]);
    const outputFilename = await videoProcessor.process(jobMessage.actions[0]);
    console.log('outputfile', outputFilename);
    t.true(await fileManager.checkExists(basename(outputFilename), jobMessage.id), 'output file should exists');
    await videoProcessor.dispose();
    t.true(await isPlayableContainer(outputFilename));
});