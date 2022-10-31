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

import { Container } from 'inversify';
import test from 'ava';
import { ConfigManager } from '../utils/ConfigManager';
import { Sentry, TYPES } from '@irohalab/mira-shared';
import { FakeConfigManager } from '../test-helpers/FakeConfigManager';
import { DatabaseService } from '../services/DatabaseService';
import { FakeDatabaseService } from '../test-helpers/FakeDatabaseService';
import { join } from 'path';
import { createJob, projectRoot } from '../test-helpers/helpers';
import { VideoProcessor } from '../processors/VideoProcessor';
import { TYPES_VM } from '../TYPES';
import { ProcessorFactoryInitiator } from '../processors/ProcessorFactory';
import { FakeVideoProcessorFactory } from '../test-helpers/FakeVideoProcessorFactory';
import { FakeJobRepository } from '../test-helpers/FakeJobRepository';
import { FakeVertexRepository } from '../test-helpers/FakeVertexRepository';
import { EVENT_VERTEX_FAIL, TERMINAL_VERTEX_FINISHED, VertexManager } from './VertexManager';
import { VertexManagerImpl } from './VertexManagerImpl';
import { FakeSentry } from '@irohalab/mira-shared/test-helpers/FakeSentry';
import { JobStatus } from '../domains/JobStatus';

type Cxt = { container: Container };

test.beforeEach((t) => {
    const context = t.context as Cxt;
    const container = new Container({ autoBindInjectable: true });
    context.container = container;
    container.bind<ConfigManager>(TYPES.ConfigManager).to(FakeConfigManager).inSingletonScope();
    container.bind<DatabaseService>(TYPES.DatabaseService).to(FakeDatabaseService).inSingletonScope();
    container.bind<Sentry>(TYPES.Sentry).to(FakeSentry).inSingletonScope();
    container.bind<ProcessorFactoryInitiator>(TYPES_VM.ProcessorFactory).toFactory<VideoProcessor>(FakeVideoProcessorFactory);
    container.bind<VertexManager>(TYPES_VM.VertexManager).to(VertexManagerImpl);
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    (configManager as FakeConfigManager).profilePath = join(projectRoot, 'temp/vertex-manager');
});

test.afterEach((t) => {
    const context = t.context as Cxt;
    const container = context.container;
    const dbService = container.get<DatabaseService>(TYPES.DatabaseService);
    const jobRepo = dbService.getJobRepository() as FakeJobRepository;
    jobRepo.reset();
    const vxRepo = dbService.getVertexRepository() as FakeVertexRepository;
    vxRepo.reset();
});

test.serial('execute vertices by their order defined by a graph', async(t) => {
    const context = t.context as Cxt;
    const container = context.container;
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    const dbService = container.get<DatabaseService>(TYPES.DatabaseService);
    const vm = container.get<VertexManager>(TYPES_VM.VertexManager);
    const job = createJob(await configManager.jobExecutorId(), JobStatus.Running);
    await dbService.getJobRepository().save(job);
    const jobLogPath = join(configManager.jobLogPath(), job.id);

    // need to create vertices manually before start
    await vm.createAllVertices(job);

    await vm.start(job, jobLogPath);
    await new Promise((resolve, reject) => {
        vm.events.on(EVENT_VERTEX_FAIL, (error) => {
            reject(error);
        });
        vm.events.on(TERMINAL_VERTEX_FINISHED, () => {
            t.pass('should go here');
            console.log('vertex finished');
            resolve('');
        });
    });
    await vm.stop();
    // the order check is performed in FakeVideoProcess.prepare(), if no error is thrown then everything is fine.
    t.plan(1);
});