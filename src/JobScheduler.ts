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
    JOB_QUEUE,
    RabbitMQService,
    Sentry,
    TYPES,
    VIDEO_MANAGER_COMMAND,
    VIDEO_MANAGER_EXCHANGE,
    VIDEO_MANAGER_GENERAL,
    VideoManagerMessage
} from '@irohalab/mira-shared';
import { randomUUID } from 'crypto';
import { getStdLogger } from './utils/Logger';

const JOB_STATUS_CHECK_INTERVAL = 15 * 60 * 1000;
const sleep = promisify(setTimeout);

const logger = getStdLogger();

@injectable()
export class JobScheduler implements JobApplication {
    private _downloadMessageConsumeTag: string;
    private _commandMessageConsumeTag: string;
    private _jobMessageConsumeTag: string;
    private _jobStatusCheckerTimerId: NodeJS.Timeout;

    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.DatabaseService) private _databaseService: DatabaseService,
                @inject(TYPES.Sentry) private _sentry: Sentry,
                private _fileManageService: FileManageService,
                @inject(TYPES.RabbitMQService) private _rabbitmqService: RabbitMQService) {
    }

    public async start(): Promise<void> {
        await this._rabbitmqService.initPublisher(JOB_EXCHANGE, 'direct', '');
        await this._rabbitmqService.initPublisher(VIDEO_MANAGER_EXCHANGE, 'direct', VIDEO_MANAGER_COMMAND);
        await this._rabbitmqService.initPublisher(VIDEO_MANAGER_EXCHANGE, 'direct', VIDEO_MANAGER_GENERAL);
        await this._rabbitmqService.initConsumer(VIDEO_MANAGER_EXCHANGE, 'direct', COMMAND_QUEUE, VIDEO_MANAGER_COMMAND, true);
        await this._rabbitmqService.initConsumer(JOB_EXCHANGE, 'direct', JOB_QUEUE, '', true);
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
        });
        this.checkJobStatus();
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
                }
                if (!appliedRule) {
                    for (const rule of rules) {
                        if (await this.checkConditionMatch(rule.condition, msg)) {
                            appliedRule = rule;
                            break;
                        }
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
                    await this._rabbitmqService.publish(JOB_EXCHANGE, '', job.jobMessage);
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
        jobMessage.actions = appliedRule.actions;
        jobMessage.videoFile = msg.videoFile;
        jobMessage.otherFiles = msg.otherFiles;
        jobMessage.fileMapping = msg.fileMapping;
        jobMessage.downloadAppId = msg.downloadManagerId;
        jobMessage.downloadTaskId = msg.downloadTaskId;
        await this.newJob(jobMessage);
        this._rabbitmqService.publish(JOB_EXCHANGE, '', jobMessage)
            .then(() => {
                logger.info('dispatched job ' + jobMessage.id);
            });
    }

    private async sendNoNeedToProcessMessage(msg: DownloadMQMessage) {
        const vmMsg = new VideoManagerMessage();
        vmMsg.id = randomUUID();
        vmMsg.bangumiId = msg.bangumiId;
        vmMsg.videoId = msg.videoId;
        vmMsg.isProcessed = false;
        vmMsg.processedFiles = null;
        vmMsg.jobExecutorId = null;
        vmMsg.downloadTaskId = msg.downloadTaskId;
        await this._rabbitmqService.publish(VIDEO_MANAGER_EXCHANGE, VIDEO_MANAGER_GENERAL, vmMsg);
    }

    private checkJobStatus(): void {
        console.log('start to check job status');
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
            jobMessage.id = randomUUID();
            await this.newJob(jobMessage);
            await this._rabbitmqService.publish(JOB_EXCHANGE, '', jobMessage);
        }
    }
}