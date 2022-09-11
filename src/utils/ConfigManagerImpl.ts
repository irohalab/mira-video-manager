/*
 * Copyright 2022 IROHA LAB
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

import { ConfigManager } from "./ConfigManager";
import * as process from 'process';
import { Options } from 'amqplib';
import * as os from 'os';
import { join, resolve } from 'path';
import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import { injectable } from 'inversify';
import { readFileSync } from 'fs';
import { load as loadYaml } from 'js-yaml';
import { WebServerConfig } from "../TYPES";
import { MikroORMOptions } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { MiraNamingStrategy, ORMConfig } from '@irohalab/mira-shared';
import { TSMigrationGenerator } from '@mikro-orm/migrations';
import { randomUUID } from 'crypto';

type AppConfg = {
    amqp: {
        host: string;
        port: number;
        user: string;
        password: string;
    }
    amqpUrl: string;
    appIdHostMap: { [appId: string]: string};
    jobExecProfileDir: string;
    videoTempDir: string;
    maxJobProcessTime: number;
    fileRetentionDays: number;
    failedFileRetentionDays: number;
    maxThreadsToProcess: number;
    WebServer: {
        enableHttps: boolean;
        host: string;
        port: number;
    };
    ApiWebServer: {
        enableHttps: boolean;
        host: string;
        port: number;
    };
    jobLogPath: string;
};

const CWD_PATTERN = /\${cwd}/;
const HOME_PATTERN = /\${home}/;
const PROJECT_ROOT_PATTERN = /\${project_root}/;

@injectable()
export class ConfigManagerImpl implements ConfigManager {
    private readonly _ormConfig: ORMConfig;
    private readonly _config: AppConfg;
    constructor() {
        const ormConfigPath = process.env.ORMCONFIG || resolve(__dirname, '../../ormconfig.json');
        const appConfigPath = process.env.APPCONFIG || resolve(__dirname, '../../config.yml');
        this._ormConfig = JSON.parse(readFileSync(ormConfigPath, { encoding: 'utf-8' }));
        this._config = loadYaml(readFileSync(appConfigPath, { encoding: 'utf-8'})) as AppConfg;
    }

    public amqpServerUrl(): string {
        let amqpUrl = process.env.AMQP_URL;
        if (!amqpUrl) {
            amqpUrl = this._config.amqpUrl;
        }
        return amqpUrl;
    }

    public amqpConfig(): Options.Connect {
        const host = this._config.amqp.host || 'localhost';
        const port = this._config.amqp.port || 5672;
        const username = this._config.amqp.user || 'guest';
        const password = this._config.amqp.password || 'guest';
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

    appIdHostMap(): { [p: string]: string } {
        return this._config.appIdHostMap || {};
    }

    public jobProfileDirPath(): string {
        let profileDir = this._config.jobExecProfileDir;
        if (profileDir) {
            profileDir = ConfigManagerImpl.processPath(profileDir);
        } else {
            profileDir = join(os.homedir(), '.mira', 'video-manager');
        }
        return profileDir;
    }

    public videoFileTempDir(): string {
        let videoTempDir = this._config.videoTempDir;
        if (videoTempDir) {
            videoTempDir = ConfigManagerImpl.processPath(videoTempDir);
        } else {
            videoTempDir = join(this.jobProfileDirPath(), 'temp');
        }
        return videoTempDir;
    }

    public async jobExecutorId(): Promise<string> {
        const videoManagerDir = this.jobProfileDirPath();
        let statObj;
        try {
            statObj = await stat(videoManagerDir)
        } catch (err) {
            if (err.code === 'ENOENT') {
                await mkdir(videoManagerDir, {recursive: true});
            }
        }

        if (!statObj.isDirectory()) {
            throw new Error(videoManagerDir + ' exists but not a directory');
        }
        const jobExecutorProfile = join(videoManagerDir, 'jobExecutor');
        let fc = null;
        try {
            fc = await readFile(jobExecutorProfile, {encoding: 'utf-8'});
        } catch (err) {
            if (err.code === 'ENOENT') {
                return await ConfigManagerImpl.writeNewProfile(jobExecutorProfile);
            }
            throw err;
        }

        if (fc) {
            return JSON.parse(fc).id;
        } else {
            return await ConfigManagerImpl.writeNewProfile(jobExecutorProfile);
        }
    }
    public maxJobProcessTime(): number {
        return this._config.maxJobProcessTime;
    }

    public fileRetentionDays(): number {
        return this._config.fileRetentionDays;
    }

    public failedFileRetentionDays(): number {
        return this._config.failedFileRetentionDays;
    }

    public maxThreadsToProcess(): number {
        const maxLogicalCores = os.cpus().length;
        if (this._config.maxThreadsToProcess === 0 || this._config.maxThreadsToProcess >= maxLogicalCores) {
            return 0;
        } else if (this._config.maxThreadsToProcess > 0) {
            return this._config.maxThreadsToProcess;
        } else {
            return maxLogicalCores + this._config.maxThreadsToProcess;
        }
    }

    public getFileUrl(filename: string, jobMessageId: string): string {
        const serverBaseUrl = process.env.SERVER_BASE_URL;
        filename = encodeURIComponent(filename);
        if (serverBaseUrl) {
            return `${serverBaseUrl}/video/output/${jobMessageId}/${filename}`;
        }
        return `${this.WebServerConfig().enableHttps ? 'https' : 'http'}://${this.WebServerConfig().host}:${this.WebServerConfig().port}/video/output/${jobMessageId}/${filename}`;
    }

    public databaseConfig(): MikroORMOptions<PostgreSqlDriver> {
        return Object.assign({
            namingStrategy: MiraNamingStrategy,
            migrations: {
                tableName: 'mikro_orm_migrations',
                path: 'dist/migrations',
                pathTs: 'src/migrations',
                glob: '!(*.d).{js.ts}',
                transactional: true,
                disableForeignKeys: true,
                allOrNothing: true,
                dropTables: true,
                safe: false,
                snapshot: true,
                emit: 'ts',
                generator: TSMigrationGenerator
            }
        }, this._ormConfig) as unknown as MikroORMOptions<PostgreSqlDriver>;
    }

    private static async writeNewProfile(profilePath): Promise<string> {
        const myId = randomUUID();
        await writeFile(profilePath, JSON.stringify({id: myId}));
        return myId
    }

    private static processPath(pathStr: string): string {
        const cwd = process.cwd();
        const home = os.homedir();
        const projectRoot = resolve(__dirname, '../../');
        return pathStr.replace(CWD_PATTERN, cwd).replace(HOME_PATTERN, home).replace(PROJECT_ROOT_PATTERN, projectRoot);
    }

    public ApiWebServerConfig(): WebServerConfig {
        return this._config.ApiWebServer as WebServerConfig;
    }

    public WebServerConfig(): WebServerConfig {
        return this._config.WebServer as WebServerConfig;
    }

    public jobLogPath(): string {
        return this._config.jobLogPath;
    }
}