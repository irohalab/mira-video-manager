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
import { load as loadYaml } from 'js-yaml';

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

type AppConfg = {
    amqp: {
        host: string;
        port: number;
        user: string;
        password: string;
    }
    appIdHostMap: { [appId: string]: string};
    jobExecProfileDir: string;
    videoTempDir: string;
    webserver: {
        enabledHttps: boolean;
        host: string;
        port: number;
    }
};

const CWD_PATTERN = /\${cwd}/;
const HOME_PATTERN = /\${home}/;
const PROJECT_ROOT_PATTERN = /\${project_root}/;

@injectable()
export class ConfigManagerImpl implements ConfigManager {
    private readonly _ormConfig: OrmConfig;
    private readonly _config: AppConfg;
    constructor() {
        const ormConfigPath = process.env.ORMCONFIG || resolve(__dirname, '../../ormconfig.json');
        const appConfigPath = process.env.APPCONFIG || resolve(__dirname, '../../config.yml');
        this._ormConfig = JSON.parse(readFileSync(ormConfigPath, { encoding: 'utf-8' }));
        this._config = loadYaml(readFileSync(appConfigPath, { encoding: 'utf-8'})) as AppConfg;
    }

    public amqpServerUrl(): string {
        const config = this.amqpConfig();
        return `${config.protocol}://${config.username}:${config.password}@${config.hostname}:${config.port}${config.vhost}?heartbeat=${config.heartbeat}&frameMax=${config.frameMax}`;
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

    /**
     * Use environment variable: APP1ID=HOST_URL1;APP2ID=HOST_URL2 format
     */
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

    enabledHttps(): boolean {
        return this._config.webserver.enabledHttps || false;
    }

    serverHost(): string {
        return this._config.webserver.host || 'localhost';
    }

    serverPort(): number {
        return this._config.webserver.port || 8080;
    }

    getFileUrl(filename: string, jobMessageId: string): string {
        const serverBaseUrl = process.env.SERVER_BASE_URL;
        if (serverBaseUrl) {
            return `${serverBaseUrl}/${jobMessageId}/${filename}`;
        }
        return `${this.enabledHttps() ? 'https' : 'http'}://${this.serverHost()}:${this.serverPort()}/video/output/${jobMessageId}/${filename}`;
    }

    public databaseConnectionConfig(): ConnectionOptions {
        return Object.assign({}, this._ormConfig) as ConnectionOptions;
    }

    private static async writeNewProfile(profilePath): Promise<string> {
        const myId = uuidv4();
        await writeFile(profilePath, JSON.stringify({id: myId}));
        return myId
    }

    private static processPath(pathStr: string): string {
        const cwd = process.cwd();
        const home = os.homedir();
        const projectRoot = resolve(__dirname, '../../');
        return pathStr.replace(CWD_PATTERN, cwd).replace(HOME_PATTERN, home).replace(PROJECT_ROOT_PATTERN, projectRoot);
    }
}