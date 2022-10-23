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

import { Socket } from 'socket.io';
import { createInterface } from 'readline';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { Tail } from 'tail';
import pino from 'pino';
import { LOG_END_FLAG } from '../../utils/Logger';

const logger = pino();

export abstract class LogControllerBase {

    protected async isFileExists(logPath: string): Promise<boolean> {
        try {
            const fStats = await stat(logPath);
            return fStats.isFile();
        } catch (e) {
            return false;
        }
    }

    protected tail(logPath: string, socket: Socket): void {
        const tail = new Tail(logPath);
        tail.on('line', (line) => {
            if (line) {
                try {
                    const lineDict = JSON.parse(line);
                    if (lineDict.msg === LOG_END_FLAG) {
                        socket.emit('line_end', 'end of the log');
                        socket.disconnect();
                        return;
                    }
                } catch (err) {
                    logger.error(err);
                }
            }
            socket.emit('line', line);
        });

        tail.on('error', (error) => {
            logger.error(error);
            socket.emit('error', error);
            socket.disconnect();
        });

        socket.on('disconnect', (reason) => {
            if (tail) {
                tail.unwatch();
            }
        });
    }

    protected readToEnd(logPath: string, socket: Socket): void {
        const rl = createInterface({
            input: createReadStream(logPath, {encoding: 'utf-8'})
        });
        rl.on('line', (line) => {
            socket.emit('line', line);
        });
        rl.on('close', () => {
            socket.emit('line_end', 'end of the log');
            socket.disconnect();
        });
        rl.on('error', (error) => {
            socket.emit('error', error);
            socket.disconnect();
        });

        socket.on('disconnect', (reason) => {
            if (rl) {
                rl.close();
            }
        });
    }

    protected closeSocketWithError(socket: Socket, message: string): void {
        socket.emit('error', new Error(message));
        socket.disconnect();
    }
}