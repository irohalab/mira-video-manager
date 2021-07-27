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

import test from 'ava';
import { Container } from 'inversify';
import { RabbitMQService } from './RabbitMQService';
import { ConfigManager } from '../utils/ConfigManager';
import { TYPES } from '../TYPES';
import { FakeConfigManager } from '../test-helpers/FakeConfigManager';
import { DatabaseService } from './DatabaseService';
import { FakeDatabaseService } from '../test-helpers/FakeDatabaseService';
import { DownloadMQMessage } from '../domains/DownloadMQMessage';
import { v4 as uuid4 } from 'uuid';
import { MQMessage } from '../domains/MQMessage';
import { JobMessage } from '../domains/JobMessage';

let rabbitMQService: RabbitMQService;
test.beforeEach( async (t) => {
    const container = new Container({ autoBindInjectable: true });
    container.bind<ConfigManager>(TYPES.ConfigManager).to(FakeConfigManager);
    container.bind<DatabaseService>(TYPES.DatabaseService).to(FakeDatabaseService);
    rabbitMQService = container.get<RabbitMQService>(RabbitMQService);
});

test('publish and consume', async (t) => {
    const TEST_EXCHANGE = 'test_exchange';
    const TEST_QUEUE = 'test_queue';
    await rabbitMQService.initPublisher(TEST_EXCHANGE, 'direct');
    await rabbitMQService.initConsumer(TEST_EXCHANGE, 'direct', TEST_QUEUE);
    const publishedMsg = new DownloadMQMessage();
    publishedMsg.id = uuid4();
    let receivedMsg: MQMessage;
    let resolveFn: any;
    const resultPromise = new Promise((resolve, reject) => {
        resolveFn = resolve;
    });
    await rabbitMQService.consume(TEST_QUEUE, (msg) => {
        console.log('received msg: ', msg.id);
        receivedMsg = msg;
        resolveFn();
        return Promise.resolve(true);
    })
    await rabbitMQService.publish(TEST_EXCHANGE, '', publishedMsg);
    await resultPromise;
    t.is(publishedMsg.id, receivedMsg.id, 'msg id should equal');
});

test('fair dispatch', async (t) => {
    const FAIR_DISPATCH_EX = 'fair_dispatch_ex';
    const FAIR_DISPATCH_QUEUE = 'fair_dispatch_queue';
    await rabbitMQService.initPublisher(FAIR_DISPATCH_QUEUE, 'direct');
    await rabbitMQService.initConsumer(FAIR_DISPATCH_EX, 'direct', FAIR_DISPATCH_QUEUE, '', true);

    const jobMsg = new JobMessage();
    jobMsg.id = uuid4();
    const receivedMsgs: MQMessage[] = [];
    let resolveFn: any;
    const resultPromise = new Promise((resolve, reject) => {
        resolveFn = resolve;
    });
    await rabbitMQService.consume(FAIR_DISPATCH_QUEUE, (msg) => {
        console.log('reject msg: ', msg.id);
        receivedMsgs[0] = null;
        return Promise.resolve(false);
    });

    await rabbitMQService.consume(FAIR_DISPATCH_QUEUE, (msg) => {
        console.log('received msg: ', msg.id);
        receivedMsgs[1] = msg;
        resolveFn();
        return Promise.resolve(true);
    });

    await rabbitMQService.consume(FAIR_DISPATCH_QUEUE, (msg) => {
        console.log('received msg: ', msg.id);
        receivedMsgs[2] = msg;
        resolveFn();
        return Promise.resolve(true);
    })

    await rabbitMQService.publish(FAIR_DISPATCH_EX, '', jobMsg);
    await resultPromise;
    t.true(receivedMsgs[0] === null, 'first should be 0');
    if (receivedMsgs[1]) {
        t.falsy(receivedMsgs[2], 'second not null, third should not be assigned');
        t.is(receivedMsgs[1].id, jobMsg.id, 'id should be equal');
    } else {
        t.truthy(receivedMsgs[2], 'third assign, second not');
        t.is(receivedMsgs[2].id, jobMsg.id, 'id should be equal');
    }
});

