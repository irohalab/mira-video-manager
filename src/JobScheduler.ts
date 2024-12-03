/*
 * Copyright 2024 IROHA LAB
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
import { Job } from './entity/Job';
import { JobStatus } from './domains/JobStatus';
import { JobApplication } from './JobApplication';
import { FileManageService } from './services/FileManageService';
import { CMD_CANCEL, CMD_RESUME, CommandMessage } from './domains/CommandMessage';
import { promisify } from 'util';
import {
    COMMAND_QUEUE,
    DOWNLOAD_MESSAGE_EXCHANGE,
    DOWNLOAD_MESSAGE_QUEUE,
    DownloadMQMessage,
    JOB_EXCHANGE,
    JOB_QUEUE, MQMessage,
    RabbitMQService,
    Sentry,
    TYPES,
    VIDEO_MANAGER_COMMAND,
    VIDEO_MANAGER_EXCHANGE
} from '@irohalab/mira-shared';
import { randomUUID } from 'crypto';
import { getStdLogger } from './utils/Logger';
import { META_JOB_KEY, META_JOB_QUEUE, NORMAL_JOB_KEY, VIDEO_JOB_RESULT_KEY, VIDEO_JOB_RESULT_QUEUE } from './TYPES';
import { JobType } from './domains/JobType';
import { ValidateAction } from './domains/ValidateAction';
import axios from 'axios';
import { JobFailureMessage } from './domains/JobFailureMessage';

const JOB_STATUS_CHECK_INTERVAL = 15 * 60 * 1000;
const sleep = promisify(setTimeout);

const logger = getStdLogger();

@injectable()
export class JobScheduler implements JobApplication {
    private _downloadMessageConsumeTag: string;
    private _videoManagerJobMessageConsumeTag: string;
    private _commandMessageConsumeTag: string;
    private _jobMessageConsumeTag: string;
    private _metaJobMessageConsumeTag: string;
    private _jobStatusCheckerTimerId: NodeJS.Timeout;

    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.DatabaseService) private _databaseService: DatabaseService,
                @inject(TYPES.Sentry) private _sentry: Sentry,
                private _fileManageService: FileManageService,
                @inject(TYPES.RabbitMQService) private _rabbitmqService: RabbitMQService) {
    }

    public async start(): Promise<void> {
        await this._rabbitmqService.initPublisher(JOB_EXCHANGE, 'direct', NORMAL_JOB_KEY);
        await this._rabbitmqService.initPublisher(JOB_EXCHANGE, 'direct', META_JOB_KEY);
        await this._rabbitmqService.initPublisher(VIDEO_MANAGER_EXCHANGE, 'direct', VIDEO_MANAGER_COMMAND);
        await this._rabbitmqService.initConsumer(VIDEO_MANAGER_EXCHANGE, 'direct', COMMAND_QUEUE, VIDEO_MANAGER_COMMAND, true);
        await this._rabbitmqService.initConsumer(VIDEO_MANAGER_EXCHANGE, 'direct', VIDEO_JOB_RESULT_QUEUE, VIDEO_JOB_RESULT_KEY, true);
        await this._rabbitmqService.initConsumer(JOB_EXCHANGE, 'direct', JOB_QUEUE, NORMAL_JOB_KEY, true);
        await this._rabbitmqService.initConsumer(DOWNLOAD_MESSAGE_EXCHANGE, 'direct', DOWNLOAD_MESSAGE_QUEUE);
        await this._rabbitmqService.initConsumer(JOB_EXCHANGE, 'direct', META_JOB_QUEUE, META_JOB_KEY, true);
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

        this._videoManagerJobMessageConsumeTag = await this._rabbitmqService.consume(VIDEO_JOB_RESULT_QUEUE, async (msg) => {
            try {
                await this.sendJobFailureNotification(msg as JobFailureMessage);
            } catch (ex) {
                logger.error(ex);
                this._sentry.capture(ex);
            }
            return true;
        });

        this._commandMessageConsumeTag = await this._rabbitmqService.consume(COMMAND_QUEUE, async (msg) => {
            try {
                return await this.onCommandMessage(msg as CommandMessage);
            } catch (ex) {
                logger.error(ex);
                this._sentry.capture(ex);
                return false;
            }
        });
        this._jobMessageConsumeTag = await this._rabbitmqService.consume(JOB_QUEUE, async (msg) => {
            return await this.removeJobMessageFromQueue(msg);
        });

        this._metaJobMessageConsumeTag = await this._rabbitmqService.consume(META_JOB_QUEUE, async (msg) => {
            return await this.removeJobMessageFromQueue(msg);
        });

        this.checkJobStatus();
    }

    public async stop(): Promise<void> {
        clearTimeout(this._jobStatusCheckerTimerId);
    }

    private async removeJobMessageFromQueue(msg: MQMessage): Promise<boolean> {
        try {
            const jobMessage = msg as JobMessage;
            const job = await this._databaseService.getJobRepository().findOne({ id: jobMessage.jobId });
            if (job.status === JobStatus.Canceled) {
                logger.info('remove canceled job (' + job.id +') from message queue');
                // remove from Message Queue
                return true;
            }
        } catch (ex) {
            logger.error(ex);
            this._sentry.capture(ex);
        }
        return false;
    }

    private async onDownloadMessage(msg: DownloadMQMessage): Promise<void> {
        let appliedRule: VideoProcessRule;
        const rules = await this._databaseService.getVideoProcessRuleRepository().findByBangumiId(msg.bangumiId);

        if (rules && rules.length > 0) {
            if (rules.length === 1 && rules[0].condition === null && (!rules[0].videoFileId || rules[0].videoFileId === msg.videoId)) {
                appliedRule = rules[0];
            } else {
                // take the first matched condition as the rule is already returned as higher priority first.
                for (const rule of rules) {
                    if (rule.videoFileId && msg.videoId && rule.videoFileId === msg.videoId) {
                        appliedRule = rule;
                        break;
                    }
                }
                if (!appliedRule) {
                    // check all bangumi wide rule, we need to exclude video file specified rules
                    // since checkConditionMatch will return true for any rule.condition is none
                    // see: https://github.com/irohalab/mira-video-manager/issues/57
                    for (const rule of rules) {
                        if (!rule.videoFileId && await this.checkConditionMatch(rule.condition, msg)) {
                            appliedRule = rule;
                            break;
                        }
                    }
                }
            }
        }

        // preprocess actions of the rule
        await this.dispatchJob(appliedRule, msg);
    }

    private async onCommandMessage(msg: CommandMessage): Promise<boolean> {
        let job: Job;
        const jobRepo = this._databaseService.getJobRepository();
        switch (msg.command) {
            case CMD_CANCEL:
                job = await jobRepo.findOne({ id: msg.jobId });
                if (job && job.status === JobStatus.Queueing || job.status === JobStatus.Pause) {
                    job.status = JobStatus.Canceled;
                    await jobRepo.save(job);
                    return true;
                }
                break;
            case CMD_RESUME:
                job = await jobRepo.findOne({ id: msg.jobId });
                if (job && job.status === JobStatus.Pause) {
                    job.status = JobStatus.Queueing;
                    await jobRepo.save(job);
                    await this._rabbitmqService.publish(JOB_EXCHANGE, NORMAL_JOB_KEY, job.jobMessage);
                    return true;
                }
                break;
            default:
                logger.info(`${msg.command} command received, but not processed.`);
        }
        return false;
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

    /**
     * create a new job with job message, Job entity must have default PK before save to database.
     * @param msg
     * @private
     */
    private async newJob(msg: JobMessage): Promise<void> {
        const job = new Job();
        msg.jobId = job.id;
        job.jobMessage = msg;
        job.jobMessageId = msg.id;
        job.status = JobStatus.Queueing;
        job.createTime = new Date();
        job.actionMap = msg.actions;
        await this._databaseService.getJobRepository().save(job);
    }

    private async dispatchJob(appliedRule: VideoProcessRule, msg: DownloadMQMessage): Promise<void> {
        const jobMessage = new JobMessage();
        jobMessage.id = randomUUID();
        jobMessage.bangumiId = msg.bangumiId;
        jobMessage.videoId = msg.videoId;
        jobMessage.videoFile = msg.videoFile;
        jobMessage.otherFiles = msg.otherFiles;
        jobMessage.fileMapping = msg.fileMapping;
        jobMessage.downloadAppId = msg.downloadManagerId;
        jobMessage.downloadTaskId = msg.downloadTaskId;
        if (appliedRule) {
            logger.info({message: 'condition matched', video_id: msg.videoId, video_file: msg.videoFile, rule: appliedRule});
            jobMessage.actions = appliedRule.actions;
            jobMessage.jobType = JobType.NORMAL_JOB;
        } else {
            logger.info({message: 'no condition matched', video_id: msg.videoId, video_file: msg.videoFile});
            const validateAction = new ValidateAction();
            jobMessage.actions = {[validateAction.id]: validateAction};
            jobMessage.jobType = JobType.META_JOB;
        }

        await this.newJob(jobMessage);
        this._rabbitmqService.publish(JOB_EXCHANGE, appliedRule ? NORMAL_JOB_KEY : META_JOB_KEY, jobMessage)
            .then(() => {
                logger.info('dispatched job ' + jobMessage.id);
            });
    }

    private checkJobStatus(): void {
        console.log('start to check job status');
        this._jobStatusCheckerTimerId = setTimeout(async () => {
            await this.doCheckJobStatus();
            this.checkJobStatus();
        }, JOB_STATUS_CHECK_INTERVAL);
    }

    // check for unfinished jobs (not include meta jobs)
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
            jobMessage.id = randomUUID();
            await this.newJob(jobMessage);
            await this._rabbitmqService.publish(JOB_EXCHANGE, NORMAL_JOB_KEY, jobMessage);
        }
    }

    private async sendJobFailureNotification(msg: JobFailureMessage): Promise<void> {
        const job = await this._databaseService.getJobRepository().findOne({id: msg.jobId});
        if (job) {
            await this.callAlbireoRpc(job);
            logger.info('sent notification for failed job ' + msg.jobId);
        } else {
            throw new Error('no job found for failed job message, job id is ' + msg.jobId);
        }
    }

    private async callAlbireoRpc(job: Job): Promise<void> {
        const rpcUrl = this._configManager.albireoRPCUrl();
        await axios.post(`${rpcUrl}/video_job_failed`, {
            job: {
                id: job.id,
                video_id: job.jobMessage.videoId,
                bangumi_id: job.jobMessage.bangumiId,
                jobType: job.jobMessage.jobType,
                startTime: job.startTime.toISOString(),
                endTime: (job.finishedTime ?? new Date()).toISOString()
            }
        });
    }
}