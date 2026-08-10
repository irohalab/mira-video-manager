/*
 * Copyright 2026 IROHA LAB
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

import test from 'ava';
import 'reflect-metadata';
import { join } from 'path';
import { DownloadMQMessage, RemoteFile } from '@irohalab/mira-shared';
import { JobScheduler } from '../JobScheduler';
import { VideoProcessRule } from '../entity/VideoProcessRule';
import { JobType } from '../domains/JobType';

test('reuse and clean up a local video while matching metadata rules', async t => {
    const selectedActions = {selected: {}} as any;
    const firstRule = new VideoProcessRule();
    firstRule.condition = 'video_container.videoStreamCount() === 99';
    firstRule.actions = {};
    const secondRule = new VideoProcessRule();
    secondRule.condition = 'video_container.videoStreamCount() > 0';
    secondRule.actions = selectedActions;
    const savedJobs = [];
    const publishedMessages = [];
    let downloadCount = 0;
    let cleanupCount = 0;
    let downloadMessageId: string;
    let cleanupMessageId: string;
    const databaseService = {
        getVideoProcessRuleRepository: () => ({
            findByBangumiId: async () => [firstRule, secondRule]
        }),
        getJobRepository: () => ({
            save: async job => savedJobs.push(job)
        })
    };
    const fileManageService = {
        downloadFile: async (_remoteFile, _appId, messageId) => {
            downloadCount++;
            downloadMessageId = messageId;
            return join(__dirname, '../../tests/test-video-1.mp4');
        },
        cleanUpFiles: async messageId => {
            cleanupCount++;
            cleanupMessageId = messageId;
        }
    };
    const rabbitmqService = {
        publish: async (_exchange, _key, message) => {
            publishedMessages.push(message);
        }
    };
    const scheduler = new JobScheduler(
        {} as any,
        databaseService as any,
        {capture: () => undefined} as any,
        fileManageService as any,
        rabbitmqService as any
    );
    const message = new DownloadMQMessage();
    message.id = 'download-message';
    message.bangumiId = 'bangumi';
    message.downloadManagerId = 'download-manager';
    message.videoId = 'video';
    message.videoFile = new RemoteFile();
    message.videoFile.filename = 'test-video-1.mp4';
    message.videoFile.fileUri = 's3://internal-download-files/test-video-1.mp4';
    message.otherFiles = [];

    await (scheduler as any).onDownloadMessage(message);

    t.is(downloadCount, 1);
    t.is(cleanupCount, 1);
    t.is(cleanupMessageId, downloadMessageId);
    t.is(savedJobs.length, 1);
    t.is(savedJobs[0].jobMessage.jobType, JobType.NORMAL_JOB);
    t.is(savedJobs[0].jobMessage.actions, selectedActions);
    t.is(publishedMessages.length, 1);
});