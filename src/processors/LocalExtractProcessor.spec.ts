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
import { Container } from 'inversify';
import { ConfigManager } from '../utils/ConfigManager';
import { TYPES } from '@irohalab/mira-shared';
import { FakeConfigManager } from '../test-helpers/FakeConfigManager';
import { basename, join } from 'path';
import {
    bindInjectablesForProcessorTest,
    prepareJobMessage,
    projectRoot
} from '../test-helpers/helpers';
import { TYPES_VM } from '../TYPES';
import { ExtractorFactory, ExtractorInitiator } from './ExtractorFactory';
import { Extractor } from './extractors/Extractor';
import { FileManageService } from '../services/FileManageService';
import { VideoProcessor } from './VideoProcessor';
import { ExtractAction } from '../domains/ExtractAction';
import { ExtractTarget } from '../domains/ExtractTarget';
import { ExtractSource } from '../domains/ExtractSource';
import { LocalExtractProcessor } from './LocalExtractProcessor';
import { Vertex } from '../entity/Vertex';
import { ActionType } from '../domains/ActionType';
import { DefaultExtractor } from './extractors/DefaultExtractor';
import { rm } from 'fs/promises';

type Cxt = { container: Container };
let videoTempDir: string;

test.beforeEach((t) => {
    const context = t.context as Cxt;
    const container = new Container({ autoBindInjectable: true });
    context.container = container;
    bindInjectablesForProcessorTest(container);
    container.bind<ExtractorInitiator>(TYPES_VM.ExtractorFactory).toFactory<Extractor>(ExtractorFactory);
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    (configManager as FakeConfigManager).profilePath = join(projectRoot, 'temp/local-extract-processor');
    videoTempDir = configManager.videoFileTempDir();
});

test.after(async(t) => {
    await rm(videoTempDir, { recursive: true });
})

// test.afterEach(async (t) => {
//     try {
//         const context = t.context as Cxt;
//         const container = context.container;
//         await afterTestForProcessorTest(container);
//     } catch (err) {
//         console.warn(err);
//     }
// });

test('DefaultExtractor', async (t) => {
    const context = t.context as Cxt;
    const fileManager = context.container.get<FileManageService>(FileManageService);
    const videoProcessor1 = context.container.get<VideoProcessor>(LocalExtractProcessor);

    videoProcessor1.registerLogHandler((log, ch) => {
        if (ch === 'stderr') {
            console.error(log);
        } else {
            console.log(log);
        }
    });

    const jobMessage = prepareJobMessage();

    const videoExtractAction = new ExtractAction();
    videoExtractAction.extractorId = 'Default';
    videoExtractAction.extractTarget = ExtractTarget.KeepContainer;
    videoExtractAction.extractFrom = ExtractSource.VideoFile;

    const videoExtractVertex = new Vertex();
    videoExtractVertex.actionType = ActionType.Extract;
    videoExtractVertex.action = videoExtractAction;
    videoExtractVertex.jobId = jobMessage.jobId;

    await videoProcessor1.prepare(jobMessage, videoExtractVertex);
    await videoProcessor1.process(videoExtractVertex);
    console.log(videoExtractVertex.outputPath);
    t.true(await fileManager.checkExists(basename(videoExtractVertex.outputPath), jobMessage.id));

    // subtitle extraction
    const videoProcessor2 = context.container.get<VideoProcessor>(LocalExtractProcessor);

    videoProcessor2.registerLogHandler((log, ch) => {
        if (ch === 'stderr') {
            console.error(log);
        } else {
            console.log(log);
        }
    });
    const subExtractAction = new ExtractAction();
    subExtractAction.extractorId = 'Default';
    subExtractAction.extractTarget = ExtractTarget.Subtitle;
    subExtractAction.extractFrom = ExtractSource.OtherFiles;
    subExtractAction.outputExtname = 'ass'

    const subExtractVertex = new Vertex();
    subExtractVertex.actionType = ActionType.Extract;
    subExtractVertex.action = subExtractAction;
    subExtractVertex.jobId = jobMessage.jobId;

    await videoProcessor2.prepare(jobMessage, subExtractVertex);
    await videoProcessor2.process(subExtractVertex);
    console.log(subExtractVertex.outputPath);
    t.true(await fileManager.checkExists(basename(subExtractVertex.outputPath), jobMessage.id));

});
