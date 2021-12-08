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

import { MQMessage } from './MQMessage';
import { RemoteFile } from './RemoteFile';

/**
 * Download Manager publish DownloadMQMessage once a download task is completed.
 * If there is multiple files match multiple episodes. Multiple DownloadMQMessage will be published
 * for each file.
 */
export class DownloadMQMessage implements MQMessage {
    public id: string;
    public bangumiId: string;
    public downloadTaskId: string;
    public videoId: string;
    public downloadManagerId: string; // can used to determine whether to use uri or local path to retrieve the video file.
    public videoFile: RemoteFile;
    public otherFiles: RemoteFile[]; // other files in the same download task.
    public version: string;
}