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

import { Options } from 'amqplib';
import { ConnectionOptions } from 'typeorm/connection/ConnectionOptions';

export interface ConfigManager {
    amqpServerUrl(): string;

    amqpConfig(): Options.Connect;

    /**
     * AppId and Host mapping, from the perspective of this application to access target app, use the write method.
     * for example: if the DownloadManagerApp is in the same vnet, then the host should be replaced with value that is
     * the host name in the vnet instead of public url.
     * @constructor
     */
    appIdHostMap(): { [id: string]: string };

    /* below are JobExecutor specific */
    /**
     * Get the temp directory for video processor
     */
    videoFileTempDir(): string;

    /**
     * Get the profile path for this app
     */
    jobProfileDirPath(): string;

    /**
     * Get the app id, the id is used to identify the job message current process by the app
     */
    jobExecutorId(): Promise<string>;

    enabledHttps(): boolean;
    serverHost(): string;
    serverPort(): number;

    /**
     * Generate the file url for downloading output from job executor.
     */
    getFileUrl(filename: string, jobMessageId: string): string;

    /**
     * Generate postgres configuration
     */
    databaseConnectionConfig(): ConnectionOptions;
}