/*
 * Copyright 2025 IROHA LAB
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

export const TYPES_VM = {
    ProfileFactory: Symbol.for('Factory<Profile>'),
    ProcessorFactory: Symbol.for('Factory<VideoProcessor>'),
    VideoProcessor: Symbol.for('VideoProcessor'),
    LocalConvertProcessor: Symbol.for('LocalConvertProcessor'),
    LocalExtractProcessor: Symbol.for('LocalExtractProcessor'),
    LocalValidateProcessor: Symbol.for('LocalValidateProcessor'),
    JobApplication: Symbol.for('JobApplication'),
    ExtractorFactory: Symbol.for('Factory<Extractor>'),
    VertexManager: Symbol.for('VertexManager'),
    VertexManagerFactory: Symbol.for('Factory<VertexManager>'),
    JobManager: Symbol.for('JobManager'),
    JobManagerFactory: Symbol.for('Factory<JobManager>'),
    JobMetadataHelper: Symbol.for('JobMetadataHelper')
};

export type WebServerConfig = {
    host: string;
    port: number;
    enableHttps: boolean;
};


export const EXEC_MODE_NORMAL = 'NORMAL_MODE';
export const EXEC_MODE_META = 'META_MODE';

// job queues:
export const META_JOB_QUEUE = 'meta_job_queue';
export const VIDEO_JOB_RESULT_QUEUE = 'video_job_result_queue';
export const JS_COMMAND_QUEUE = 'js_command_queue';

// routing key
export const NORMAL_JOB_KEY = 'normal_job';
export const META_JOB_KEY = 'meta_job';
export const VIDEO_JOB_RESULT_KEY = 'video_job_result_key';
export const JS_COMMAND = 'js.command';
export const JE_COMMAND = 'je.command';

// exchange
export const VIDEO_MANAGER_COMMAND_EXCHANGE = 'video_manager_command_exchange';