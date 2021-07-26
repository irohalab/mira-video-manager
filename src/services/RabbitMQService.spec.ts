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

const TEST_EXCHANGE = 'test_exchange';
const TEST_QUEUE = 'test_queue';

test('publish and consume', async t => {
    const container = new Container({ autoBindInjectable: true });
    container.bind<ConfigManager>(TYPES.ConfigManager).to(FakeConfigManager);
    container.bind<DatabaseService>(TYPES.DatabaseService).to(FakeDatabaseService);
    const rabbitMQService = container.get<RabbitMQService>(RabbitMQService);
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