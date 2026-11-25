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

import { spawn } from 'child_process';
import { open } from 'fs/promises';
import { ContainerInfo } from '../domains/Media/ContainerInfo';
import { MediaProbeResult } from '../domains/Media/MediaProbeResult';
import { StreamInfo } from '../domains/Media/StreamInfo';
import { MediaContainer } from './Runtime/MediaContainer';

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
            child.on('error', (err) => {
                reject(err);
            });
            child.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(error.trim() || `${cmdExc} exited with non-zero code ${code}`));
                    return;
                }
                try {
                    resolve(JSON.parse(output));
                } catch (parseErr) {
                    reject(parseErr);
                }
            });
        } catch (exception) {
            reject(exception);
        }
    });
}

/**
 * Inspect top-level ISO BMFF / MP4 box headers without reading media payloads.
 * Returns true when a `moov` atom precedes the first non-empty `mdat` atom (`+faststart`).
 */
export async function checkMp4Streamable(filePath: string): Promise<boolean> {
    let handle;
    try {
        handle = await open(filePath, 'r');
        const { size: fileSize } = await handle.stat();
        const header = Buffer.alloc(16);
        let offset = 0;
        let moovOffset = -1;
        let mdatOffset = -1;

        while (offset + 8 <= fileSize) {
            const { bytesRead } = await handle.read(header, 0, Math.min(16, fileSize - offset), offset);
            if (bytesRead < 8) {
                break;
            }
            const rawSize = header.readUInt32BE(0);
            const type = header.toString('ascii', 4, 8);
            let boxSize: number;
            let headerSize = 8;

            if (rawSize === 1) {
                if (bytesRead < 16) {
                    break;
                }
                boxSize = Number(header.readBigUInt64BE(8));
                headerSize = 16;
            } else if (rawSize === 0) {
                boxSize = fileSize - offset;
            } else {
                boxSize = rawSize;
            }

            if (boxSize < headerSize) {
                break;
            }
            if (type === 'moov' && moovOffset === -1) {
                moovOffset = offset;
            } else if (type === 'mdat' && boxSize > headerSize && mdatOffset === -1) {
                mdatOffset = offset;
            }

            if (moovOffset !== -1 && mdatOffset !== -1) {
                break;
            }
            offset += boxSize;
        }
        return moovOffset !== -1 && (mdatOffset === -1 || moovOffset < mdatOffset);
    } catch {
        return false;
    } finally {
        if (handle) {
            await handle.close();
        }
    }
}

export async function probeMedia(input: string): Promise<MediaProbeResult> {
    const result = await runCommandAndGetJson(
        'ffprobe',
        ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', '-i'],
        input
    );
    const format: ContainerInfo = result.format;
    const streams: StreamInfo[] = result.streams || [];
    if (format && format.format_name && format.format_name.split(',').map(f => f.trim()).includes('mp4')) {
        format.isStreamable = await checkMp4Streamable(input);
    } else if (format) {
        format.isStreamable = false;
    }
    return { format, streams };
}

export async function getStreamsWithFfprobe(input: string): Promise<StreamInfo[]> {
    const result = await runCommandAndGetJson(
        'ffprobe',
        ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', '-i'],
        input
    );
    return (result.streams || []) as StreamInfo[];
}

export async function getContainerInfo(input: string): Promise<ContainerInfo> {
    const { format } = await probeMedia(input);
    return format;
}

export async function isPlayableContainer(input: string): Promise<boolean> {
    const probeResult = await probeMedia(input);
    return new MediaContainer(probeResult).isPlayable();
}