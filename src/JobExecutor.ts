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

import { ConfigManager } from "./utils/ConfigManager";
import { inject, injectable, interfaces } from 'inversify';
import { TYPES_VM } from './TYPES';
import { JobMessage } from './domains/JobMessage';
import { DatabaseService } from './services/DatabaseService';
import { mkdir, stat } from 'fs/promises';
import { JobStatus } from './domains/JobStatus';
import { Job } from './entity/Job';
import { basename } from "path";
import { JobApplication } from './JobApplication';
import { promisify } from 'util';
import { FileManageService } from './services/FileManageService';
import { CMD_CANCEL, CMD_PAUSE, CommandMessage } from './domains/CommandMessage';
import { JobRepository } from './repository/JobRepository';
import {
    COMMAND_QUEUE,
    JOB_EXCHANGE,
    JOB_QUEUE,
    RabbitMQService,
    RemoteFile,
    Sentry,
    TYPES,
    VIDEO_MANAGER_COMMAND,
    VIDEO_MANAGER_EXCHANGE,
    VIDEO_MANAGER_GENERAL,
    VideoManagerMessage
} from '@irohalab/mira-shared';
import { JobManager } from './JobManager/JobManager';
import { randomUUID } from 'crypto';
import { getStdLogger } from './utils/Logger';
import { JobCleaner } from './JobManager/JobCleaner';

const logger = getStdLogger();

