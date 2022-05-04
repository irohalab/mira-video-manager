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

import { tokenize } from 'esprima';
import * as vm from 'vm';
import { getStreamsInfo } from './VideoProber';
import { MediaContainer } from './Runtime/MediaContainer';
import { VideoStream } from './Runtime/VideoStream';
import { AudioStream } from './Runtime/AudioStream';
import { basename, extname } from 'path';
import { RemoteFile, TokenCheckException } from '@irohalab/mira-shared';

interface Token {
    type: string;
    value: string;
    range?: number[];
}

// allow keyword: false
// allowed Identifier:
const ID_VIDEO_FILENAME = 'video_filename';
const ID_OTHER_FILENAMES = 'other_filenames';
const ID_VIDEO_CONTAINER = 'video_container';
const ID_VIDEO_STREAM = 'video_stream';
const ID_AUDIO_STREAM = 'audio_stream';

const TOKEN_TYPE = {
    Punctuator: 'Punctuator',
    Identifier: 'Identifier',
    Numeric: 'Numeric',
    Keyword: 'Keyword',
    BlockComment: 'BlockComment',
    RegularExpression: 'RegularExpression',
    String: 'String'
};

// disallowed punctuator
const DISALLOWED_PUNCTUATOR = [';', '=', '=>', '{', '}'];

// allowed built-in identifier:
const builtInIdentifier = ['Math', 'String', 'RegExp', 'Array', 'extname', 'basename']
    .concat(Object.getOwnPropertyNames(Math).filter(m => m !== 'constructor' && typeof Math[m] === 'function'))
    .concat(Object.getOwnPropertyNames(String.prototype).filter(m => m !== 'constructor' && typeof String.prototype[m] === 'function'))
    .concat(Object.getOwnPropertyNames(RegExp.prototype).filter(m => m !== 'constructor' && typeof RegExp.prototype[m] === 'function'))
    .concat(Object.getOwnPropertyNames(Array.prototype).filter(m => m !== 'constructor' && typeof Array.prototype[m] === 'function'));

const ALLOWED_IDENTIFIER = [ID_VIDEO_FILENAME, ID_OTHER_FILENAMES, ID_VIDEO_CONTAINER, ID_VIDEO_STREAM, ID_AUDIO_STREAM]
    .concat(builtInIdentifier)
    .concat(Object.getOwnPropertyNames(MediaContainer.prototype).filter(m => m !== 'constructor'))
    .concat(Object.getOwnPropertyNames(VideoStream.prototype).filter(m => m !== 'constructor'))
    .concat(Object.getOwnPropertyNames(AudioStream.prototype).filter(m => m !== 'constructor'));

export class ConditionParser {

    constructor(private _condition: string,
                private _videoFile: RemoteFile,  /* remote file's uri and localPath is preprocessed, they are mutual exclusive. */
                private _otherFiles: RemoteFile[]) {

    }

    public tokenCheck(): void {
        const tokens = tokenize(this._condition, {range: true}) as Token[];
        for(const token of tokens) {
            switch (token.type) {
                case TOKEN_TYPE.Punctuator:
                    if (DISALLOWED_PUNCTUATOR.includes(token.value)) {
                        throw new TokenCheckException('Punctuator not support: ' + token.value, token.range, token.type);
                    }
                    break;
                case TOKEN_TYPE.Identifier:
                    if (!ALLOWED_IDENTIFIER.includes(token.value)) {
                        throw new TokenCheckException('Identifier not support: ' + token.value, token.range, token.type);
                    }
                    break;
                case TOKEN_TYPE.RegularExpression:
                case TOKEN_TYPE.Numeric:case TOKEN_TYPE.String:
                    // allowed
                    break;
                default:
                    throw new TokenCheckException('Unsupported token type', token.range, token.type);
            }
        }
    }

    public async evaluate(): Promise<boolean> {
        const sandbox = {
            [ID_VIDEO_FILENAME]: this._videoFile.filename,
            [ID_OTHER_FILENAMES]: this._otherFiles.map(f => f.filename),
            basename,
            extname
        };
        await this.getVideoInfo(sandbox);
        vm.createContext(sandbox);
        return vm.runInContext(this._condition, sandbox);
    }

    private async getVideoInfo(sandbox: any): Promise<void> {
        const videoFilePath = this._videoFile.fileUri || this._videoFile.fileLocalPath;
        const trackInfos = await getStreamsInfo(videoFilePath);
        sandbox.video_container = new MediaContainer(trackInfos);
        sandbox.video_stream = new VideoStream(sandbox.video_container.getDefaultVideoStreamInfo());
        sandbox.audio_stream = new AudioStream(sandbox.video_container.getDefaultAudioStreamInfo());
    }
}