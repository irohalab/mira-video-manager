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

import { ConfigManager } from "./ConfigManager";
import * as process from 'process';
import { Options } from 'amqplib';
import * as os from 'os';
import { join, resolve } from 'path';
import { mkdir, stat, readFile, writeFile } from 'fs/promises';
import { injectable } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import { readFileSync } from 'fs';
import { ConnectionOptions } from 'typeorm/connection/ConnectionOptions';

type OrmConfig = {
    type: string;
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    synchronize: boolean;
    logging: boolean;
    entities: string[];
    migrations: string[];
    subscribers: string[];
    cli: { [key: string]: string };
};

@injectable()
export class ConfigManagerImpl implements ConfigManager {
    private _ormConfig: OrmConfig;

    constructor() {
        this._ormConfig = JSON.parse(readFileSync(resolve(__dirname, '../../ormconfig.json'), { encoding: 'utf-8' }));
    }

    public amqpServerUrl(): string {
        const config = this.amqpConfig();
        return `${config.protocol}://${config.username}:${config.password}@${config.hostname}:${config.port}${config.vhost}?heartbeat=${config.heartbeat}&frameMax=${config.frameMax}`;
    }

    public amqpConfig(): Options.Connect {
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

    /**
     * Use environment variable: APP1ID=HOST_URL1;APP2ID=HOST_URL2 format
     */
    appIdHostMap(): { [p: string]: string } {
        const idHostMapENV = process.env.APPID_HOST_MAP;
        const idHostMap = {};
        if (idHostMapENV) {
            const idHostPairs = idHostMapENV.split(';');
            for (const pair of idHostPairs) {
                const kv = pair.split('=');
                idHostMap[kv[0]] = kv[1];
            }
        }
        return idHostMap;
    }

    public jobProfileDirPath(): string {
        return process.env.JOBEXEC_PROFILE_DIR || join(os.homedir(), '.mira', 'video-manager');
    }

    public videoFileTempDir(): string {
        return process.env.VIDEO_TEMP_DIR || join(this.jobProfileDirPath(), 'temp');
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
            fc = readFile(jobExecutorProfile, {encoding: 'utf-8'});
        } catch (err) {
            if (err.code === 'ENOENT') {
                return await this.writeNewProfile(jobExecutorProfile);
            }
        }

        if (fc) {
            return JSON.parse(fc).id;
        } else {
            return await this.writeNewProfile(jobExecutorProfile);
        }
    }

    enabledHttps(): boolean {
        return process.env.ENABLED_HTTPS === 'true';
    }

    serverHost(): string {
        return process.env.SERVER_HOST || 'localhost';
    }

    serverPort(): number {
        const portStr = process.env.SERVER_PORT;
        return portStr ? parseInt(portStr, 10) : 8080;
    }

    getFileUrl(filename: string, jobMessageId: string): string {
        const serverBaseUrl = process.env.SERVER_BASE_URL;
        if (serverBaseUrl) {
            return `${serverBaseUrl}/${jobMessageId}/${filename}`;
        }
        return `${this.enabledHttps() ? 'https' : 'http'}://${this.serverHost()}:${this.serverPort()}/video/output/${jobMessageId}/${filename}`;
    }

    private async writeNewProfile(profilePath): Promise<string> {
        const myId = uuidv4();
        await writeFile(profilePath, JSON.stringify({id: myId}));
        return myId
    }

    public databaseConnectionConfig(): ConnectionOptions {
        return Object.assign({}, {
            host: process.env.DB_HOST || this._ormConfig.host,
            port: process.env.DB_PORT || this._ormConfig.port,
            username: process.env.DB_USER || this._ormConfig.username,
            password: process.env.DB_PASS || this._ormConfig.password,
            database: process.env.DB_NAME || this._ormConfig.database
        }, this._ormConfig) as ConnectionOptions;
    }
}