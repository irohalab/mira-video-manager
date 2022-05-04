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

import 'reflect-metadata';
import test from 'ava';
import { Container } from 'inversify';
import { ConfigManager } from '../../utils/ConfigManager';
import { FakeConfigManager } from '../../test-helpers/FakeConfigManager';
import { join } from 'path';
import { cleanDir, ensureTempDir, projectRoot } from '../../test-helpers/helpers';
import { copyFile } from 'fs/promises';
import { v4 as uuid4 } from 'uuid';
import { bootstrap, JOB_EXECUTOR } from '../bootstrap';
import { Server } from 'http';
import * as supertest from 'supertest';
import { Sentry, TYPES } from '@irohalab/mira-shared';
import { FakeDatabaseService } from '../../test-helpers/FakeDatabaseService';
import { DatabaseService } from '../../services/DatabaseService';
import { FakeSentry } from '@irohalab/mira-shared/test-helpers/FakeSentry';

type Ctx = { container: Container, server: Server };

const tempDownloadPath = join(projectRoot, 'temp/download');
const testsAssets = join(projectRoot, 'tests');
const outputFilename = 'output-video-1.mp4';
const messageId = uuid4();

test.before(async (t) => {
    const context = t.context as Ctx;
    const container = new Container({ autoBindInjectable: true });
    context.container = container;
    container.bind<ConfigManager>(TYPES.ConfigManager).to(FakeConfigManager).inSingletonScope();
    container.bind<DatabaseService>(TYPES.DatabaseService).to(FakeDatabaseService);
    container.bind<Sentry>(TYPES.Sentry).to(FakeSentry);
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    (configManager as FakeConfigManager).profilePath = join(projectRoot, 'temp/video-controller');
    await ensureTempDir(join(configManager.videoFileTempDir(), messageId));
    await ensureTempDir(tempDownloadPath);
    await copyFile(join(testsAssets, 'test-video-1.mp4'), join(configManager.videoFileTempDir(), messageId, outputFilename));
});

test.beforeEach((t) => {
    const context = t.context as Ctx;
    const container = context.container;
    const startAs = JOB_EXECUTOR;
    context.server = bootstrap(container, startAs);
})

test.afterEach((t) => {
    const context = t.context as Ctx;
    context.server.close();
})

test.after(async (t) => {
    const container = (t.context as Ctx).container;
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    const videoTempDir = configManager.videoFileTempDir();
    await cleanDir(join(videoTempDir, messageId));
    await cleanDir(tempDownloadPath);
});

test('download output video file', async (t) => {
    const context = t.context as Ctx;
    await supertest(context.server)
        .get(`/video/output/${messageId}/${outputFilename}`)
        .expect(200);
    t.pass();
});