@injectable()
export class JobExecutor implements JobApplication {
    public id: string;
    private currentJM: JobManager;
    private isIdle: boolean;

    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.Sentry) private _sentry: Sentry,
                @inject(TYPES.RabbitMQService) private _rabbitmqService: RabbitMQService,
                private _fileManageService: FileManageService,
                private _jobCleaner: JobCleaner,
                @inject(TYPES.DatabaseService) private _databaseService: DatabaseService,
                @inject(TYPES_VM.JobManagerFactory) private _jmFactory: interfaces.AutoFactory<JobManager>) {
        this.isIdle = true;
    }

    public async start(): Promise<void> {
        const tmpDir = this._configManager.videoFileTempDir();
        let statObj = null;
        try {
            statObj = await stat(tmpDir)
        } catch (err) {
            if (err.code === 'ENOENT') {
                await mkdir(tmpDir, {recursive: true});
            } else {
                logger.error(err);
                this._sentry.capture(err);
            }
        }

        if (statObj && !statObj.isDirectory()) {
            throw new Error(tmpDir + 'exists but is not a directory');
        }

        this.id = await this._configManager.jobExecutorId();

        await this._jobCleaner.start(this.id);

        await this._rabbitmqService.initPublisher(VIDEO_MANAGER_EXCHANGE, 'direct', VIDEO_MANAGER_GENERAL);
        await this._rabbitmqService.initConsumer(VIDEO_MANAGER_EXCHANGE, 'direct', COMMAND_QUEUE, VIDEO_MANAGER_COMMAND);
        await this._rabbitmqService.initConsumer(JOB_EXCHANGE, 'direct', JOB_QUEUE, '', true);
        await this._rabbitmqService.consume(JOB_QUEUE, this.onJobReceived.bind(this));
        await this._rabbitmqService.consume(COMMAND_QUEUE, this.onCommandReceived.bind(this));
        await this.resumeJob();
    }

    public async stop(): Promise<void> {
        await this._jobCleaner.stop();
        await this.pauseJob();
    }

    private async onJobReceived(msg: JobMessage): Promise<boolean> {
        if (this.isIdle) {
            const jobRepo = this._databaseService.getJobRepository();
            const job = await jobRepo.findOne({jobMessageId: msg.id});
            logger.info(msg.id + ' message received');
            if (job && job.status === JobStatus.Queueing) {
                let resume = false;
                if (job.jobExecutorId && job.jobExecutorId === this.id) {
                    // this job is paused previously and ran on this JobExecutor instance
                    resume = true;
                } else if (job.jobExecutorId && job.jobExecutorId !== this.id) {
                    // this job is paused previously but ran on another JobExecutor instance
                    return false;
                } else {
                    // newly created job
                    resume = false;
                }
                try {
                    await this.processJob(job, resume);
                    logger.info('job processed');
                } catch (err) {
                    logger.error(err);
                    this._sentry.capture(err);
                }
                return true;
            } else if (!job) {
                // In this case, just do nothing and log error.
                const error = new Error('no job found in database');
                logger.error(error);
                this._sentry.capture(error);
            } else {
                // we don't process the other status Job.
                return false;
            }
        } else {
            return false;
        }
    }

    private async onCommandReceived(msg: CommandMessage): Promise<boolean> {
        const jobRepo = this._databaseService.getJobRepository();
        let job: Job;
        switch(msg.command) {
            case CMD_CANCEL:
                job = await jobRepo.getCurrentJobExecutorRunningJob(this.id, msg.jobId);
                if (job) {
                    await this.cancelJob(job, jobRepo);
                    return true;
                }
                break;
            case CMD_PAUSE:
                job = await jobRepo.getCurrentJobExecutorRunningJob(this.id, msg.jobId);
                if (job) {
                    await this.pauseJob();
                    return true;
                }
                break;
            default:
                logger.info(`${msg.command} command received, but not processed.`);
        }
        return false;
    }

    private async cancelJob(job: Job, jobRepo: JobRepository): Promise<void> {
        if (this.currentJM) {
            try {
                await this.currentJM.cancel();
                await this.finalizeJM();
            } catch (error) {
                logger.error(error);
                this._sentry.capture(error);
            }
        } else {
            // consider JM is exited before job status change. in this case, just update job status
            job.status = JobStatus.Canceled;
            job.jobExecutorId = null;
            await jobRepo.save(job);
        }
    }

    private async pauseJob(): Promise<void> {
        if (this.currentJM) {
            try {
                await this.currentJM.pause();
                await this.finalizeJM();
            } catch (error) {
                logger.error(error);
                this._sentry.capture(error);
            }
        }
    }

    private async resumeJob(): Promise<void> {
        try {
            const jobRepo = this._databaseService.getJobRepository();
            const job = await jobRepo.findOne({jobExecutorId: this.id, status: JobStatus.Pause});
            if (job) {
                await this.processJob(job, true);
                logger.info('job processed');
            }
        } catch (err) {
            logger.error(err);
            this._sentry.capture(err);
        }
    }

    private async processJob(job: Job, resume: boolean): Promise<void> {
        this.isIdle = false;
        this.currentJM = this._jmFactory();
        this.currentJM.events.on(JobManager.EVENT_JOB_FINISHED, async (finishedJobId: string) => {
            // find all output path
            try {
                const outputVertices = await this._databaseService.getVertexRepository().getOutputVertices(finishedJobId);
                const outputPathList = outputVertices.map(vx => {
                    return vx.outputPath;
                });
                await this.notifyFinished(job, outputPathList);
                await this.finalizeJM();
            } catch (err) {
                logger.error(err);
                this._sentry.capture(err);
            }
        });

        this.currentJM.events.on(JobManager.EVENT_JOB_FAILED, async (failedJob: Job) => {
            // TODO: notify failed
            try {
                await this.finalizeJM();
            } catch (err) {
                logger.error(err);
                this._sentry.capture(err);
            }
        });
        try {
            await this.currentJM.start(job.id, this.id, resume);
        } catch (error) {
            logger.error(error);
            this._sentry.capture(error);
        }
    }

    // private static async normalizeFilename(originalFilename: string, outputPath: string): Promise<string> {
    //     const ext = extname(originalFilename);
    //     const originalBasename = basename(originalFilename, ext);
    //     const outputPathDir = dirname(outputPath);
    //     const normalizedOutputPath = join(outputPathDir, originalBasename + extname(outputPath));
    //     await rename(outputPath, normalizedOutputPath);
    //     return normalizedOutputPath;
    // }

    private async notifyFinished(job: Job, outputFilePathList: string[]): Promise<void> {
        const msg = new VideoManagerMessage();
        msg.id = randomUUID();
        msg.processedFiles = outputFilePathList.map((outputFilePath) => {
            const remoteFile = new RemoteFile();
            remoteFile.filename = basename(outputFilePath);
            remoteFile.fileLocalPath = outputFilePath;
            remoteFile.fileUri = this._configManager.getFileUrl(remoteFile.filename, job.jobMessageId);
            return remoteFile;
        });
        msg.jobExecutorId = this.id;
        msg.bangumiId = job.jobMessage.bangumiId;
        msg.videoId = job.jobMessage.videoId;
        msg.downloadTaskId = job.jobMessage.downloadTaskId;
        msg.isProcessed = true;
        if (await this._rabbitmqService.publish(VIDEO_MANAGER_EXCHANGE, VIDEO_MANAGER_GENERAL, msg)) {
            // TODO: do something
            logger.info('TODO: after published to VIDEO_MANAGER_EXCHANGE');
        }
    }

    private async finalizeJM(): Promise<void> {
        if (this.currentJM) {
            this.currentJM.events.removeAllListeners();
            await this.currentJM.dispose();
            this.currentJM = null;
        }
        this.isIdle = true;
    }
}