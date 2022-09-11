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

export const TYPES_VM = {
    ProfileFactory: Symbol.for('Factory<Profile>'),
    ProcessorFactory: Symbol.for('Factory<VideoProcessor>'),
    VideoProcessor: Symbol.for('VideoProcessor'),
    LocalConvertProcessor: Symbol.for('LocalConvertProcessor'),
    JobApplication: Symbol.for('JobApplication'),
    ExtractorFactory: Symbol.for('Factory<Extractor>'),
    VertexManager: Symbol.for('VertexManager'),
    VertexManagerFactory: Symbol.for('Factory<VertexManager>'),
    JobManager: Symbol.for('JobManager'),
    JobManagerFactory: Symbol.for('Factory<JobManager>'),
};

export type WebServerConfig = {
    host: string;
    port: number;
    enableHttps: boolean;
};
