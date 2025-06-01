/*
 * Copyright 2025 IROHA LAB
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
import { getStdLogger } from '../utils/Logger';
import { Container, interfaces } from 'inversify';
import { RabbitMQService, Sentry, SentryImpl, TYPES } from '@irohalab/mira-shared';
import { hostname } from 'os';
import { ConfigManager } from '../utils/ConfigManager';
import { ConfigManagerImpl } from '../utils/ConfigManagerImpl';
import { DatabaseService } from '../services/DatabaseService';
import { DatabaseServiceImpl } from '../services/DatabaseServiceImpl';
import { RascalImpl } from '@irohalab/mira-shared/services/RascalImpl';
import { FileManageService } from '../services/FileManageService';
import { TYPES_VM } from '../TYPES';
import { ProcessorFactoryInitiator } from '../processors/ProcessorFactory';
import { VideoProcessor } from '../processors/VideoProcessor';
import { JobMetadataHelper } from '../JobManager/JobMetadataHelper';
import { JobManager } from '../JobManager/JobManager';
import { VertexManager } from '../JobManager/VertexManager';
import { VertexManagerImpl } from '../JobManager/VertexManagerImpl';
import { JobExecutor } from '../JobExecutor';
import { JobScheduler } from '../JobScheduler';
import { JobApplication } from '../JobApplication';
import { FakeTimeVideoProcessor } from '../test-helpers/FakeTimeVideoProcessor';
import { FakeTimeVideoProcessorFactory } from '../test-helpers/FakeTimeVideoProcessorFactory';
import { FakeJobMetadataHelper } from '../test-helpers/FakeJobMetadataHelper';
import { FakeSentry } from '@irohalab/mira-shared/test-helpers/FakeSentry';
import { FakeDatabaseService } from '../test-helpers/FakeDatabaseService';
import { VideoProcessRule } from '../entity/VideoProcessRule';
import { ConvertAction } from '../domains/ConvertAction';
import { Action } from '../domains/Action';

const JOB_EXECUTOR = 'JOB_EXECUTOR';
const JOB_SCHEDULER = 'JOB_SCHEDULER';
const startAs = process.env.START_AS;
const execMode = process.env.EXEC_MODE;

const logger = getStdLogger();

const container = new Container();
container.bind<Sentry>(TYPES.Sentry).to(FakeSentry).inSingletonScope();

container.bind<ConfigManager>(TYPES.ConfigManager).to(ConfigManagerImpl).inSingletonScope();
container.bind<DatabaseService>(TYPES.DatabaseService).to(FakeDatabaseService).inSingletonScope();
container.bind<RabbitMQService>(TYPES.RabbitMQService).to(RascalImpl).inSingletonScope();
container.bind<FileManageService>(FileManageService).toSelf().inSingletonScope();

if (startAs === JOB_EXECUTOR) {
    container.bind<FakeTimeVideoProcessor>(FakeTimeVideoProcessor).toSelf();
    // factory provider
    container.bind<ProcessorFactoryInitiator>(TYPES_VM.ProcessorFactory).toFactory<VideoProcessor>(FakeTimeVideoProcessorFactory);
    // JobMetadataHelper
    container.bind<JobMetadataHelper>(TYPES_VM.JobMetadataHelper).to(FakeJobMetadataHelper);
    // JobManager and Auto factory
    container.bind<JobManager>(TYPES_VM.JobManager).to(JobManager);
    container.bind<interfaces.Factory<JobManager>>(TYPES_VM.JobManagerFactory).toAutoFactory<JobManager>(TYPES_VM.JobManager);
    // VertexManager and Auto factory
    container.bind<VertexManager>(TYPES_VM.VertexManager).to(VertexManagerImpl);
    container.bind<interfaces.Factory<VertexManager>>(TYPES_VM.VertexManagerFactory).toAutoFactory<VertexManager>(TYPES_VM.VertexManager);
    // JobExecutor
    container.bind<JobExecutor>(TYPES_VM.JobApplication).to(JobExecutor);
} else if (startAs === JOB_SCHEDULER) {
    container.bind<JobScheduler>(TYPES_VM.JobApplication).to(JobScheduler);
} else {
    logger.error('failed to start, START_AS environment variable is not valid');
    process.exit(-1);
}

const jobApplication = container.get<JobApplication>(TYPES_VM.JobApplication);
const databaseService = container.get<DatabaseService>(TYPES.DatabaseService);

databaseService.start()
    .then(async () => {
        await jobApplication.start();
        if (startAs === JOB_SCHEDULER) {
            const ruleRepo = databaseService.getVideoProcessRuleRepository();
            const vpr = new VideoProcessRule();
            vpr.priority = 10;
            vpr.bangumiId = '38a0553d-1cf9-4649-acff-17b1cb65425b';
            const a1 = new Action();
            const a2 = new Action();
            const a3 = new Action();
            a1.downstreamIds = [a3.id];
            a2.downstreamIds = [a3.id];
            a3.upstreamActionIds = [a1.id, a2.id];
            vpr.actions = {};
            vpr.actions[a1.id] = a1;
            vpr.actions[a2.id] = a2;
            vpr.actions[a3.id] = a3;
            await ruleRepo.save(vpr);
        }
    })
    .then(() => {
        logger.info(startAs.toLowerCase() + ' started');
    }, (error) => {
        logger.error(error);
        process.exit(-1);
    });

function beforeExitHandler() {
    jobApplication.stop()
        .then(() => {
            return databaseService.stop();
        })
        .then(() => {
            process.exit(0);
        }, (error) => {
            logger.error(error);
            process.exit(-1);
        });
}

process.on('SIGINT', beforeExitHandler);
process.on('SIGTERM', beforeExitHandler);
process.on('SIGHUP', beforeExitHandler);