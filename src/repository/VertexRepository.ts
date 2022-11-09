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

import { BaseEntityRepository } from '@irohalab/mira-shared/repository/BaseEntityRepository';
import { VertexMap } from '../domains/VertexMap';
import { Vertex } from '../entity/Vertex';

export class VertexRepository extends BaseEntityRepository<Vertex> {
    public async getVertexMap(jobId: string): Promise<VertexMap> {
        const vertices = await this.find({ jobId });
        if (vertices && vertices.length > 0) {
            const verticesMap = {} as VertexMap;
            vertices.forEach(v => {
                verticesMap[v.id] = v;
            });
            return verticesMap;
        } else {
            return null;
        }
    }

    public async getOutputVertices(jobId: string): Promise<Vertex[]> {
        const vertices = await this.find({ jobId });
        if (vertices && vertices.length > 0) {
            return vertices.filter((vertex: Vertex) => {
                return vertex.downstreamVertexIds.length === 0;
            });
        } else {
            return [];
        }
    }
}