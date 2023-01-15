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

import { FileManageService } from '../services/FileManageService';
import { inject, injectable } from 'inversify';
import { Sentry, TYPES } from '@irohalab/mira-shared';
import { ConfigManager } from '../utils/ConfigManager';
import { DatabaseService } from '../services/DatabaseService';
import { Job } from '../entity/Job';
import { JobRepository } from '../repository/JobRepository';
import { getStdLogger } from '../utils/Logger';
import { clearTimeout } from 'timers';
import { JobStatus } from '../domains/JobStatus';

const logger = getStdLogger();
const CHECK_INTERVAL = 3600 * 1000;

@injectable()
export class JobCleaner {
    private _jobExecutorId: string;
    private _checkCanceledJobsTimer: NodeJS.Timeout;
    private _checkCompleteJobsTimer: NodeJS.Timeout;
    private _checkErrorJobsTimer: NodeJS.Timeout;

    constructor(private _fileManageService: FileManageService,
                @inject(TYPES.DatabaseService) private _databaseService: DatabaseService,
                @inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.Sentry) private _sentry: Sentry) {
    }

    public async start(jobExecutorId: string): Promise<void> {
        this._jobExecutorId = jobExecutorId;
        this.checkCanceledJobs();
        this.checkCompleteJobs();
        this.checkErrorJobs();
    }

    public async stop(): Promise<void> {
        clearTimeout(this._checkCanceledJobsTimer);
        clearTimeout(this._checkCompleteJobsTimer);
        clearTimeout(this._checkErrorJobsTimer);
    }

    private checkCanceledJobs(): void {
        this._checkCanceledJobsTimer = setTimeout(async () => {
            try {
                await this.doCheckJobs(JobStatus.Canceled);
            } catch (ex) {
                logger.error(ex);
            }
            this.checkCanceledJobs();
        }, CHECK_INTERVAL + Math.round(Math.random() * 10 * 1000));
    }

    private checkCompleteJobs(): void {
        this._checkCompleteJobsTimer = setTimeout(async () => {
            try {
                await this.doCheckJobs(JobStatus.Finished);
            } catch (ex) {
                logger.error(ex);
            }
            this.checkCompleteJobs();
        }, CHECK_INTERVAL + Math.round(Math.random() * 10 * 1000));
    }

    private checkErrorJobs(): void {
        this._checkErrorJobsTimer = setTimeout(async () => {
            try {
                await this.doCheckJobs(JobStatus.UnrecoverableError);
            } catch (ex) {
                logger.error(ex);
            }
            this.checkErrorJobs();
        }, CHECK_INTERVAL + Math.round(Math.random() * 10 * 1000));
    }

    private async doCheckJobs(status: JobStatus): Promise<void> {
        const jobRepo = this._databaseService.getJobRepository();
        const expireTime = this._configManager.getJobExpireTime()[status] * 24 * 3600 * 1000;
        const jobs = await jobRepo.getExpiredJobsByStatusOfCurrentExecutor(this._jobExecutorId, status, expireTime);
        for (const job of jobs) {
            await this.cleanJob(job, jobRepo);
            logger.info(`job ${job.id} cleaned`);
        }
    }

    private async cleanJob(job: Job, jobRepo: JobRepository): Promise<void> {
        await this._fileManageService.cleanUpFiles(job.jobMessageId);
        const vertexRepo = this._databaseService.getVertexRepository();
        try {
            await vertexRepo.nativeDelete({jobId: job.id});
            await jobRepo.removeAndFlush(job);
        } catch (ex) {
            logger.error(ex);
            this._sentry.capture(ex);
        }

    }
}