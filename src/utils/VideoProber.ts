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

import { spawn } from 'child_process';
import { ContainerInfo } from '../domains/MediaInfo/ContainerInfo';
import { TrackInfo } from '../domains/MediaInfo/TrackInfo';

const COMMAND_TIMEOUT = 5000;

async function runCommandAndGetJson(cmdExc: string, cmdArgs: string[], input: string): Promise<any> {
    return new Promise((resolve, reject) => {
        try {
            const child = spawn(cmdExc, [...cmdArgs, input], {
                timeout: COMMAND_TIMEOUT,
                stdio: 'pipe'
            });
            let output = '';
            let error = '';
            child.stdout.on('data', (data) => {
                output += data;
            });
            child.stderr.on('data', (data) => {
                error += data;
            });
            child.on('close', (code) => {
                if (code !== 0) {
                    reject(error);
                    return;
                }
                resolve(JSON.parse(output));
            });
        } catch (exception) {
            reject(exception);
        }
    });
}

export async function getStreamsWithFfprobe(input: string): Promise<any> {
    const result = await runCommandAndGetJson('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams'], input);
    return result.streams
}

export async function getStreamsInfo(input: string): Promise<TrackInfo[]> {
    const result = await runCommandAndGetJson("mediainfo", ["--Output=JSON", "-f"], input);
    return result.media.track as TrackInfo[];
}

export async function getContainerInfo(input: string): Promise<ContainerInfo> {
    const result = await getStreamsInfo(input);
    return result.find(track => track['@type'] === 'General') as ContainerInfo;
}

export async function isPlayableContainer(input: string): Promise<boolean> {
    const info = await getContainerInfo(input);
    return info.Format === 'MPEG-4';
}