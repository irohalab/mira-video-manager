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
import { inject, injectable } from "inversify";
import { DatabaseService } from './services/DatabaseService';
import { VideoProcessRule } from './entity/VideoProcessRule';
import { ConditionParser } from './utils/ConditionParser';
import { JobMessage } from './domains/JobMessage';
import { v4 as uuidv4 } from 'uuid';
import { Job } from './entity/Job';
import { JobStatus } from './domains/JobStatus';
import { JobApplication } from './JobApplication';
import { JobState } from './domains/JobState';
import { FileManageService } from './services/FileManageService';
import { CMD_CANCEL, CommandMessage } from './domains/CommandMessage';
import { promisify } from 'util';
import pino from 'pino';
import {
    DOWNLOAD_MESSAGE_EXCHANGE,
    DOWNLOAD_MESSAGE_QUEUE,
    DownloadMQMessage,
    JOB_EXCHANGE,
    RabbitMQService,
    Sentry,
    TYPES,
    VIDEO_MANAGER_COMMAND,
    VIDEO_MANAGER_EXCHANGE,
    VIDEO_MANAGER_GENERAL,
    VideoManagerMessage
} from '@irohalab/mira-shared';

const JOB_STATUS_CHECK_INTERVAL = 15 * 60 * 1000;
const sleep = promisify(setTimeout);

const logger = pino();

