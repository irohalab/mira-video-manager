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

/* tslint:disable:no-string-literal */
import test from 'ava';
import 'reflect-metadata';
import { Container, interfaces } from 'inversify';
import { ConfigManager } from '../utils/ConfigManager';
import { Sentry, TYPES } from '@irohalab/mira-shared';
import { FakeConfigManager } from '../test-helpers/FakeConfigManager';
import { DatabaseService } from '../services/DatabaseService';
import { FakeDatabaseService } from '../test-helpers/FakeDatabaseService';
import { TYPES_VM } from '../TYPES';
import { VertexManager } from './VertexManager';
import { FakeVertexManager } from '../test-helpers/FakeVertexManager';
import { JobStatus } from '../domains/JobStatus';
import { createJob, projectRoot } from '../test-helpers/helpers';
import { join } from 'path';
import { JobManager } from './JobManager';
import { FakeJobRepository } from '../test-helpers/FakeJobRepository';
import { FakeVertexRepository } from '../test-helpers/FakeVertexRepository';
import { FakeJobMetadataHelper } from '../test-helpers/FakeJobMetadataHelper';
import { JobMetadataHelper } from './JobMetadataHelper';
import { FakeSentry } from '../test-helpers/FakeSentry';
import { FileManageService } from '../services/FileManageService';

type Cxt = { container: Container };

test.beforeEach((t) => {
    const context = t.context as Cxt;
    const container = new Container({ autoBindInjectable: true });
    context.container = container;
    container.bind<ConfigManager>(TYPES.ConfigManager).to(FakeConfigManager).inSingletonScope();
    container.bind<DatabaseService>(TYPES.DatabaseService).to(FakeDatabaseService).inSingletonScope();
    container.bind<VertexManager>(TYPES_VM.VertexManager).to(FakeVertexManager);
    container.bind<JobManager>(JobManager).toSelf();
    container.bind<interfaces.Factory<VertexManager>>(TYPES_VM.VertexManagerFactory).toAutoFactory<VertexManager>(FakeVertexManager);
    container.bind<JobMetadataHelper>(TYPES_VM.JobMetadataHelper).to(FakeJobMetadataHelper).inSingletonScope();
    container.bind<Sentry>(TYPES.Sentry).to(FakeSentry);
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    (configManager as FakeConfigManager).profilePath = join(projectRoot, 'temp/job-manager');
});

test.afterEach(async (t) => {
    const context = t.context as Cxt;
    const container = context.container;
    const dbService = container.get<DatabaseService>(TYPES.DatabaseService);
    const jobRepo = dbService.getJobRepository() as FakeJobRepository;
    jobRepo.reset();
    const vxRepo = dbService.getVertexRepository() as FakeVertexRepository;
    vxRepo.reset();
});

test.serial('Should run the job and manage lifecycle of a job', async (t) => {
    const context = t.context as Cxt;
    const container = context.container;
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    const dbService = container.get<DatabaseService>(TYPES.DatabaseService);
    const jm = container.get<JobManager>(JobManager);
    const jobExecutorId = await configManager.jobExecutorId();
    const job = createJob(jobExecutorId, JobStatus.Queueing);
    const jobRepo = dbService.getJobRepository();
    await jobRepo.save(job);

    await jm.start(job.id, await configManager.jobExecutorId(), false);
    const vx = jm['_vm'] as FakeVertexManager;
    t.truthy(vx._job, '_job should not null after jm start');
    t.true(vx.vxCreated, 'vertices should be created by calling VertexManager.createAllVertices(job)');
    t.true(vx._job.status === JobStatus.Running, '_job.status should be JobStatus.Running');

    await new Promise((resolve, reject) => {
        jm.events.on(JobManager.EVENT_JOB_FINISHED, (jobId: string) => {
            t.pass('after job finished, this event should be emitted');
            resolve(true);
        });
        jm.events.on(JobManager.EVENT_JOB_FAILED, (jobId: string) => {
            reject('Job Failed');
        });
        vx.completeAllVertices();
    });
    const jobUpdated = await jobRepo.findOne({id: job.id});
    t.true(jobUpdated.status === JobStatus.Finished, 'job status should be JobStatus.Finished after job is complete');
    t.plan(5);
});

test.serial('Should set the job to UnrecoverableError status after vertex fail', async (t) => {
    const context = t.context as Cxt;
    const container = context.container;
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    const dbService = container.get<DatabaseService>(TYPES.DatabaseService);
    const jm = container.get<JobManager>(JobManager);
    const jobExecutorId = await configManager.jobExecutorId();
    const job = createJob(jobExecutorId, JobStatus.Queueing);
    const jobRepo = dbService.getJobRepository();
    await jobRepo.save(job);

    await jm.start(job.id, await configManager.jobExecutorId(), false);
    const vx = jm['_vm'] as FakeVertexManager;
    t.truthy(vx._job, '_job should not null after jm start');
    t.true(vx._job.status === JobStatus.Running, '_job.status should be JobStatus.Running');

    await new Promise((resolve, reject) => {
        jm.events.on(JobManager.EVENT_JOB_FINISHED, (jobId: string) => {
            reject(false);
        });
        jm.events.on(JobManager.EVENT_JOB_FAILED, (jobId: string) => {
            t.pass('after job failed, this event should be emitted');
            resolve(true);
        });
        vx.failAnyVertex();
    });
    const jobUpdated = await jobRepo.findOne({id: job.id});
    t.true(jobUpdated.status === JobStatus.UnrecoverableError, 'job status should be JobStatus.UnrecoverableError after job is complete');
    t.plan(4);
});

