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

import { VideoOutputMetadata } from '../domains/VideoOutputMetadata';
import { VertexMap } from '../domains/VertexMap';
import pino from 'pino';

export interface JobMetadataHelper {
    processMetaData(vertexMap: VertexMap, jobLogger: pino.Logger): Promise<VideoOutputMetadata>;
    generatePreviewImage(videoPath: string, metaData: VideoOutputMetadata, jobLogger: pino.Logger): Promise<void>;
}