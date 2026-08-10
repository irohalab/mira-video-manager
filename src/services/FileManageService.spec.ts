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
import 'reflect-metadata';
import { mkdir, rm, writeFile } from 'fs/promises';
import { Container } from 'inversify';
import { ConfigManager } from '../utils/ConfigManager';
import { FakeConfigManager } from '../test-helpers/FakeConfigManager';
import { join } from 'path';
import { FileManageService } from './FileManageService';
import { v4 as uuid4 } from 'uuid';
import { cleanDir, ensureTempDir, projectRoot } from '../test-helpers/helpers';
import { RemoteFile, Sentry, TYPES } from '@irohalab/mira-shared';
import { FakeSentry } from '../test-helpers/FakeSentry';

const testVideoFilename = 'test-video-1.mp4';
const testVideoFilePath = join(__dirname, '../../tests/', testVideoFilename);
type Cx = {container: Container, videoTempPath: string};

test.before(async (t) => {
    const context = t.context as Cx;
    const container = new Container({ autoBindInjectable: true });
    context.container = container;
    container.bind<ConfigManager>(TYPES.ConfigManager).to(FakeConfigManager).inSingletonScope();
    container.bind<Sentry>(TYPES.Sentry).to(FakeSentry).inSingletonScope();
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

test('preserve S3 URI when an application host mapping exists', t => {
    const context = t.context as Cx;
    const fileManager = context.container.get<FileManageService>(FileManageService);
    const remoteFile = new RemoteFile();
    remoteFile.filename = testVideoFilename;
    remoteFile.fileUri = 's3://internal-download-files/path/to/test-video-1.mp4';

    const convertedRemoteFile = fileManager.getFileUrlOrLocalPath(remoteFile, 'test_instance');

    t.is(convertedRemoteFile.fileUri, remoteFile.fileUri);
});

test('download S3 URI through S3 service', async t => {
    const context = t.context as Cx;
    const configManager = context.container.get<ConfigManager>(TYPES.ConfigManager);
    const sentry = context.container.get<Sentry>(TYPES.Sentry);
    let downloadedUri: string;
    const s3Service = {
        download: async (uri: string, destPath: string) => {
            downloadedUri = uri;
            await writeFile(destPath, 'video');
        }
    };
    const fileManager = new FileManageService(configManager, s3Service as any, sentry);
    const messageId = uuid4();
    const remoteFile = new RemoteFile();
    remoteFile.filename = testVideoFilename;
    remoteFile.fileUri = 's3://internal-download-files/path/to/test-video-1.mp4';

    await fileManager.downloadFile(remoteFile, 'test_instance', messageId);

    t.is(downloadedUri, remoteFile.fileUri);
    t.true(await fileManager.checkExists(testVideoFilename, messageId));
});

// TODO: write test download from network.