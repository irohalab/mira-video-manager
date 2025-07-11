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

import { VideoProcessRuleRepository } from '../repository/VideoProcessRuleRepository';
import { VideoProcessRule } from '../entity/VideoProcessRule';

const videoProcessRuleDict: {[id: string]: VideoProcessRule} = {};

export class FakeVideoProcessRuleRepository extends VideoProcessRuleRepository {
    public async save(rule: VideoProcessRule|VideoProcessRule[]): Promise<VideoProcessRule|VideoProcessRule[]> {
        if  (Array.isArray(rule)) {
            for (const v of rule) {
                this.addRule(v);
            }
        } else {
            this.addRule(rule as VideoProcessRule);
        }
        return rule;
    }

    public async findByBangumiId(bangumiId: string): Promise<VideoProcessRule[]> {
        const result = Object.values(videoProcessRuleDict).filter(rule => rule.bangumiId === bangumiId)
            .sort((v1, v2) => {
                return v2.priority - v1.priority;
            })
        return Promise.resolve(result);
    }

    private addRule(rule: VideoProcessRule): void {
        videoProcessRuleDict[rule.id] = rule;
    }
}