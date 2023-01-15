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

import { WebServerConfig } from '../TYPES';
import { BaseConfigManager } from '@irohalab/mira-shared';

export interface ConfigManager extends BaseConfigManager {

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

    /**
     * Get the base path for job log
     */
    jobLogPath(): string;

    maxJobProcessTime(): number;
    fileRetentionDays(): number;
    failedFileRetentionDays(): number;
    maxThreadsToProcess(): number;

    WebServerConfig(): WebServerConfig;
    ApiWebServerConfig(): WebServerConfig;

    /**
     * Generate the file url for downloading output from job executor.
     */
    getFileUrl(filename: string, jobMessageId: string): string;

    /**
     * Unit is days
     */
    getJobExpireTime(): {Canceled: number, UnrecoverableError: number, Finished: number};

    /**
     * Get fonts directory
     */
    fontsDir(): string;
}