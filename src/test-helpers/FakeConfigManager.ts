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

import { ConfigManager } from '../utils/ConfigManager';
import { Options } from 'amqplib';
import { injectable } from 'inversify';
import { resolve, join } from 'path';
import { WebServerConfig } from '../TYPES';
import { NotImplementException } from '@irohalab/mira-shared';
import { MikroORMOptions } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { nanoid } from 'nanoid';

@injectable()
export class FakeConfigManager implements ConfigManager {
    failedFileRetentionDays(): number {
        return 5;
    }
    maxJobProcessTime(): number {
        return 10;
    }
    fileRetentionDays(): number {
        return 1;
    }
    maxThreadsToProcess(): number {
        return 0;
    }
    public profilePath: string;

    amqpConfig(): Options.Connect {
        const host = 'localhost';
        const port = 5672;
        const username = 'guest';
        const password = 'guest';
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
        };
    }

    amqpServerUrl(): string {
        return process.env.AMQP_URL;
    }

    appIdHostMap(): { [p: string]: string } {
        return {
            test_instance: 'http://localhost/'
        };
    }

    getFileUrl(filename: string, jobMessageId: string): string {
        return '';
    }

    jobExecutorId(): Promise<string> {
        return Promise.resolve(`JobManager${nanoid(4)}`);
    }

    jobProfileDirPath(): string {
        return this.profilePath ? this.profilePath : resolve(__dirname, '../../temp');
    }

    videoFileTempDir(): string {
        return join(this.jobProfileDirPath(), 'video');
    }

    databaseConfig(): MikroORMOptions<PostgreSqlDriver> {
        throw new NotImplementException();
    }

    public ApiWebServerConfig(): WebServerConfig {
        return {
            enableHttps: false,
            host: 'localhost',
            port: 8083
        };
    }

    public WebServerConfig(): WebServerConfig {
        return {
            enableHttps: false,
            host: 'localhost',
            port: 8082
        };
    }

    public jobLogPath(): string {
        return join(this.jobProfileDirPath(), 'log');
    }

    public getJobExpireTime(): { Canceled: number; UnrecoverableError: number; Finished: number } {
        return {Canceled: 1, Finished: 1, UnrecoverableError: 1};
    }

    public fontsDir(): string {
        return '';
    }
}