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

// there are two mode for this application, either JobScheduler mode or Job Executor mode
// JobScheduler mode schedule and update job status, dispatch job to executor
// JobExecutor mode grab job from queue, executing job, update executing state.

import 'reflect-metadata';
import { hostname } from 'os';
import { Container, interfaces } from 'inversify';
import { LocalConvertProcessor } from './processors/LocalConvertProcessor';
import { ConfigManager } from './utils/ConfigManager';
import { ConfigManagerImpl } from './utils/ConfigManagerImpl';
import { ProcessorFactory, ProcessorFactoryInitiator } from './processors/ProcessorFactory';
import { VideoProcessor } from './processors/VideoProcessor';
import { ProfileFactory, ProfileFactoryInitiator } from './processors/profiles/ProfileFactory';
import { BaseProfile } from './processors/profiles/BaseProfile';
import { FileManageService } from './services/FileManageService';
import { JobExecutor } from './JobExecutor';
import { JobScheduler } from './JobScheduler';
import { JobApplication } from './JobApplication';
import { DatabaseServiceImpl } from './services/DatabaseServiceImpl';
import { DatabaseService } from './services/DatabaseService';
import { RabbitMQService, Sentry, SentryImpl, TYPES } from '@irohalab/mira-shared';
import { EXEC_MODE_META, TYPES_VM } from './TYPES';
import { JobManager } from './JobManager/JobManager';
import { VertexManager } from './JobManager/VertexManager';
import { VertexManagerImpl } from './JobManager/VertexManagerImpl';
import { LocalExtractProcessor } from './processors/LocalExtractProcessor';
import { RascalImpl } from '@irohalab/mira-shared/services/RascalImpl';
import { Extractor } from './processors/extractors/Extractor';
import { ExtractorFactory, ExtractorInitiator } from './processors/ExtractorFactory';
import { getStdLogger } from './utils/Logger';
import { JobCleaner } from './JobManager/JobCleaner';
import { LocalVideoValidateProcessor } from './processors/LocalVideoValidateProcessor';
import { JobMetadataHelper } from './JobManager/JobMetadataHelper';
import { JobMetadataHelperImpl } from './JobManager/JobMetadataHelperImpl';

const JOB_EXECUTOR = 'JOB_EXECUTOR';
const JOB_SCHEDULER = 'JOB_SCHEDULER';
const startAs = process.env.START_AS;
const execMode = process.env.EXEC_MODE;

const logger = getStdLogger();

const container = new Container();
// tslint:disable-next-line
const { version } = require('../package.json');
container.bind<Sentry>(TYPES.Sentry).to(SentryImpl).inSingletonScope();
const sentry = container.get<Sentry>(TYPES.Sentry);
sentry.setup(`${startAs}_${hostname()}`, 'mira-video-manager', version);

container.bind<ConfigManager>(TYPES.ConfigManager).to(ConfigManagerImpl).inSingletonScope();
container.bind<DatabaseService>(TYPES.DatabaseService).to(DatabaseServiceImpl).inSingletonScope();
container.bind<RabbitMQService>(TYPES.RabbitMQService).to(RascalImpl).inSingletonScope();
container.bind<FileManageService>(FileManageService).toSelf().inSingletonScope();

if (startAs === JOB_EXECUTOR) {
    if (execMode === EXEC_MODE_META) {
        // VideoProcessor
        container.bind<LocalVideoValidateProcessor>(TYPES_VM.LocalValidateProcessor).to(LocalVideoValidateProcessor);
        // factory provider
        container.bind<ProcessorFactoryInitiator>(TYPES_VM.ProcessorFactory).toFactory<VideoProcessor>(ProcessorFactory);
    } else {
        // VideoProcessor
        container.bind<LocalConvertProcessor>(TYPES_VM.LocalConvertProcessor).to(LocalConvertProcessor);
        container.bind<LocalExtractProcessor>(TYPES_VM.LocalExtractProcessor).to(LocalExtractProcessor);
        // factory provider
        container.bind<ProcessorFactoryInitiator>(TYPES_VM.ProcessorFactory).toFactory<VideoProcessor>(ProcessorFactory);
        container.bind<ProfileFactoryInitiator>(TYPES_VM.ProfileFactory).toFactory<BaseProfile>(ProfileFactory);
        container.bind<ExtractorInitiator>(TYPES_VM.ExtractorFactory).toFactory<Extractor>(ExtractorFactory);
    }
    // JobMetadataHelper
    container.bind<JobMetadataHelper>(TYPES_VM.JobMetadataHelper).to(JobMetadataHelperImpl);
    // JobManager and Auto factory
    container.bind<JobManager>(TYPES_VM.JobManager).to(JobManager);
    container.bind<interfaces.Factory<JobManager>>(TYPES_VM.JobManagerFactory).toAutoFactory<JobManager>(TYPES_VM.JobManager);
    // VertexManager and Auto factory
    container.bind<VertexManager>(TYPES_VM.VertexManager).to(VertexManagerImpl);
    container.bind<interfaces.Factory<VertexManager>>(TYPES_VM.VertexManagerFactory).toAutoFactory<VertexManager>(TYPES_VM.VertexManager);
    // JobCleaner
    container.bind<JobCleaner>(JobCleaner).toSelf().inSingletonScope();
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
let jobCleaner: JobCleaner | undefined;
if (startAs === JOB_EXECUTOR) {
    jobCleaner = container.get<JobCleaner>(JobCleaner);
}

databaseService.start()
    .then(async () => {
        await jobApplication.start();
        if (startAs === JOB_EXECUTOR) {
            const jobExecutorId = (jobApplication as JobExecutor).id;
            await jobCleaner.start(jobExecutorId);
        }
    })
    .then(() => {
        logger.info(startAs.toLowerCase() + ' started');
    }, (error) => {
        sentry.capture(error);
        logger.error(error);
        process.exit(-1);
    });

function beforeExitHandler() {
    jobApplication.stop()
        .then(async () => {
            if (startAs === JOB_EXECUTOR) {
                await jobCleaner.stop();
            }
            await databaseService.stop();
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