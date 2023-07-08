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

import { Extractor, ExtractorLogger } from './Extractor';
import { Vertex } from '../../entity/Vertex';
import { ExtractAction } from '../../domains/ExtractAction';
import { getStreamsWithFfprobe } from '../../utils/VideoProber';

/**
 * describe how to find a track based ffprobe track properties
 * the properties support nested path like `tags.language` means tags property's sub property language
 * the regex will ignore case
 * if selectDefault set to true, then the other value will be ignored
 */
type ExtraData = { propertyName: string, propertyValueRegex: string, selectDefault: boolean };
const DEFAULT_PROPERTY = 'tags.language';
const DEFAULT_PROPERTY_VALUE_REGEX = '(chinese|zh)';
const CODE_NAME_EXT_MAPPING = {
    mp3: '.mp3',
    aac: '.aac',
    vorbis: '.ogg',
    flac: '.flac',
    pcm_s16le: '.wav',
    ac3: '.ac3',
    dts: '.dts',
    wmav2: '.wma',
    opus: '.opus'
}

/**
 * Find a Audio Track from a video file and extract it to an audio file
 */
export class AudioExtractor implements Extractor {
    public static Id = 'Audio';
    public action: ExtractAction;
    private inputPath: string;
    constructor(private vertex: Vertex, public logger: ExtractorLogger) {
        this.action = this.vertex.action as ExtractAction;
        this.inputPath = this.action.videoFilePath;
    }

    public async extractCMD(): Promise<string[] | null> {
        // tslint:disable-next-line:prefer-const
        let {propertyName, propertyValueRegex, selectDefault} = this.action.extraData as ExtraData;
        if (!propertyName || !propertyValueRegex) {
            propertyName = DEFAULT_PROPERTY;
            propertyValueRegex = DEFAULT_PROPERTY_VALUE_REGEX;
        }
        const pvNamePaths = propertyName.split('.');
        const pvRegExp = new RegExp(propertyValueRegex, 'i');
        const streamsInfo: any[] = await getStreamsWithFfprobe(this.inputPath);
        let trackId = -1;
        let lastAudioTrack = -1;
        let info: any;
        let audioCount = 0;
        if (streamsInfo) {
            for (let i = 0; i < streamsInfo.length; i++) {
                info = streamsInfo[i];
                if (info.codec_type === 'audio') {
                    if (selectDefault && info.disposition?.default) {
                        trackId = i;
                        break;
                    } else {
                        lastAudioTrack = i;
                        audioCount++;
                        let prop = info;
                        for (const p of pvNamePaths) {
                            prop = info[p];
                            if (!prop) {
                                break;
                            }
                        }
                        if (typeof(prop) === 'string') {
                            if (pvRegExp.test(prop)) {
                                trackId = i;
                                break;
                            }
                        }
                    }
                }
            }
            if (trackId === -1 && lastAudioTrack !== -1 && audioCount === 1) {
                trackId = lastAudioTrack;
            }
        } else {
            throw new Error('Could not get stream info');
        }
        if (trackId === -1) {
            throw new Error('Could not find track that match condition');
        }
        if (this.action.outputExtname) {
            this.vertex.outputPath = this.vertex.outputPath + '.' + this.action.outputExtname;
        } else {
            this.vertex.outputPath = this.vertex.outputPath + this.getOutputExtFromCodeName(streamsInfo[trackId].codec_name);
        }

        return ['-i', this.inputPath, '-map', `0:${trackId}`, '-c:a', 'copy'];
    }

    public getInputPath(): string | null {
        return this.inputPath;
    }
    private getOutputExtFromCodeName(codeName: string): string {
        if (CODE_NAME_EXT_MAPPING.hasOwnProperty(codeName)) {
            return CODE_NAME_EXT_MAPPING[codeName];
        } else {
            this.logger(`Code Name: ${codeName} has no matched file extension name, will use default .vtt`, 'warn');
            return '.vtt';
        }
    }
}