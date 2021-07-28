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

async function runCommandAndGetJson(cmdExc: string, cmdArgs: string[], input: string): Promise<any> {
    return new Promise((resolve, reject) => {
        try {
            const child = spawn(cmdExc, [...cmdArgs, input]);
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

export async function getStreamInfo(input: string): Promise<any> {
    return await runCommandAndGetJson("ffprobe", ["-hide_banner", "-v", "error", "-show_streams", "-of", "json"], input);
}

export async function getContainerInfo(input): Promise<any> {
    return await runCommandAndGetJson("mediainfo", ["--Output=JSON", "-f"], input);
}

export async function isPlayableContainer(input: string): Promise<boolean> {
    const info = await getContainerInfo(input);
    for (const track of info.media.track) {
        if (track['@type'] === 'General') {
            return track.Format === 'MPEG-4';
        }
    }
    return false;
}