@injectable()
export class JobScheduler implements JobApplication {
    private _downloadMessageConsumeTag: string;
    private _jobStatusCheckerTimerId: NodeJS.Timeout;

    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.DatabaseService) private _databaseService: DatabaseService,
                @inject(TYPES.Sentry) private _sentry: Sentry,
                private _fileManageService: FileManageService,
                private _rabbitmqService: RabbitMQService) {
    }

    public async start(): Promise<void> {
        this.checkJobStatus();
        await this._rabbitmqService.initPublisher(JOB_EXCHANGE, 'direct');
        await this._rabbitmqService.initPublisher(VIDEO_MANAGER_EXCHANGE, 'direct');
        await this._rabbitmqService.initConsumer(DOWNLOAD_MESSAGE_EXCHANGE, 'direct', DOWNLOAD_MESSAGE_QUEUE);
        this._downloadMessageConsumeTag = await this._rabbitmqService.consume(DOWNLOAD_MESSAGE_QUEUE, async (msg) => {
            try {
                await this.onDownloadMessage(msg as DownloadMQMessage);
                return true;
            } catch (ex) {
                logger.error(ex);
                this._sentry.capture(ex);
                return false;
            }
        });
    }

    public async stop(): Promise<void> {
        clearTimeout(this._jobStatusCheckerTimerId);
    }

    private async onDownloadMessage(msg: DownloadMQMessage): Promise<void> {
        let appliedRule: VideoProcessRule;
        const rules = await this._databaseService.getVideoProcessRuleRepository().findByBangumiId(msg.bangumiId);

        if (rules && rules.length > 0) {
            if (rules.length === 1 && rules[0].condition === null) {
                appliedRule = rules[0];
            } else {
                // take the first matched condition as the rule is already returned as higher priority first.
                for (const rule of rules) {
                    if (rule.videoFileId && msg.videoId && rule.videoFileId === msg.videoId) {
                        appliedRule = rule;
                        break;
                    }
                    if (await this.checkConditionMatch(rule.condition, msg)) {
                        appliedRule = rule;
                        break;
                    }
                }
            }
        }

        // preprocess actions of the rule
        if (appliedRule) {
            logger.info({message: 'condition matched', video_id: msg.videoId, video_file: msg.videoFile, rule: appliedRule});
            await this.dispatchJob(appliedRule, msg);
        } else {
            logger.info({message: 'no condition matched', video_id: msg.videoId, video_file: msg.videoFile});
            await this.sendNoNeedToProcessMessage(msg);
        }
    }

    private async checkConditionMatch(condition: string, msg: DownloadMQMessage): Promise<boolean> {
        if (!condition) {
            return true;
        }
        const videoFile = this._fileManageService.getFileUrlOrLocalPath(msg.videoFile, msg.downloadManagerId);
        const otherFiles = msg.otherFiles.map(f => this._fileManageService.getFileUrlOrLocalPath(f, msg.downloadManagerId));
        const conditionParser = new ConditionParser(condition, videoFile, otherFiles);
        try {
            await conditionParser.tokenCheck();
            return await conditionParser.evaluate();
        } catch (e) {
            logger.error(e);
            this._sentry.capture(e);
            return false;
        }
    }

    private async dispatchJob(appliedRule: VideoProcessRule, msg: DownloadMQMessage): Promise<void> {
        const jobMessage = new JobMessage();
        jobMessage.id = uuidv4();
        jobMessage.bangumiId = msg.bangumiId;
        jobMessage.videoId = msg.videoId;
        jobMessage.actions = appliedRule.actions;
        jobMessage.videoFile = msg.videoFile;
        jobMessage.otherFiles = msg.otherFiles;
        jobMessage.downloadAppId = msg.downloadManagerId;
        jobMessage.downloadTaskId = msg.downloadTaskId;
        const job = JobScheduler.newJob(jobMessage);
        await this._databaseService.getJobRepository().save(job);
        this._rabbitmqService.publish(JOB_EXCHANGE, '', jobMessage)
            .then(() => {
                logger.info('dispatched job ' + jobMessage.id);
            });
    }

    private async sendNoNeedToProcessMessage(msg: DownloadMQMessage) {
        const vmMsg = new VideoManagerMessage();
        vmMsg.id = uuidv4();
        vmMsg.bangumiId = msg.bangumiId;
        vmMsg.videoId = msg.videoId;
        vmMsg.isProcessed = false;
        vmMsg.processedFile = null;
        vmMsg.jobExecutorId = null;
        vmMsg.downloadTaskId = msg.downloadTaskId;
        await this._rabbitmqService.publish(VIDEO_MANAGER_EXCHANGE, VIDEO_MANAGER_GENERAL, vmMsg);
    }

    private static newJob(msg: JobMessage): Job {
        const job = new Job();
        job.jobMessage = msg;
        job.jobMessageId = msg.id;
        job.status = JobStatus.Queueing;
        job.progress = 0;
        const jobState = new JobState();
        jobState.log = 'new job created by Scheduler. JobMessageId: ' + msg.id + '. bangumiId: ' + msg.bangumiId;
        jobState.startTime = new Date();
        jobState.endTime = new Date();
        job.stateHistory = [jobState];
        job.createTime = new Date();
        return job;
    }

    private checkJobStatus(): void {
        this._jobStatusCheckerTimerId = setTimeout(async () => {
            await this.doCheckJobStatus();
            this.checkJobStatus();
        }, JOB_STATUS_CHECK_INTERVAL);
    }

    private async doCheckJobStatus(): Promise<void> {
        const jobRepo = this._databaseService.getJobRepository();
        const unfinishedRunningJobs = await jobRepo.getUnfinishedJobs(this._configManager.maxJobProcessTime());
        // cancel and reschedule jobs
        for (const job of unfinishedRunningJobs) {
            const cmd = new CommandMessage();
            cmd.command = CMD_CANCEL;
            cmd.jobId = job.id;
            await this._rabbitmqService.publish(VIDEO_MANAGER_EXCHANGE, VIDEO_MANAGER_COMMAND, cmd);
        }

        await sleep(10000);

        for (const job of unfinishedRunningJobs) {
            const jobMessage = Object.assign({}, job.jobMessage);
            jobMessage.id = uuidv4();
            const rerunJob = JobScheduler.newJob(jobMessage);
            await jobRepo.save(rerunJob);
            await this._rabbitmqService.publish(JOB_EXCHANGE, '', jobMessage);
        }
    }
}