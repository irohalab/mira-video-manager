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


import { Container } from 'inversify';
import { InversifyExpressServer } from 'inversify-express-utils';
import { ConfigManager } from '../utils/ConfigManager';
import { createServer, Server as HttpServer } from 'http';
import * as bodyParser from 'body-parser';
import * as cors from 'cors';
import pino from 'pino';
import { TYPES } from '@irohalab/mira-shared';
import { DatabaseService } from '../services/DatabaseService';
import { Server as SocketIOServer } from 'socket.io';
import { interfaces, InversifySocketServer, TYPE } from 'inversify-socket-utils';
import { JobLogController } from './socket-controller/JobLogController';
import { VertexLogController } from './socket-controller/VertexLogController';

export const JOB_EXECUTOR = 'JOB_EXECUTOR';
export const API_SERVER = 'API_SERVER';

const DEBUG = process.env.DEBUG === 'true';

const logger = pino();

export function bootstrap(container: Container, startAs: string): HttpServer {
    if (startAs === JOB_EXECUTOR) {
        // tslint:disable-next-line:no-var-requires
        require('./controller/VideoController');
    } else if (startAs === API_SERVER) {
        // tslint:disable-next-line:no-var-requires
        require('./controller/RuleController');
        // tslint:disable-next-line:no-var-requires
        require('./controller/JobController');

        container.bind<interfaces.Controller>(TYPE.Controller).to(JobLogController).whenTargetNamed('JobLogController');
        container.bind<interfaces.Controller>(TYPE.Controller).to(VertexLogController).whenTargetNamed('VertexLogController');
    } else {
        throw new Error('START_AS env not correct');
    }

    const expressServer = new InversifyExpressServer(container);
    const databaseService = container.get<DatabaseService>(TYPES.DatabaseService);

    expressServer.setConfig((theApp) => {
        theApp.use(bodyParser.urlencoded({
            extended: true
        }))
        theApp.use(bodyParser.json())
        if (DEBUG) {
            theApp.use(cors());
        }
        // register this middleware after bodyParser or queryParser but just before any handler that access database.
        theApp.use(databaseService.requestContextMiddleware());
    });

    const app = expressServer.build();
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    let port: number;
    if (startAs === JOB_EXECUTOR) {
        port = configManager.WebServerConfig().port;
    } else {
        port = configManager.ApiWebServerConfig().port;
    }
    const server = createServer(app);
    if (startAs === API_SERVER) {
        const io = new SocketIOServer(server, {
            cors: {
                origin: 'http://localhost:3000'
            },
            path: '/rt-log/'
        });
        const iss = new InversifySocketServer(container, io);
        iss.build();
    }

    server.listen(port, '0.0.0.0');
    logger.info('Server started on port ' + port);
    return server;
}