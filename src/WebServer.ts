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
import { Container } from 'inversify';
import { ConfigManager } from './utils/ConfigManager';
import { ConfigManagerImpl } from './utils/ConfigManagerImpl';
import { DatabaseService } from './services/DatabaseService';
import { DatabaseServiceImpl } from './services/DatabaseServiceImpl';
import { API_SERVER, bootstrap } from './api-service/bootstrap';
import { Server } from 'http';
import { hostname } from 'os';
import {
    DOWNLOAD_MESSAGE_EXCHANGE,
    RabbitMQService,
    Sentry,
    SentryImpl,
    TYPES,
    VIDEO_MANAGER_COMMAND,
    VIDEO_MANAGER_EXCHANGE
} from '@irohalab/mira-shared';
import { RascalImpl } from '@irohalab/mira-shared/services/RascalImpl';
import { getStdLogger } from './utils/Logger';
import { VIDEO_MANAGER_COMMAND_EXCHANGE } from './TYPES';

const startAs = process.env.START_AS;

const logger = getStdLogger();

const container = new Container();
container.bind<Sentry>(TYPES.Sentry).to(SentryImpl).inSingletonScope();
container.bind<ConfigManager>(TYPES.ConfigManager).to(ConfigManagerImpl).inSingletonScope();
container.bind<DatabaseService>(TYPES.DatabaseService).to(DatabaseServiceImpl).inSingletonScope();
container.bind<RabbitMQService>(TYPES.RabbitMQService).to(RascalImpl).inSingletonScope();

// tslint:disable-next-line
const { version } = require('../package.json');
const sentry = container.get<Sentry>(TYPES.Sentry);
sentry.setup(`WEB_${startAs}_${hostname()}`, 'mira-video-manager', version);

const databaseService = container.get<DatabaseService>(TYPES.DatabaseService);
const rabbitMQService = container.get<RabbitMQService>(TYPES.RabbitMQService);

let webServer: Server;

databaseService.start()
    .then(async () => {
        if (startAs === API_SERVER) {
            await rabbitMQService.initPublisher(DOWNLOAD_MESSAGE_EXCHANGE, 'direct');
            return await rabbitMQService.initPublisher(VIDEO_MANAGER_COMMAND_EXCHANGE, 'fanout', '');
        }
    })
    .then(() => {
        if (startAs === API_SERVER) {
            databaseService.clearExpiredSession();
        }
        webServer = bootstrap(container, startAs);
    });

function beforeExitHandler() {
    databaseService.stop()
        .then(() => {
            webServer.close();
            process.exit(0);
        }, (error) => {
            webServer.close();
            sentry.capture(error);
            logger.error(error);
            process.exit(-1);
        });
}

process.on('SIGINT', beforeExitHandler);
process.on('SIGTERM', beforeExitHandler);
process.on('SIGHUP', beforeExitHandler);