test.serial('Should call VertexManager.cancelVertices() when cancelling job', async (t) => {
    const context = t.context as Cxt;
    const container = context.container;
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    const dbService = container.get<DatabaseService>(TYPES.DatabaseService);
    const jm = container.get<JobManager>(JobManager);
    const jobExecutorId = await configManager.jobExecutorId();
    const job = createJob(jobExecutorId, JobStatus.Queueing);
    const jobRepo = dbService.getJobRepository();
    await jobRepo.save(job);

    await jm.start(job.id, await configManager.jobExecutorId(), false);
    const vx = jm['_vm'] as FakeVertexManager;
    t.true(vx._job.status === JobStatus.Running, '_job.status should be JobStatus.Running');
    await jm.cancel();
    t.true(vx._job.status === JobStatus.Canceled, '_job.status should be JobStatus.Canceled');
    t.true(vx.vxCanceled, 'VertexManager.cancelVertices() should be called');
});

test.serial('Should finalize job only once when multiple terminal vertices finish concurrently', async (t) => {
    const context = t.context as Cxt;
    const container = context.container;
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    const dbService = container.get<DatabaseService>(TYPES.DatabaseService);
    const metaHelper = container.get<JobMetadataHelper>(TYPES_VM.JobMetadataHelper);
    const jm = container.get<JobManager>(JobManager);
    const jobExecutorId = await configManager.jobExecutorId();
    const job = createJob(jobExecutorId, JobStatus.Queueing);
    const jobRepo = dbService.getJobRepository();
    const vxRepo = dbService.getVertexRepository();
    await jobRepo.save(job);

    let processMetaCount = 0;
    const origProcessMeta = metaHelper.processMetaData.bind(metaHelper);
    metaHelper.processMetaData = async (vertexMap, logger) => {
        processMetaCount++;
        await new Promise(r => setTimeout(r, 20));
        return origProcessMeta(vertexMap, logger);
    };

    const origGetVertexMap = vxRepo.getVertexMap.bind(vxRepo);
    vxRepo.getVertexMap = async (jobId: string) => {
        await new Promise(r => setTimeout(r, 20));
        return origGetVertexMap(jobId);
    };

    await jm.start(job.id, jobExecutorId, false);
    const vx = jm['_vm'] as FakeVertexManager;

    let finishedEventCount = 0;
    await new Promise<void>((resolve, reject) => {
        jm.events.on(JobManager.EVENT_JOB_FINISHED, () => {
            finishedEventCount++;
            setTimeout(resolve, 40);
        });
        jm.events.on(JobManager.EVENT_JOB_FAILED, reject);
        // Simulate two terminal vertices finishing nearly simultaneously across async DB reads
        vx.completeAllVertices();
        vx.completeAllVertices();
    });

    t.is(processMetaCount, 1);
    t.is(finishedEventCount, 1);
});

test.serial('Should immediately stop VertexManager and emit failure once when vertex fails', async (t) => {
    const context = t.context as Cxt;
    const container = context.container;
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    const dbService = container.get<DatabaseService>(TYPES.DatabaseService);
    const jm = container.get<JobManager>(JobManager);
    const jobExecutorId = await configManager.jobExecutorId();
    const job = createJob(jobExecutorId, JobStatus.Queueing);
    await dbService.getJobRepository().save(job);

    await jm.start(job.id, jobExecutorId, false);
    const vx = jm['_vm'] as FakeVertexManager;

    let failEventCount = 0;
    await new Promise<void>((resolve) => {
        jm.events.on(JobManager.EVENT_JOB_FAILED, () => {
            failEventCount++;
            setTimeout(resolve, 30);
        });
        vx.failAnyVertex();
        vx.failAnyVertex();
    });

    t.true(vx.vxCanceled, 'VertexManager.stop() should be called immediately on vertex failure');
    t.is(failEventCount, 1);
});

test.serial('Should not start VertexManager if job is canceled while prepareFiles is downloading', async (t) => {
    const context = t.context as Cxt;
    const container = context.container;
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    const dbService = container.get<DatabaseService>(TYPES.DatabaseService);
    const fileManager = container.get<FileManageService>(FileManageService);
    let releaseDownload: () => void;
    const downloadGate = new Promise<void>((resolve) => {
        releaseDownload = resolve;
    });
    fileManager.checkExists = async () => false;
    fileManager.downloadFile = async () => {
        await downloadGate;
        return '';
    };
    container.rebind<FileManageService>(FileManageService).toConstantValue(fileManager);

    const jm = container.get<JobManager>(JobManager);
    const jobExecutorId = await configManager.jobExecutorId();
    const job = createJob(jobExecutorId, JobStatus.Queueing);
    await dbService.getJobRepository().save(job);

    const startPromise = jm.start(job.id, jobExecutorId, false);
    await new Promise(r => setTimeout(r, 20));
    await jm.cancel();
    releaseDownload();
    await startPromise;

    const vx = jm['_vm'] as FakeVertexManager;
    t.falsy(vx._job, 'VertexManager.start() should not be called after job was canceled during prepareFiles');
});


