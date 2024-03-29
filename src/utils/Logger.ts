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

import pino from 'pino';

/**
 * note that filePath should be in an existed folder
 * @param filePath
 */
export function getFileLogger(filePath: string): pino.Logger {
    return pino({
        timestamp: pino.stdTimeFunctions.isoTime
    }, pino.destination({
        dest: filePath,
        sync: true,
        mkdir: true
    }));
}

export function getStdLogger(base?: any): pino.Logger {
    return pino({
        timestamp: pino.stdTimeFunctions.isoTime,
        base
    });
}

export const LOG_END_FLAG = 'LOG_END';
