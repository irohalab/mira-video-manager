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

import { VideoInfo } from '../../domains/MediaInfo/VideoInfo';

const PLAYABLE_BIT_DEPTH = 8;

export class VideoStream {
    constructor(private _info: VideoInfo) {
    }

    public isPlayable() {
        return this._info.Format === 'AVC' && parseInt(this._info.BitDepth, 10) === PLAYABLE_BIT_DEPTH
            && this._info.ColorSpace === 'YUV' && this._info.ChromaSubsampling === '4:2:0'
    }

    public getInfo(): VideoInfo {
        return this._info;
    }

    public getWidth(): number {
        return parseInt(this._info.Width, 10);
    }

    public getHeight(): number {
        return parseInt(this._info.Height, 10);
    }
}