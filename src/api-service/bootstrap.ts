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

import './controller/VideoController'

import { Container } from 'inversify';
import { InversifyExpressServer } from 'inversify-express-utils';
import { ConfigManager } from '../utils/ConfigManager';
import { TYPES } from '../TYPES';
import { Server } from 'http';

export function bootstrap(container: Container): Server {
    const expressServer = new InversifyExpressServer(container);

    expressServer.setConfig((theApp) => {
        // theApp.use()
    });

    const app = expressServer.build();
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    const server = app.listen(configManager.serverPort(), '0.0.0.0');
    console.log('Server started on port ' + configManager.serverPort());
    return server;
}