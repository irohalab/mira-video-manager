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

import { ConfigManager } from "./utils/ConfigManager";
import { RabbitMQService } from './services/RabbitMQService';
import { inject, injectable } from 'inversify';
import {
    JOB_EXCHANGE,
    JOB_QUEUE,
    TYPES,
    VIDEO_MANAGER_EXCHANGE,
    VIDEO_MANAGER_GENERAL
} from './TYPES';
import { JobMessage } from './domains/JobMessage';
import { DatabaseService } from './services/DatabaseService';
import { VideoProcessor } from './processors/VideoProcessor';
import { mkdir, rename, stat } from 'fs/promises';
import { JobStatus } from './domains/JobStatus';
import { Job } from './entity/Job';
import { Action } from './domains/Action';
import { ProcessorFactoryInitiator } from './processors/ProcessorFactory';
import { JobState } from './domains/JobState';
import { VideoManagerMessage } from './domains/VideoManagerMessage';
import { v4 as uuidv4} from 'uuid';
import { RemoteFile } from './domains/RemoteFile';
import { basename, extname, dirname, join } from "path";
import { JobApplication } from './JobApplication';
import { promisify } from 'util';

const sleep = promisify(setTimeout);

@injectable()
export class JobExecutor implements JobApplication {
    public id: string;
    private currentVideoProcessor: VideoProcessor;
    private isIdle: boolean;

    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                private _rabbitmqService: RabbitMQService,
                @inject(TYPES.DatabaseService) private _databaseService: DatabaseService,
                @inject(TYPES.ProcessorFactory) private _processorFactory: ProcessorFactoryInitiator) {
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
            }
        }

        if (statObj && !statObj.isDirectory()) {
            throw new Error(tmpDir + 'exists but is not a directory');
        }

        this.id = await this._configManager.jobExecutorId();

        await this.resumeJob();

        await this._rabbitmqService.initPublisher(VIDEO_MANAGER_EXCHANGE, 'direct');
        await this._rabbitmqService.initConsumer(JOB_EXCHANGE, 'direct', JOB_QUEUE, '', true);
        await this._rabbitmqService.consume(JOB_QUEUE, this.onJobReceived.bind(this));
    }

    public async stop(): Promise<void> {
        await this.pauseJob();
    }

    private async onJobReceived(msg: JobMessage): Promise<boolean> {
        if (this.isIdle) {
            const job = await this._databaseService.getJobRepository().findOne({jobMessageId: msg.id});
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
                    console.log('job processed');
                }, (error) => {
                    console.error(error);
                });
        }
    }

    private async processJob(job: Job): Promise<void> {
        this.isIdle = false;
        const jobRepo = this._databaseService.getJobRepository();
        const jobMessage = job.jobMessage;
        let action: Action;
        let outputPath: string;
        let state: JobState;
        const initialProgress = job.progress;
        if (!Array.isArray(job.stateHistory)) {
            job.stateHistory = [];
        }
        for (let i = initialProgress; i < jobMessage.actions.length; i++) {
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
                console.log(ch + ':' + logChunk);
            });
            await this.currentVideoProcessor.prepare(jobMessage, action);
            state.endTime = new Date();
            job.stateHistory.push(state);
            await jobRepo.save(job);
            state = new JobState();
            state.startTime = new Date();
            state.log = `start processing action[${i}]`;
            outputPath = await this.currentVideoProcessor.process(action);
            state.endTime = new Date();
            job.stateHistory.push(state);
            job.progress = i;
            await jobRepo.save(job);
            await this.currentVideoProcessor.dispose();
        }
        // Finished
        job.status = JobStatus.Finished;
        job.finishedTime = new Date();
        await jobRepo.save(job);
        outputPath = await JobExecutor.normalizeFilename(basename(jobMessage.videoFile.filename), outputPath);
        await this.notifyFinished(job, outputPath);
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
            console.log('TODO: after published to VIDEO_MANAGER_EXCHANGE');
        }
    }
}