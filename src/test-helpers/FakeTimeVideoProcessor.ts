/*
 * Copyright 2025 IROHA LAB
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

import { VideoProcessor } from '../processors/VideoProcessor';
import { JobMessage } from '../domains/JobMessage';
import { Vertex } from '../entity/Vertex';
import { promisify } from 'util';
import { injectable } from 'inversify';

const sleep = promisify(setTimeout);

@injectable()
export class FakeTimeVideoProcessor implements VideoProcessor {
    private canceled: boolean = false;
    private vertexId: string = 'None';
    public async prepare(jobMessage: JobMessage, vertex: Vertex): Promise<void> {
        this.vertexId = vertex.id;
        return Promise.resolve();
    }
    public async process(vertex: Vertex): Promise<string> {
        this.vertexId = vertex.id;
        for (let i = 0; i < 30; i++) {
            console.log(`processing vertex ${vertex.id} loop #${i}, canceled=${this.canceled}`);
            if (this.canceled) {
                break;
            }
            await sleep(1000);
        }
        return Promise.resolve('');
    }
    public async cancel(): Promise<void> {
        this.canceled = true;
        console.log('Trying to cancel ' + this.vertexId);
        return Promise.resolve();
    }
    public registerLogHandler(callback: (logChunk: string, ch: 'stdout' | 'stderr') => void): void {
        // nothing
    }
    public async dispose(): Promise<void> {
        return Promise.resolve();
    }
}