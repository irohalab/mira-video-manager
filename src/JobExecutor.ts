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
import { CMD_CANCEL, CommandMessage } from './domains/CommandMessage';
import { JobRepository } from './repository/JobRepository';
import pino from 'pino';
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

const sleep = promisify(setTimeout);
const REMOVE_OLD_FILE_INTERVAL = 24 * 3600 * 1000;

const logger = pino();

@injectable()
export class JobExecutor implements JobApplication {
    public id: string;
    private currentJM: JobManager;
    private isIdle: boolean;
    private _cleanUpTimer: NodeJS.Timeout;

    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.Sentry) private _sentry: Sentry,
                @inject(TYPES.RabbitMQService) private _rabbitmqService: RabbitMQService,
                private _fileManageService: FileManageService,
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

        await this.resumeJob();
        this.removeOldFiles();

        await this._rabbitmqService.initPublisher(VIDEO_MANAGER_EXCHANGE, 'direct');
        await this._rabbitmqService.initConsumer(VIDEO_MANAGER_EXCHANGE, 'direct', COMMAND_QUEUE, VIDEO_MANAGER_COMMAND);
        await this._rabbitmqService.initConsumer(JOB_EXCHANGE, 'direct', JOB_QUEUE, '', true);
        await this._rabbitmqService.consume(JOB_QUEUE, this.onJobReceived.bind(this));
        await this._rabbitmqService.consume(COMMAND_QUEUE, this.onCommandReceived.bind(this));
    }

    public async stop(): Promise<void> {
        clearTimeout(this._cleanUpTimer);
        await this.pauseJob();
    }

    private async onJobReceived(msg: JobMessage): Promise<boolean> {
        if (this.isIdle) {
            const jobRepo = this._databaseService.getJobRepository();
            const job = await jobRepo.findOne({jobMessageId: msg.id});
            console.log(msg.id + ' message received');
            if (job) {
                this.processJob(job).then(() => console.log('job processed'), error => console.error(error));
                return true;
            }
            throw new Error('no job found in database');
        } else {
            await sleep(3000);
            return false;
        }
    }

    private async onCommandReceived(msg: CommandMessage): Promise<boolean> {
        const jobRepo = this._databaseService.getJobRepository();
        switch(msg.command) {
            case CMD_CANCEL:
                const job = await jobRepo.findOne({jobExecutorId: this.id, id: msg.jobId, status: JobStatus.Running});
                if (job) {
                    await this.cancelJob(job, jobRepo);
                    return true;
                }
                break;
            // no default
        }
        return false;
    }

    private async cancelJob(job: Job, jobRepo: JobRepository): Promise<void> {
        if (this.currentJM) {
            await this.currentJM.cancel();
        }
    }

    private async pauseJob(): Promise<void> {
        if (this.currentJM) {
            await this.currentJM.pause();
        }
    }

    private async resumeJob(): Promise<void> {
        const jobRepo = this._databaseService.getJobRepository();
        const job = await jobRepo.findOne({jobExecutorId: this.id, status: JobStatus.Pause});
        if (job) {
            this.processJob(job)
                .then(() => {
                    logger.info('job processed');
                }, (error) => {
                    logger.error(error);
                    this._sentry.capture(error);
                });
        }
    }

    private async processJob(job: Job): Promise<void> {
        this.isIdle = false;
        this.currentJM = this._jmFactory();
        this.currentJM.events.on(JobManager.EVENT_JOB_FINISHED, async (finishedJobId: string) => {
            // TODO: finish job
            // find all output path
            const outputVertices = await this._databaseService.getVertexRepository().getOutputVertices(finishedJobId);
            const outputPathList = outputVertices.map(vx => {
                return vx.outputPath;
            });
            await this.notifyFinished(job, outputPathList);
        });

        this.currentJM.events.on(JobManager.EVENT_JOB_FAILED, (failedJob: Job) => {
            // TODO: notify failed
        });
        try {
            await this.currentJM.start(job.id, this.id);
        } catch (error) {
            logger.error(error);
            this._sentry.capture(error);
        } finally {
            this.isIdle = true;
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

    private removeOldFiles(): void {
        this._cleanUpTimer = setTimeout(async () => {
            await this.doRemoveFiles();
            this.removeOldFiles();
        }, REMOVE_OLD_FILE_INTERVAL);
    }

    private async doRemoveFiles(): Promise<void> {
        console.log('start clean up files')
        const jobRepo = this._databaseService.getJobRepository();
        const successFullJobs = await jobRepo.getUncleanedFinishedJobs(this._configManager.fileRetentionDays());
        const failedJobs = await jobRepo.getUncleanedFailedJobs(this._configManager.failedFileRetentionDays());
        for (const job of successFullJobs) {
            await this._fileManageService.cleanUpFiles(job.jobMessageId);
            logger.info(`cleaned successful job ${job.id} files`);
        }
        for (const job of failedJobs) {
            await this._fileManageService.cleanUpFiles(job.jobMessageId);
            logger.info(`cleaned failed job ${job.id} files`);
        }
    }
}