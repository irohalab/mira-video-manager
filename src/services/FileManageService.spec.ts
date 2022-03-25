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
import { mkdir, rm, writeFile } from 'fs/promises';
import { Container } from 'inversify';
import { ConfigManager } from '../utils/ConfigManager';
import { FakeConfigManager } from '../test-helpers/FakeConfigManager';
import { join } from 'path';
import { FileManageService } from './FileManageService';
import { v4 as uuid4 } from 'uuid';
import { cleanDir, ensureTempDir, projectRoot } from '../test-helpers/helpers';
import { RemoteFile, TYPES } from '@irohalab/mira-shared';

const testVideoFilename = 'test-video-1.mp4';
const testVideoFilePath = join(__dirname, '../../tests/', testVideoFilename);
type Cx = {container: Container, videoTempPath: string};

test.before(async (t) => {
    const context = t.context as Cx;
    const container = new Container({ autoBindInjectable: true });
    context.container = container;
    container.bind<ConfigManager>(TYPES.ConfigManager).to(FakeConfigManager).inSingletonScope();
    const configManager = context.container.get<ConfigManager>(TYPES.ConfigManager);
    (configManager as FakeConfigManager).profilePath = join(projectRoot, 'temp/file-manager');
    const videoTempPath = configManager.videoFileTempDir();
    context.videoTempPath = videoTempPath;
    await ensureTempDir(videoTempPath);
});

test.after(async (t) =>{
    const context = t.context as Cx;
    await cleanDir(context.videoTempPath);
})

test('checkExists', async (t) => {
    const context = t.context as Cx;
    const videoTempPath = context.videoTempPath;
    const fileManager = context.container.get<FileManageService>(FileManageService);
    const messageId = uuid4();
    const testFilePath = join(videoTempPath, messageId, 'testfile.txt');
    await mkdir(join(videoTempPath, messageId));
    t.false(await fileManager.checkExists('abc.txt', messageId), 'abc.txt should not be exists');
    await writeFile(testFilePath, 'helloworld', {encoding: 'utf-8'});
    t.true(await fileManager.checkExists('testfile.txt', messageId));
});

test('test download locally', async (t) => {
    const context = t.context as Cx;
    const fileManager = context.container.get<FileManageService>(FileManageService);
    const messageId = uuid4();
    const remoteFile = new RemoteFile();
    const appId = 'test_instance';
    remoteFile.filename = testVideoFilename;
    remoteFile.fileLocalPath = testVideoFilePath;
    t.false(await fileManager.checkExists(testVideoFilename, messageId));
    await fileManager.downloadFile(remoteFile, appId, messageId);
    t.true(await fileManager.checkExists(testVideoFilename, messageId));
});

// TODO: write test download from network.