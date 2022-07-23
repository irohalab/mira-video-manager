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
import { inject, injectable } from 'inversify';
import { TYPES_VM } from './TYPES';
import { JobMessage } from './domains/JobMessage';
import { DatabaseService } from './services/DatabaseService';
import { VideoProcessor } from './processors/VideoProcessor';
import { mkdir, rename, stat } from 'fs/promises';
import { JobStatus } from './domains/JobStatus';
import { Job } from './entity/Job';
import { Action } from './domains/Action';
import { ProcessorFactoryInitiator } from './processors/ProcessorFactory';
import { JobState } from './domains/JobState';
import { v4 as uuidv4 } from 'uuid';
import { basename, dirname, extname, join } from "path";
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
import { findFinalActionsId, reverseTraverse } from './utils/ActionDAGUtils';

const sleep = promisify(setTimeout);
const REMOVE_OLD_FILE_INTERVAL = 24 * 3600 * 1000;

const logger = pino();

@injectable()
export class JobExecutor implements JobApplication {
    public id: string;
    private currentVideoProcessor: VideoProcessor;
    private isIdle: boolean;
    private _cleanUpTimer: NodeJS.Timeout;

    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.Sentry) private _sentry: Sentry,
                private _rabbitmqService: RabbitMQService,
                private _fileManageService: FileManageService,
                @inject(TYPES.DatabaseService) private _databaseService: DatabaseService,
                @inject(TYPES_VM.ProcessorFactory) private _processorFactory: ProcessorFactoryInitiator) {
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
                job.status = JobStatus.Running;
                job.startTime = new Date();
                await jobRepo.save(job);
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
        job.status = JobStatus.Canceled;
        await jobRepo.save(job);
        await this.currentVideoProcessor.cancel();
        this.currentVideoProcessor = null;
    }

    private async pauseJob(): Promise<void> {
        const jobRepo = this._databaseService.getJobRepository();
        const job = await jobRepo.findOne({jobExecutorId: this.id, status: JobStatus.Running});
        if (job) {
            job.status = JobStatus.Pause;
            // try cancel current processor
            await this.currentVideoProcessor.cancel();
        }
    }

    private async resumeJob(): Promise<void> {
        const jobRepo = this._databaseService.getJobRepository();
        const job = await jobRepo.findOne({jobExecutorId: this.id, status: JobStatus.Pause});
        if (job) {
            job.status = JobStatus.Running;
            job.jobExecutorId = this.id;
            if (!job.startTime) {
                job.startTime = new Date();
            }
            await jobRepo.save(job);
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
        const jobRepo = this._databaseService.getJobRepository();
        const jobMessage = job.jobMessage;
        const actionMap = jobMessage.actions;
        let action: Action;
        let outputPath: string;
        let state: JobState;
        const finalActionIds = findFinalActionsId(actionMap);
        for (const finalActionId of finalActionIds) {
            const startActionIds = [];
            reverseTraverse(finalActionId, actionMap, startActionIds);

        }

        // const initialProgress = job.progress;
        // reverseTraverse(action)

        if (!Array.isArray(job.stateHistory)) {
            job.stateHistory = [];
        }
        for (let i = initialProgress; i < jobMessage.actions.length && job.status !== JobStatus.Canceled && job.status !== JobStatus.UnrecoverableError; i++) {
            job.progress = i;
            state = new JobState();
            state.startTime = new Date();
            action = jobMessage.actions[i];
            action.index = i;
            if (outputPath) {
                action.lastOutput = outputPath;
            }
            this.currentVideoProcessor = this._processorFactory(action.type);
            state.log = `preparing for action[${i}]`;
            this.currentVideoProcessor.registerLogHandler((logChunk, ch) => {
                // TODO: realTime logging
                logger.info(ch + ':' + logChunk);
            });
            await this.currentVideoProcessor.prepare(jobMessage, action);
            state.endTime = new Date();
            job.stateHistory.push(state);
            await jobRepo.save(job);
            state = new JobState();
            state.startTime = new Date();
            state.log = `start processing action[${i}]`;
            try {
                outputPath = await this.currentVideoProcessor.process(action);
            } catch (e) {
                job.status = JobStatus.UnrecoverableError;
                logger.warn(e);
                this._sentry.capture(e);
            }
            state.endTime = new Date();
            job.stateHistory.push(state);
            await jobRepo.save(job);
            await this.currentVideoProcessor.dispose();
        }
        if (job.status !== JobStatus.Canceled) {
            // Finished
            job.status = JobStatus.Finished;
            job.finishedTime = new Date();
            await jobRepo.save(job);
            outputPath = await JobExecutor.normalizeFilename(basename(jobMessage.videoFile.filename), outputPath);
            await this.notifyFinished(job, outputPath);
        }
        this.isIdle = true;
    }

    private static async normalizeFilename(originalFilename: string, outputPath: string): Promise<string> {
        const ext = extname(originalFilename);
        const originalBasename = basename(originalFilename, ext);
        const outputPathDir = dirname(outputPath);
        const normalizedOutputPath = join(outputPathDir, originalBasename + extname(outputPath));
        await rename(outputPath, normalizedOutputPath);
        return normalizedOutputPath;
    }

    private async notifyFinished(job: Job, outputFilePath: string): Promise<void> {
        const msg = new VideoManagerMessage();
        msg.id = uuidv4();
        msg.processedFile = new RemoteFile();
        msg.processedFile.filename = basename(outputFilePath);
        msg.processedFile.fileLocalPath = outputFilePath;
        msg.processedFile.fileUri = this._configManager.getFileUrl(msg.processedFile.filename, job.jobMessageId);
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