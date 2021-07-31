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

import { mkdir, rm } from 'fs/promises';
import { resolve } from 'path';

export const projectRoot = resolve(__dirname, '../../');

export async function ensureTempDir(videoTempDir: string): Promise<void> {
    try {
        await mkdir(videoTempDir, { recursive: true });
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.warn(e);
        }
    }
}

export async function cleanDir(dirPath: string): Promise<void> {
    try {
        await rm(dirPath, { recursive: true });
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.warn(e);
        }
    }
}