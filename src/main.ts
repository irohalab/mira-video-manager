/*
 * Copyright 2021 IROHA LAB
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
import { setup as setupSentry } from './utils/sentry';
import { hostname } from 'os';
import { Container } from 'inversify';
import { LocalConvertProcessor } from './processors/LocalConvertProcessor';
import { TYPES } from './TYPES';
import { ConfigManager } from './utils/ConfigManager';
import { ConfigManagerImpl } from './utils/ConfigManagerImpl';
import { RabbitMQService } from './services/RabbitMQService';
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

const JOB_EXECUTOR = 'JOB_EXECUTOR';
const JOB_SCHEDULER = 'JOB_SCHEDULER';
const startAs = process.env.START_AS;

setupSentry(`${startAs}_${hostname()}`);

const container = new Container();

container.bind<LocalConvertProcessor>(TYPES.LocalConvertProcessor).to(LocalConvertProcessor);
container.bind<ConfigManager>(TYPES.ConfigManager).to(ConfigManagerImpl).inSingletonScope();
container.bind<DatabaseService>(TYPES.DatabaseService).to(DatabaseServiceImpl).inSingletonScope();
container.bind<RabbitMQService>(RabbitMQService).toSelf().inSingletonScope();
container.bind<FileManageService>(FileManageService).toSelf().inSingletonScope();

// factory provider
container.bind<ProcessorFactoryInitiator>(TYPES.ProcessorFactory).toFactory<VideoProcessor>(ProcessorFactory);
container.bind<ProfileFactoryInitiator>(TYPES.ProfileFactory).toFactory<BaseProfile>(ProfileFactory);

if (startAs === JOB_EXECUTOR) {
    container.bind<JobExecutor>(TYPES.JobApplication).to(JobExecutor);
} else if (startAs === JOB_SCHEDULER) {
    container.bind<JobScheduler>(TYPES.JobApplication).to(JobScheduler);
} else {
    console.error('failed to start, START_AS environment variable is not valid');
    process.exit(-1);
}

const jobApplication = container.get<JobApplication>(TYPES.JobApplication);
const databaseService = container.get<DatabaseService>(TYPES.DatabaseService);

databaseService.start()
    .then(() => {
        return jobApplication.start();
    })
    .then(() => {
        console.log(startAs.toLowerCase() + ' started');
    }, (error) => {
        console.error(error);
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
            console.error(error);
            process.exit(-1);
        });
}

process.on('SIGINT', beforeExitHandler);
process.on('SIGTERM', beforeExitHandler);
process.on('SIGHUP', beforeExitHandler);