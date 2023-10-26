/*
 * Copyright 2023 IROHA LAB
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

import { inject, injectable, interfaces } from 'inversify';
import { Sentry, TYPES } from '@irohalab/mira-shared';
import { DatabaseService } from '../services/DatabaseService';
import { ConfigManager } from '../utils/ConfigManager';
import { Job } from '../entity/Job';
import { JobStatus } from '../domains/JobStatus';
import { join } from 'path';
import { getFileLogger, LOG_END_FLAG } from '../utils/Logger';
import pino from 'pino';
import { TYPES_VM } from '../TYPES';
import { VertexStatus } from '../domains/VertexStatus';
import { EventEmitter } from 'events';
import { EVENT_VERTEX_FAIL, TERMINAL_VERTEX_FINISHED, VERTEX_MANAGER_LOG, VertexManager } from './VertexManager';
import { FileManageService } from '../services/FileManageService';
import { JobMessage } from '../domains/JobMessage';
import { JobMetadataHelper } from './JobMetadataHelper';

@injectable()
export class JobManager {
    public static EVENT_JOB_FINISHED = 'job_finished';
    public static EVENT_JOB_FAILED = 'job_failed';
    public events = new EventEmitter();
    private _job: Job;
    private _logPath: string;
    private _jobLogger: pino.Logger;
    private _vm: VertexManager;

    constructor(@inject(TYPES.DatabaseService) private _databaseService: DatabaseService,
                @inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES_VM.VertexManagerFactory) private _vmFactory: interfaces.AutoFactory<VertexManager>,
                private _fileManager: FileManageService,
                @inject(TYPES_VM.JobMetadataHelper) private _metaDataHelper: JobMetadataHelper,
                @inject(TYPES.Sentry) private _sentry: Sentry) {
    }

    /**
     * Start to running a job
     * @param jobId job id
     * @param jobExecutorId the JobExecutor instance id start this JobManager
     * @param resume if the job is previously paused
     */
    public async start(jobId: string, jobExecutorId: string, resume: boolean): Promise<void> {
        const jobRepo = this._databaseService.getJobRepository();
        this._vm = this._vmFactory();
        this._job = await jobRepo.findOne({id: jobId});
        this._job.jobExecutorId = jobExecutorId;
        // set log path
        this._logPath = join(this._configManager.jobLogPath(), this._job.id);
        const jobLogFilePath = join(this._logPath, 'job-log.json');
        this._jobLogger = getFileLogger(jobLogFilePath);

        if (this._job.status === JobStatus.Queueing && !resume) {
            this._jobLogger.info('creating vertices');
            await this._vm.createAllVertices(this._job);
        } else {
            await this._vm.recreateCanceledVertices(this._job);
        }

        if (!this._job.startTime) {
            this._job.startTime = new Date();
        }

        this._job.status = JobStatus.Running;
        this._job = await jobRepo.save(this._job) as Job;

        // register event listeners
        this._vm.events.on(VERTEX_MANAGER_LOG, ({level, message}: {level: string, message: any}) => {
            if (level === 'error') {
                this._jobLogger.error(message);
            } else if (level === 'info') {
                this._jobLogger.info(message);
            } else if (level === 'warn') {
                this._jobLogger.warn(message);
            }
        });

        this._vm.events.on(EVENT_VERTEX_FAIL, async (error) => {
            try {
                this._jobLogger.error(error);
                this._job.status = JobStatus.UnrecoverableError;
                this._job = await jobRepo.save(this._job) as Job;
                this.events.emit(JobManager.EVENT_JOB_FAILED, this._job.id);
                this._jobLogger.error('Job failed with vertex failure');
                this._jobLogger.info(LOG_END_FLAG);
            } catch (err) {
                this._jobLogger.error(err);
                this._jobLogger.info(LOG_END_FLAG);
                this._sentry.capture(err);
                this.events.emit(JobManager.EVENT_JOB_FAILED, this._job.id);
            }
        });

        this._vm.events.on(TERMINAL_VERTEX_FINISHED, async () => {
            try {
                const vertexRepo = this._databaseService.getVertexRepository();
                const vertexMap = await vertexRepo.getVertexMap(this._job.id);
                const allVerticesFinished = Object.keys(vertexMap).every((vertexId: string) => {
                    return vertexMap[vertexId].status === VertexStatus.Finished;
                });
                if (allVerticesFinished) {
                    this._job.status = JobStatus.MetaData;
                    this._job = await jobRepo.save(this._job) as Job;
                    this._job.metadata = await this._metaDataHelper.processMetaData(vertexMap, this._jobLogger);
                    this._job.status = JobStatus.Finished;
                    this._job.finishedTime = new Date();
                    this._job = await jobRepo.save(this._job) as Job;
                    this.events.emit(JobManager.EVENT_JOB_FINISHED, this._job.id);
                    this._jobLogger.info('Job finished successfully!');
                    this._jobLogger.info(LOG_END_FLAG);
                }
            } catch (error) {
                this._jobLogger.error(error);
                this._jobLogger.info(LOG_END_FLAG);
                this._sentry.capture(error);
                this.events.emit(JobManager.EVENT_JOB_FAILED, this._job.id);
            }
        });

        this._jobLogger.info('start running');
        if (await this.prepareFiles(this._job.jobMessage)) {
            this._jobLogger.info('Files Downloaded');
            await this._vm.start(this._job, this._logPath);
        }
    }

    /**
     * Cancel current running job if possible
     */
    public async cancel(): Promise<void> {
        if (this._job && this._job.status === JobStatus.Running) {
            const jobRepo = this._databaseService.getJobRepository();
            this._job.status = JobStatus.Canceled;
            this._job.jobExecutorId = null;
            this._job = await jobRepo.save(this._job) as Job;
            await this._vm.stop(this._job.id);
            this._jobLogger.warn('job canceled');
            this._jobLogger.info(LOG_END_FLAG);
        }
    }

    /**
     * Pause current running job if possible
     */
    public async pause(): Promise<void> {
        if (this._job && this._job.status === JobStatus.Running) {
            this._jobLogger.info('trying to pause job.');
            const jobRepo = this._databaseService.getJobRepository();
            this._job.status = JobStatus.Pause;
            this._job = await jobRepo.save(this._job) as Job;
            await this._vm.stop(this._job.id);
            this._jobLogger.info('job paused.');
            this._jobLogger.info(LOG_END_FLAG);
        }
        return null;
    }

    public async dispose(): Promise<void> {
        if (this._vm) {
            await this._vm.stop();
            this._vm.events.removeAllListeners();
            this._vm = null;
        }
        // clean up
    }

    private async prepareFiles(jobMessage: JobMessage): Promise<boolean> {
        try {
            this._jobLogger.info(`Checking videoFile ${jobMessage.videoFile.filename} existence`);
            if (!await this._fileManager.checkExists(jobMessage.videoFile.filename, jobMessage.id)) {
                this._jobLogger.info(`videoFile ${jobMessage.videoFile.filename} not found, start downloading`);
                await this._fileManager.downloadFile(jobMessage.videoFile, jobMessage.downloadAppId, jobMessage.id);
            }
            if (jobMessage.otherFiles && jobMessage.otherFiles.length > 0) {
                for (const remoteFile of jobMessage.otherFiles) {
                    this._jobLogger.info(`Checking otherFiles ${remoteFile.filename} existence`);
                    if (!await this._fileManager.checkExists(remoteFile.filename, jobMessage.id)) {
                        this._jobLogger.info(`otherFiles ${remoteFile.filename} not found, start downloading`);
                        await this._fileManager.downloadFile(remoteFile, jobMessage.downloadAppId, jobMessage.id);
                    }
                }
            }
            return true;
        } catch (err) {
            this._sentry.capture(err);
            this._jobLogger.error(err);
            this._job.status = JobStatus.UnrecoverableError;
            await this._databaseService.getJobRepository().save(this._job);
            this.events.emit(JobManager.EVENT_JOB_FAILED, this._job.id);
            return false;
        }
    }
}