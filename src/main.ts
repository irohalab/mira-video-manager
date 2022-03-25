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

// there are two mode for this application, either JobScheduler mode or Job Executor mode
// JobScheduler mode schedule and update job status, dispatch job to executor
// JobExecutor mode grab job from queue, executing job, update executing state.

import 'reflect-metadata';
import { hostname } from 'os';
import { Container } from 'inversify';
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
import pino from 'pino';
import { RabbitMQService, Sentry, TYPES } from '@irohalab/mira-shared';
import { SentryImpl } from './utils/Sentry';
import { TYPES_VM } from './TYPES';

const JOB_EXECUTOR = 'JOB_EXECUTOR';
const JOB_SCHEDULER = 'JOB_SCHEDULER';
const startAs = process.env.START_AS;

const logger = pino();

const container = new Container();

container.bind<Sentry>(TYPES.Sentry).to(SentryImpl).inSingletonScope();
container.bind<LocalConvertProcessor>(TYPES_VM.LocalConvertProcessor).to(LocalConvertProcessor);
container.bind<ConfigManager>(TYPES.ConfigManager).to(ConfigManagerImpl).inSingletonScope();
container.bind<DatabaseService>(TYPES.DatabaseService).to(DatabaseServiceImpl).inSingletonScope();
container.bind<RabbitMQService>(RabbitMQService).toSelf().inSingletonScope();
container.bind<FileManageService>(FileManageService).toSelf().inSingletonScope();

// factory provider
container.bind<ProcessorFactoryInitiator>(TYPES_VM.ProcessorFactory).toFactory<VideoProcessor>(ProcessorFactory);
container.bind<ProfileFactoryInitiator>(TYPES_VM.ProfileFactory).toFactory<BaseProfile>(ProfileFactory);

if (startAs === JOB_EXECUTOR) {
    container.bind<JobExecutor>(TYPES_VM.JobApplication).to(JobExecutor);
} else if (startAs === JOB_SCHEDULER) {
    container.bind<JobScheduler>(TYPES_VM.JobApplication).to(JobScheduler);
} else {
    logger.error('failed to start, START_AS environment variable is not valid');
    process.exit(-1);
}
const sentry = container.get<Sentry>(TYPES.Sentry);
sentry.setup(`${startAs}_${hostname()}`)

const jobApplication = container.get<JobApplication>(TYPES_VM.JobApplication);
const databaseService = container.get<DatabaseService>(TYPES.DatabaseService);

databaseService.start()
    .then(() => {
        return jobApplication.start();
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