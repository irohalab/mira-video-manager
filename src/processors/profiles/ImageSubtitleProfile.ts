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

import { ConvertAction } from '../../domains/ConvertAction';
import { StreamInfo, SubtitleStreamInfo } from '../../domains/Media/StreamInfo';
import { AudioStream } from '../../utils/Runtime/AudioStream';
import { MediaContainer } from '../../utils/Runtime/MediaContainer';
import { getStreamsWithFfprobe } from '../../utils/VideoProber';
import { BaseProfile } from './BaseProfile';

export type ImageSubtitleExtraData = {
    propertyName?: string;
    propertyValueRegex?: string;
    selectDefault?: boolean | string;
};

const DEFAULT_PROPERTY = 'tags.language';
const DEFAULT_PROPERTY_VALUE_REGEX = '(chinese|zh|chi|zho|chs|cht)';
const IMAGE_SUBTITLE_CODECS = new Set([
    'hdmv_pgs_subtitle',
    'pgs',
    'dvd_subtitle',
    'dvb_subtitle',
    'dvbsub',
    'xsub',
    'dvb_teletext'
]);

/**
 * Burn embedded image-based subtitles (e.g. PGS / VobSub / DVB) into H.264 video via FFmpeg overlay filter.
 * Copies the mapped audio stream when it is already AAC, and encodes it to AAC otherwise.
 */
export class ImageSubtitleProfile extends BaseProfile {
    public static profileName = 'image_subtitle';

    constructor(
        action: ConvertAction,
        private _extraData: ImageSubtitleExtraData = {},
        fontsDir: string = '',
        private _getStreams: (input: string) => Promise<StreamInfo[]> = getStreamsWithFfprobe
    ) {
        super(action, fontsDir);
    }

    public async getCommandArgs(): Promise<string[]> {
        if (!this.action.videoFilePath) {
            throw new Error('videoFilePath is required for ImageSubtitleProfile');
        }
        const streams = await this._getStreams(this.action.videoFilePath);
        const mediaContainer = new MediaContainer({ format: null, streams });
        const videoStream = mediaContainer.getDefaultVideoStreamInfo();
        if (!videoStream) {
            throw new Error('Could not find video stream');
        }

        const subtitleStream = this.findImageSubtitleStream(streams);
        const needsScale = Boolean(
            subtitleStream.width &&
            subtitleStream.height &&
            videoStream.width &&
            videoStream.height &&
            (subtitleStream.width !== videoStream.width || subtitleStream.height !== videoStream.height)
        );
        const filterComplex = needsScale
            ? `[0:${subtitleStream.index}]scale=${videoStream.width}:${videoStream.height}[sub];[0:${videoStream.index}][sub]overlay[v]`
            : `[0:${videoStream.index}][0:${subtitleStream.index}]overlay[v]`;

        const inputArgs = ['-i', this.action.videoFilePath];
        const audioMapArgs: string[] = [];
        const audioCodecArgs: string[] = [];

        if (this.action.audioFilePath) {
            inputArgs.push('-i', this.action.audioFilePath);
            const externalStreams = await this._getStreams(this.action.audioFilePath);
            const externalAudio = new MediaContainer({ format: null, streams: externalStreams }).getDefaultAudioStreamInfo();
            if (!externalAudio) {
                throw new Error('Could not find audio stream in audioFilePath');
            }
            audioMapArgs.push('-map', `1:${externalAudio.index}`);
            audioCodecArgs.push('-c:a', new AudioStream(externalAudio).isPlayable() ? 'copy' : 'aac');
        } else {
            const audioStream = mediaContainer.getDefaultAudioStreamInfo();
            if (audioStream) {
                audioMapArgs.push('-map', `0:${audioStream.index}`);
                audioCodecArgs.push('-c:a', new AudioStream(audioStream).isPlayable() ? 'copy' : 'aac');
            }
        }

        return [
            ...inputArgs,
            '-filter_complex', filterComplex,
            '-map', '[v]',
            ...audioMapArgs,
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            ...audioCodecArgs,
            '-strict', '-2'
        ];
    }

    private findImageSubtitleStream(streams: StreamInfo[]): SubtitleStreamInfo {
        const imageSubStreams = streams.filter(
            (s): s is SubtitleStreamInfo =>
                s.codec_type === 'subtitle' &&
                Boolean(s.codec_name && IMAGE_SUBTITLE_CODECS.has(s.codec_name.toLowerCase()))
        );
        if (imageSubStreams.length === 0) {
            throw new Error('Could not find image-based subtitle track');
        }

        const extraData = this._extraData && typeof this._extraData === 'object' ? this._extraData : {};
        const isSelectDefault = extraData.selectDefault === true || extraData.selectDefault === 'true';
        const hasExplicitFilter = Boolean(extraData.propertyName && extraData.propertyValueRegex);

        if (isSelectDefault && !hasExplicitFilter) {
            const defaultTrack = imageSubStreams.find(s => s.disposition?.default === 1);
            if (defaultTrack) {
                return defaultTrack;
            }
        }

        const propertyName = hasExplicitFilter ? extraData.propertyName : DEFAULT_PROPERTY;
        const propertyValueRegex = hasExplicitFilter ? extraData.propertyValueRegex : DEFAULT_PROPERTY_VALUE_REGEX;
        const pvNamePaths = propertyName.split('.');
        const pvRegExp = new RegExp(propertyValueRegex, 'i');

        for (const info of imageSubStreams) {
            if (isSelectDefault && info.disposition?.default === 1) {
                return info;
            }
            let prop: any = info;
            for (const p of pvNamePaths) {
                prop = prop?.[p];
                if (prop === undefined || prop === null) {
                    break;
                }
            }
            if ((typeof prop === 'string' || typeof prop === 'number') && pvRegExp.test(String(prop))) {
                return info;
            }
        }

        if (imageSubStreams.length === 1) {
            return imageSubStreams[0];
        }

        throw new Error('Could not find track that match condition');
    }
}
