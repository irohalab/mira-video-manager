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

import { mkdir, rm } from 'fs/promises';
import { join, resolve } from 'path';
import { Container } from 'inversify';
import { ConfigManager } from '../utils/ConfigManager';
import { RemoteFile, Sentry, TYPES } from '@irohalab/mira-shared';
import { FakeConfigManager } from './FakeConfigManager';
import { DatabaseService } from '../services/DatabaseService';
import { FakeDatabaseService } from './FakeDatabaseService';
import { ProcessorFactory, ProcessorFactoryInitiator } from '../processors/ProcessorFactory';
import { TYPES_VM } from '../TYPES';
import { VideoProcessor } from '../processors/VideoProcessor';
import { ProfileFactory, ProfileFactoryInitiator } from '../processors/profiles/ProfileFactory';
import { BaseProfile } from '../processors/profiles/BaseProfile';
import { FakeSentry } from '@irohalab/mira-shared/test-helpers/FakeSentry';
import { JobMessage } from '../domains/JobMessage';
import { randomUUID } from 'crypto';

export const projectRoot = resolve(__dirname, '../../');

export async function ensureTempDir(videoTempDir: string): Promise<void> {
    try {
        await mkdir(videoTempDir, { recursive: true });
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.warn(e);
        }
    }
}

export async function cleanDir(dirPath: string): Promise<void> {
    try {
        await rm(dirPath, { recursive: true });
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.warn(e);
        }
    }
}

export function bindInjectablesForProcessorTest(container: Container): void {
    container.bind<ConfigManager>(TYPES.ConfigManager).to(FakeConfigManager).inSingletonScope();
    container.bind<DatabaseService>(TYPES.DatabaseService).to(FakeDatabaseService);
    container.bind<ProcessorFactoryInitiator>(TYPES_VM.ProcessorFactory).toFactory<VideoProcessor>(ProcessorFactory);
    container.bind<Sentry>(TYPES.Sentry).to(FakeSentry);
}

export function prepareJobMessage(videoFilePath: string, otherFilePaths?: string[]): JobMessage {
    const remoteTempPath = resolve(__dirname, '../../tests/');
    const jobMessage = new JobMessage();
    jobMessage.id = randomUUID();
    jobMessage.videoFile = new RemoteFile();
    jobMessage.videoFile.filename = videoFilePath;
    jobMessage.videoFile.fileLocalPath = join(remoteTempPath, videoFilePath);
    jobMessage.downloadAppId = 'test_instance';
    jobMessage.jobId = randomUUID();
    if (otherFilePaths && otherFilePaths.length > 0) {
        jobMessage.otherFiles = [];
        for (const otherFilePath of otherFilePaths) {
            const otherFile = new RemoteFile();
            otherFile.filename = otherFilePath;
            otherFile.fileLocalPath = join(remoteTempPath, otherFilePath);
            jobMessage.otherFiles.push(otherFile);
        }
    }

    return jobMessage;
}