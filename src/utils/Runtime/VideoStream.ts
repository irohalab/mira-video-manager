/*
 * Copyright 2026 IROHA LAB
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

import { VideoStreamInfo } from '../../domains/Media/StreamInfo';

const PLAYABLE_BIT_DEPTH = 8;
const PLAYABLE_PIX_FMTS = new Set(['yuv420p', 'yuvj420p']);

export class VideoStream {
    constructor(private _info: VideoStreamInfo | null) {
    }

    public isPlayable(): boolean {
        if (!this._info) {
            return false;
        }
        const bitDepth = this._info.bits_per_raw_sample
            ? parseInt(this._info.bits_per_raw_sample, 10)
            : PLAYABLE_BIT_DEPTH;
        return this._info.codec_name === 'h264'
            && Boolean(this._info.pix_fmt && PLAYABLE_PIX_FMTS.has(this._info.pix_fmt))
            && bitDepth === PLAYABLE_BIT_DEPTH;
    }

    public getInfo(): VideoStreamInfo | null {
        return this._info;
    }

    public getWidth(): number {
        return this._info ? Number(this._info.width) : 0;
    }

    public getHeight(): number {
        return this._info ? Number(this._info.height) : 0;
    }
}