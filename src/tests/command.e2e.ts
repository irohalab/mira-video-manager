/*
 * Copyright 2025 IROHA LAB
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

import 'reflect-metadata';
import { join } from 'path';
import { Channel, connect } from 'amqplib';
import { promisify } from 'util';
import { CMD_CANCEL, CommandMessage } from '../domains/CommandMessage';
import { jobDataPath, projectRoot } from '../test-helpers/helpers';
import { readFile } from 'fs/promises';
import { randomUUID } from 'crypto';

const sleep = promisify(setTimeout);

const JOB_EXCHANGE = 'video_job';
const DOWNLOAD_MESSAGE_EXCHANGE = 'download_message';
const VIDEO_MANAGER_COMMAND_EXCHANGE = 'video_manager_command_exchange';
const DOWNLOAD_MESSAGE_QUEUE = 'download_message_queue';
const VIDEO_MANAGER_QUEUE = 'video_manager_queue';
// binding key
const VIDEO_MANAGER_GENERAL = 'general';

function getConfig() {
    const host = process.env.AMQP_HOST || 'localhost';
    const port = process.env.AMQP_PORT ? parseInt(process.env.AMQP_PORT, 10) : 5672;
    const username = process.env.AMQP_USER || 'guest';
    const password = process.env.PASSWORD || 'guest';
    return {
        protocol: 'amqp',
        hostname: host,
        port,
        username,
        password,
        locale: 'en_US',
        frameMax: 0,
        heartbeat: 0,
        vhost: '/'
    }
}

function createDownloadMessage() {
    return {
        id: randomUUID(),
        bangumiId: '38a0553d-1cf9-4649-acff-17b1cb65425b',
        videoId: randomUUID(),
        downloadTaskId: randomUUID(),
        downloadManagerId: 'test_download_manager',
        appliedProcessRuleId: null,
        videoFile: {
            filename: 'gochuusa-cm-2.mkv',
            fileLocalPath: join(projectRoot, 'tests', 'gochuusa-cm-2.mkv'),
            fileUri: null
        },
        otherFiles: [{
            filename: 'test-video-2.ass',
            fileLocalPath: join(projectRoot, 'tests', 'test-video-2.ass'),
            fileUri: null
        }],
        version: '1.0'
    }
}

async function sendDownloadMessage(channel: Channel) {
    const msg = createDownloadMessage();
    channel.sendToQueue(DOWNLOAD_MESSAGE_QUEUE, Buffer.from(JSON.stringify(msg)), {
        persistent: false
    });
    return msg;
}

async function sendCancelMessage(channel: Channel, jobId: string) {
    const msg = new CommandMessage();
    msg.jobId = jobId;
    msg.command = CMD_CANCEL;

    channel.publish(VIDEO_MANAGER_COMMAND_EXCHANGE, '', Buffer.from(JSON.stringify(msg)), {
        persistent: false
    });

    return msg;
}

async function doTestCommand() {
    const config = getConfig();
    const conn = await connect(`${config.protocol}://${config.username}:${config.password}@${config.hostname}:${config.port}${config.vhost}?heartbeat=${config.heartbeat}&frameMax=${config.frameMax}`);

    const channel = await conn.createConfirmChannel();
    await channel.assertExchange(DOWNLOAD_MESSAGE_EXCHANGE, 'direct', {
        durable: true
    });
    await channel.assertQueue(DOWNLOAD_MESSAGE_QUEUE, {
        durable: true
    });

    const channel2 = await conn.createConfirmChannel();

    await channel2.assertExchange(VIDEO_MANAGER_COMMAND_EXCHANGE, 'fanout', {
        durable: true
    });

    const msgList = [];
    for (let i = 0; i < 10; i++) {
        await sleep(500);
        msgList.push(sendDownloadMessage(channel));
    }

    await sleep(3000);

    const jobs = JSON.parse(await readFile(jobDataPath, {encoding: 'utf8'}));
    console.log(`Found ${jobs.length} jobs`);

    for (let i = jobs.length - 1; i >= 0; i--) {
        const job = jobs[i];
        console.log(`Try to cancel job${job.id} status ${job.status}`);
        await sendCancelMessage(channel2, job.id);
    }
}

doTestCommand().then(() => {console.log('done!')});