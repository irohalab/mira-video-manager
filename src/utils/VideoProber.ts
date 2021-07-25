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

import { NotImplementException } from '../exceptions/NotImplementException';
import { spawn } from 'child_process';

export async function getStreamInfo(input): Promise<any> {
    return new Promise((resolve, reject) => {
        try {
            const child = spawn("ffprobe", ["-hide_banner", "-v", "error", "-show_streams", "-show_format", "-of", "json", input]);
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