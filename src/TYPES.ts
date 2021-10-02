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

export const TYPES = {
    ProfileFactory: Symbol.for('ProfileFactory'),
    ProcessorFactory: Symbol.for('Factory<VideoProcessor>'),
    VideoProcessor: Symbol.for('VideoProcessor'),
    LocalConvertProcessor: Symbol.for('LocalConvertProcessor'),
    ConfigManager: Symbol.for('ConfigManager'),
    JobApplication: Symbol.for('JobApplication'),
    DatabaseService: Symbol.for('DatabaseService')
};

export type WebServerConfig = {
    host: string;
    port: number;
    enableHttps: boolean;
};

/**
 * Exchanges
 */
export const JOB_EXCHANGE = 'video_job';
export const DOWNLOAD_MESSAGE_EXCHANGE = 'download_message';
export const VIDEO_MANAGER_EXCHANGE = 'video_manager';

/**
 * Queues
 */
export const JOB_QUEUE = 'job_queue';
export const DOWNLOAD_MESSAGE_QUEUE = 'download_message_queue';
export const VIDEO_MANAGER_QUEUE = 'video_manager_queue';

/**
 * Binding Keys
 */
export const VIDEO_MANAGER_GENERAL = 'general';