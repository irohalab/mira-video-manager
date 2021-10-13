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

import { BaseProfile } from "./BaseProfile";
import { NotImplementException } from "../../exceptions/NotImplementException";
import { join, dirname, basename } from "path";

export class VideoOnlyProfile extends BaseProfile {
    constructor(videoFilePath: string, actionIndex: number) {
        super(videoFilePath, actionIndex);
    }

    public static profileName = 'video_only'

    public getCommandArgs(): Promise<string[]> {
        return Promise.resolve(['-i', this.videoFilePath, '-c:v', 'libx264', '-vf', 'format=yuv420p', '-movflags', '+faststart', '-c:a', 'copy', '-strict', '-2']);
    }

    getOutputFilename(): string {
        return join(dirname(this.videoFilePath), basename(this.videoFilePath) + '-' + this.actionIndex + '.mp4');
    }
}