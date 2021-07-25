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
import { injectable } from "inversify";
import { RabbitMQService } from './services/RabbitMQService';
import { DOWNLOAD_MESSAGE_EXCHANGE, DOWNLOAD_MESSAGE_QUEUE, JOB_EXCHANGE } from './TYPES';
import { DownloadMQMessage } from './domains/DownloadMQMessage';
import { DatabaseService } from './services/DatabaseService';
import { VideoProcessRule } from './entity/VideoProcessRule';
import { RemoteFile } from './domains/RemoteFile';
import { ConditionParser } from './utils/ConditionParser';
import { JobMessage } from './domains/JobMessage';
import { v4 as uuidv4 } from 'uuid';
import { Job } from './entity/Job';
import { JobStatus } from './domains/JobStatus';
import { MainRunner } from '../MainRunner';

@injectable()
export class JobScheduler implements MainRunner {
    private _downloadMessageConsumeTag: string;

    constructor(private _configManager: ConfigManager,
                private _databaseService: DatabaseService,
                private _rabbitmqService: RabbitMQService) {
    }

    public async start(): Promise<void> {
        await this._rabbitmqService.initPublisher(JOB_EXCHANGE, 'direct');
        await this._rabbitmqService.initConsumer(DOWNLOAD_MESSAGE_EXCHANGE, 'direct', DOWNLOAD_MESSAGE_QUEUE);
        this._downloadMessageConsumeTag = await this._rabbitmqService.consume(DOWNLOAD_MESSAGE_QUEUE, (msg) => {
            this.onDownloadMessage(msg as DownloadMQMessage);
            return Promise.resolve(true);
        });
    }

    public async stop(): Promise<void> {
        // TODO: clean up;
    }

    private async onDownloadMessage(msg: DownloadMQMessage): Promise<void> {
        let appliedRule: VideoProcessRule;
        if (msg.appliedProcessRuleId) {
            appliedRule = await this._databaseService.getVideoProcessRuleRepository().findOne({id: msg.appliedProcessRuleId});
        } else {
            const rules = await this._databaseService.getVideoProcessRuleRepository().findByBangumiId(msg.bangumiId);

            if (rules && rules.length > 0) {
                if (rules.length === 1 && rules[0].condition === null) {
                    appliedRule = rules[0];
                } else {
                    // take the first matched condition as the rule is already returned as higher priority first.
                    for (const rule of rules) {
                        if (await this.checkConditionMatch(rule.condition, msg)) {
                            appliedRule = rule;
                            break;
                        }
                    }
                }
            } else {
                console.log('no rules found, ignore message');
            }
        }

        // preprocess actions of the rule
        if (appliedRule) {
            await this.dispatchJob(appliedRule, msg);
        }
    }

    private async checkConditionMatch(condition: string, msg: DownloadMQMessage): Promise<boolean> {
        const files = msg.getAllRemoteFiles();
        const conditionParser = new ConditionParser(condition, files, msg.downloadManagerId);
        return await conditionParser.evaluate();
    }

    private async retrieveFiles(remoteFiles: RemoteFile[]): Promise<void> {
        // TODO: download
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

        if (await this._rabbitmqService.publish(JOB_EXCHANGE, '', jobMessage)) {

            const job = new Job();
            job.jobMessage = jobMessage;
            job.jobMessageId = jobMessage.id;
            job.status = JobStatus.Queueing;
            await this._databaseService.getJobRepository().save(job);
        }
    }
}