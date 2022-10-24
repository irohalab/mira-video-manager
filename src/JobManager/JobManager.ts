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
import { Vertex } from '../entity/Vertex';
import { VertexStatus } from '../domains/VertexStatus';
import { EventEmitter } from 'events';
import { EVENT_VERTEX_FAIL, TERMINAL_VERTEX_FINISHED, VERTEX_MANAGER_LOG, VertexManager } from './VertexManager';

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
                @inject(TYPES.Sentry) private _sentry: Sentry) {
    }

    public async start(jobId: string, jobExecutorId: string): Promise<void> {
        const jobRepo = this._databaseService.getJobRepository();
        this._vm = this._vmFactory();
        this._job = await jobRepo.findOne({id: jobId});
        this._job.jobExecutorId = jobExecutorId;
        // set log path
        this._logPath = join(this._configManager.jobLogPath(), this._job.id);
        this._jobLogger = getFileLogger(join(this._logPath, 'job-log.json'));

        if (this._job.status === JobStatus.Queueing) {
            this._jobLogger.info('creating vertices');
            await this._vm.createAllVertices(this._job);
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
            }
        });

        this._jobLogger.info('start running');
        await this._vm.start(this._job, this._logPath);
    }

    /**
     * Cancel current running job if possible
     */
    public async cancel(): Promise<void> {
        if (this._job && this._job.status === JobStatus.Running) {
            const jobRepo = this._databaseService.getJobRepository();
            this._job.status = JobStatus.Canceled;
            this._job = await jobRepo.save(this._job) as Job;
            await this._vm.cancelVertices();
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
            await this._vm.cancelVertices();
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
}