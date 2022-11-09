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

import { VideoProcessor } from '../processors/VideoProcessor';
import { JobMessage } from '../domains/JobMessage';
import { Vertex } from '../entity/Vertex';
import { inject, injectable } from 'inversify';
import { TYPES } from '@irohalab/mira-shared';
import { DatabaseService } from '../services/DatabaseService';
import { VertexStatus } from '../domains/VertexStatus';
import { FakeVertexRepository } from './FakeVertexRepository';

@injectable()
export class FakeVideoProcessor implements VideoProcessor {

    constructor(@inject(TYPES.DatabaseService) private _databaseService: DatabaseService) {
    }

    public cancel(): Promise<void> {
        return Promise.resolve(undefined);
    }

    public dispose(): Promise<void> {
        return Promise.resolve(undefined);
    }

    public async prepare(jobMessage: JobMessage, vertex: Vertex): Promise<void> {
        const vertexRepo = this._databaseService.getVertexRepository();
        if ((vertexRepo as FakeVertexRepository).isVisited(vertex.id)) {
            throw new Error(`Vertex ${vertex.id}  have been visited twice!`);
        }
        (vertexRepo as FakeVertexRepository).markVisited(vertex.id);
        const actionMap = jobMessage.actions;
        const allUpstreamActionIds = vertex.action.upstreamActionIds;
        if (allUpstreamActionIds.length === 0) {
            return Promise.resolve();
        }
        // check vertex upstream is corrected related to actions
        if (vertex.upstreamVertexIds.length !== allUpstreamActionIds.length) {
            throw new Error('Vertex UpstreamIds\' count unmatched the action UpstreamIds\'');
        }

        const vertexMap = await vertexRepo.getVertexMap(jobMessage.jobId);

        for(const vtxId of vertex.upstreamVertexIds) {
            const vtx = vertexMap[vtxId];
            const idx = allUpstreamActionIds.indexOf(vtx.action.id);
            if (idx === -1) {
                throw new Error('Vertex and Action mapping not match');
            }
            if (vtx.status !== VertexStatus.Finished) {
                throw new Error('Not all upstream vertices are finished, this indicate an error in traversal of the vertex graph');
            }
        }
        return Promise.resolve(undefined);
    }

    public process(vertex: Vertex): Promise<string> {
        return Promise.resolve('');
    }

    public registerLogHandler(callback: (logChunk: string, ch: ("stdout" | "stderr")) => void): void {
        // nothing
    }

}