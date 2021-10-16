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
import { getStreamsWithFfprobe } from '../../utils/VideoProber';

const DEFAULT_BIT_RATE_PER_CHANNEL = 64; // kbit/s

/**
 * Support preferred track with the following format:
 * _preferredTrack is empty: use default audio track
 * _preferredTrack is a number: use 0-based index of audio (exclude other type of tracks)
 * _preferredTrack is a format field:value, field is the name of property of audio stream when running ffprobe -v error -print_format json -show_format -show_streams
 * value is the property value, if the property is a sub property, a dot is needed. only one level sub property is supported.
 * If there is only one audio stream the _preferredTrack is ignored
 */
export class SoundOnlyProfile extends BaseProfile {
    public static profileName = 'sound_only'

    constructor(videoFilePath: string, private _preferredTrack: string, actionIndex: number) {
        super(videoFilePath, actionIndex);
    }

    private static isPropertyEqual(prop1: any, prop2: string): boolean {
        return prop1 && (prop1 + '') === prop2;
    }

    private parsePreferredTrack(): any[] {
        const index = parseInt(this._preferredTrack, 10);
        if (Number.isInteger(index)) {
            return [index];
        } else {
            let pair = this._preferredTrack.split(':');
            pair = pair.map(p => p.trim()).filter(p => p !== '');
            if (pair.length !== 2) {
                return [];
            }
            const property = pair[0];
            const properties = property.split('.').map(p => p.trim()).filter(p => p !== '');
            if (properties.length === 2) {
                return [properties[0], properties[1], pair[1]];
            } else {
                return [property, pair[1]];
            }
        }
    }

    public async getCommandArgs(): Promise<string[]> {
        const streams = await getStreamsWithFfprobe(this.videoFilePath);
        const audioStreams = streams.filter(stream => stream.codec_type.toLowerCase() === 'audio');
        let audioStreamIndex = -1;
        if (audioStreams.length > 1) {
            if (this._preferredTrack) {
                const result = this.parsePreferredTrack();
                if (result.length === 1) {
                    audioStreamIndex = result[0];
                } else {
                    for (let i = 0; i < audioStreams.length; i++) {
                        if (result.length === 2) {
                            const streamPropertyVal = audioStreams[i][result[0]];
                            if (SoundOnlyProfile.isPropertyEqual(streamPropertyVal, result[1])) {
                                audioStreamIndex = i;
                                break;
                            }
                        } else if (result.length === 3) {
                            const subObj = audioStreams[i][result[0]];
                            if (subObj && SoundOnlyProfile.isPropertyEqual(subObj[result[1]], result[2])) {
                                audioStreamIndex = i;
                                break;
                            }
                        }
                    }
                }
            }
        }
        let bitrate: number;
        if (audioStreamIndex === -1) {
            bitrate = this.getAudioChannelCount(audioStreams.find(stream => stream.disposition.default === 1)) * DEFAULT_BIT_RATE_PER_CHANNEL;
            return ['-i', this.videoFilePath, '-c:a', 'aac', `-b:a`, `${bitrate}k`, '-c:v', 'copy', '-strict', '-2'];
        } else {
            bitrate = this.getAudioChannelCount(audioStreams[audioStreamIndex]) * DEFAULT_BIT_RATE_PER_CHANNEL;
            return ['-i', this.videoFilePath, '-c:a', 'aac', `-b:a:${audioStreamIndex}`, `${bitrate}k`, '-c:v', 'copy', '-strict', '-2'];
        }

    }
}