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

import { VertexRepository } from '../repository/VertexRepository';
import { VertexMap } from '../domains/VertexMap';
import { Vertex } from '../entity/Vertex';
import { FilterQuery, FindOneOptions, FindOptions } from '@mikro-orm/core';
import { Loaded } from '@mikro-orm/core/typings';

let vertexMap: {[jobId: string]:VertexMap} = {};
let dbDict: VertexMap = {};
let visited: {[vxId: string]: boolean} = {};

export class FakeVertexRepository extends VertexRepository {

    public addVertex(vertex: Vertex): void {
        if (!vertexMap[vertex.jobId]) {
            vertexMap[vertex.jobId] = {};
        }
        vertexMap[vertex.jobId][vertex.id] = vertex;
    }

    public getVertexMap(jobId: string): Promise<VertexMap> {
        return Promise.resolve(vertexMap[jobId] || {});
    }

    public async find<Hint extends string = never, Fields extends string = '*', Excludes extends string = never>(where: FilterQuery<Vertex>,     options?: FindOneOptions<Vertex, Hint, Fields, Excludes> ): Promise<Loaded<Vertex, Hint, Fields, Excludes>[]> {
        // tslint:disable-next-line:no-string-literal
        const id = where['jobId'] as string;
        const vm = vertexMap[id];
        if (vm) {
            return Promise.resolve(Object.values(vm) as Loaded<Vertex, Hint, Fields, Excludes>[]);
        }
        return Promise.resolve([]);
    }

    public async findOne<Hint extends string = never, Fields extends string = '*', Excludes extends string = never>(where: FilterQuery<Vertex>, options?: FindOneOptions<Vertex, Hint, Fields, Excludes>): Promise<Loaded<Vertex, Hint, Fields, Excludes> | null> {
        // tslint:disable-next-line:no-string-literal
        const id = where['id'] as string;
        const vx = dbDict[id];
        if (vx) {
            return vx as Loaded<Vertex, Hint, Fields, Excludes>;
        } else {
            return null;
        }
    }
    public async save(vertex: Vertex|Vertex[]): Promise<Vertex|Vertex[]> {
        if (Array.isArray(vertex)) {
            for (const v of vertex) {
                dbDict[v.id] = v;
                this.addVertex(v);
            }
        } else {
            dbDict[vertex.id] = vertex;
            this.addVertex(vertex);
        }
        return vertex;
    }

    public reset(): void {
        vertexMap = {};
        dbDict = {};
        visited = {};
    }

    public markVisited(vertexId: string): void {
        visited[vertexId] = true;
    }

    public isVisited(vertexId: string): boolean {
        return visited[vertexId] === true;
    }
}