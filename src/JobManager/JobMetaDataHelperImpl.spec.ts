/*
 * Copyright 2023 IROHA LAB
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

import 'reflect-metadata';
import { Container } from 'inversify';
import test from 'ava';
import { Sentry, TYPES } from '@irohalab/mira-shared';
import { FakeSentry } from '@irohalab/mira-shared/test-helpers/FakeSentry';
import { join } from 'path';
import { projectRoot } from '../test-helpers/helpers';
import { JobMetadataHelperImpl } from './JobMetadataHelperImpl';
import { Vertex } from '../entity/Vertex';
import { copyFile, mkdir, readdir, stat, unlink } from 'fs/promises';
import { getStdLogger } from '../utils/Logger';
import { JobMetadataHelper } from './JobMetadataHelper';
import { TYPES_VM } from '../TYPES';

type Cxt = { container: Container };
const testVideoDir = join(projectRoot, 'tests');
const videoTemp = join(projectRoot, 'temp/metadata');

test.before(async (t) => {
    try {
        await stat(videoTemp);
    } catch (err) {
        if (err.code === 'ENOENT') {
            await mkdir(videoTemp);
        } else {
            throw err;
        }
    }
});

test.beforeEach((t) => {
    const context = t.context as Cxt;
    const container = new Container({ autoBindInjectable: true });
    context.container = container;
    container.bind<Sentry>(TYPES.Sentry).to(FakeSentry).inSingletonScope();
    container.bind<JobMetadataHelper>(TYPES_VM.JobMetadataHelper).to(JobMetadataHelperImpl).inSingletonScope();
});

test.afterEach(async (t) => {
    const files = await readdir(videoTemp);
    for (const file of files) {
        await unlink(join(videoTemp, file));
    }
});

test('test generate metadata', async (t) => {
    const context = t.context as Cxt;
    const container = context.container;
    const jobMetaDataHelper = container.get(JobMetadataHelperImpl);
    const vertex = new Vertex();
    const testVideoFilename = 'test-video-1.mp4';
    vertex.outputPath = join(videoTemp, testVideoFilename);
    await copyFile(join(testVideoDir, testVideoFilename), vertex.outputPath);
    const verticesMap = {[vertex.id]: vertex};
    const logger = getStdLogger();
    const metadata = await jobMetaDataHelper.processMetaData(verticesMap, logger);
    t.true(!!metadata, 'metadata should not be null');
    t.true(/^#[0-9a-f]{6}/i.test(metadata.dominantColorOfThumbnail), 'dominant color should be a string');
    t.true(Number.isInteger(metadata.duration), `duration should be integer, ${metadata.duration}`);
    t.true(metadata.frameWidth > 0, `frameSize should be greater than 0, ${metadata.frameWidth}`);
    t.true(metadata.height > 0, `height should be greater than 0 ${metadata.height}`);
    const f = await stat(metadata.keyframeImagePathList[0]);
    t.true(f.isFile() && f.size > 0, 'keyframeImage should exists');
});