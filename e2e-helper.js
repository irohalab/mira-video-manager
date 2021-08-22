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

const amqp = require('amqplib');
const uuid = require('uuid').v4;
const path = require('path');

const JOB_EXCHANGE = 'video_job';
const DOWNLOAD_MESSAGE_EXCHANGE = 'download_message';
const VIDEO_MANAGER_EXCHANGE = 'video_manager';
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
    const bangumiId = process.argv[2];
    if (!bangumiId) {
        throw new Error('bangumiId is not provided. Use node e2e-helper.js <bangumiId>');
    }
    return {
        id: uuid(),
        bangumiId: bangumiId,
        videoId: uuid(),
        downloadTaskId: uuid(),
        downloadManagerId: 'test_download_manager',
        appliedProcessRuleId: null,
        videoFile: {
            filename: 'test-video-2.mkv',
            fileLocalPath: path.join(__dirname, 'tests', 'test-video-2.mkv'),
            fileUri: null
        },
        otherFiles: [{
            filename: 'test-video-2.ass',
            fileLocalPath: path.join(__dirname, 'tests', 'test-video-2.ass'),
            fileUri: null
        }],
        version: '1.0'
    }
}

async function sendDownloadMessage() {
    const config = getConfig();
    const msg = createDownloadMessage();
    const conn = await amqp.connect(`${config.protocol}://${config.username}:${config.password}@${config.hostname}:${config.port}${config.vhost}?heartbeat=${config.heartbeat}&frameMax=${config.frameMax}`);
    const channel = await conn.createConfirmChannel();
    await channel.assertExchange(DOWNLOAD_MESSAGE_EXCHANGE, 'direct', {
        durable: true
    });
    await channel.assertQueue(DOWNLOAD_MESSAGE_QUEUE, {
        durable: true
    });

    channel.sendToQueue(DOWNLOAD_MESSAGE_QUEUE, Buffer.from(JSON.stringify(msg)), {
        persistent: false
    });
}

async function receiveFinishMessage() {
    const config = getConfig();
    const conn = await amqp.connect(`${config.protocol}://${config.username}:${config.password}@${config.hostname}:${config.port}${config.vhost}?heartbeat=${config.heartbeat}&frameMax=${config.frameMax}`);
    const channel = await conn.createConfirmChannel();
    await channel.assertExchange(VIDEO_MANAGER_EXCHANGE, 'direct');
    const q = await channel.assertQueue(VIDEO_MANAGER_QUEUE, {
        durable: true
    });
    await channel.bindQueue(q.queue, VIDEO_MANAGER_EXCHANGE, VIDEO_MANAGER_GENERAL);
    const consumer = await channel.consume(q.queue, (msg) => {
        const message = JSON.parse(msg.content.toString('utf-8'));
        console.log('finished');
        console.log(message);
        channel.ack(msg);
    });
    console.log('consumeTag:' + consumer.consumerTag);
}

sendDownloadMessage()
    .then(() => {
        return receiveFinishMessage();
    })
    .then(() => {

    });