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

import { inject, injectable } from "inversify";
import { JobRepository } from "../repository/JobRepository";
import { Connection, createConnection, getCustomRepository } from "typeorm";
import { VideoProcessRuleRepository } from "../repository/VideoProcessRuleRepository";
import { MessageRepository } from '../repository/MessageRepository';
import { DatabaseService } from './DatabaseService';
import { ConfigManager } from '../utils/ConfigManager';
import { TYPES } from '../TYPES';

@injectable()
export class DatabaseServiceImpl implements DatabaseService {
    private _connection: Connection;
    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager) {
    }

    public async start(): Promise<void> {
        this._connection = await createConnection(this._configManager.databaseConnectionConfig());
        return Promise.resolve(undefined);
    }

    public async stop(): Promise<void> {
        await this._connection.close();
        return Promise.resolve(undefined);
    }

    public getJobRepository(): JobRepository {
        return getCustomRepository<JobRepository>(JobRepository);
    }

    public getVideoProcessRuleRepository(): VideoProcessRuleRepository {
        return getCustomRepository<VideoProcessRuleRepository>(VideoProcessRuleRepository);
    }

    public getMessageRepository(): MessageRepository {
        return getCustomRepository<MessageRepository>(MessageRepository);
    }
}