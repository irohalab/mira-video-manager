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

import { inject, injectable } from 'inversify';
import { DatabaseService } from './DatabaseService';
import { VideoProcessRule } from '../entity/VideoProcessRule';
import { TYPES } from '@irohalab/mira-shared';

@injectable()
export class VideoProcessRuleService {
    constructor(@inject(TYPES.DatabaseService) private _databaseService: DatabaseService) {
    }

    public async addRule(rule: VideoProcessRule): Promise<any> {
        const repo = this._databaseService.getVideoProcessRuleRepository(true);
        return await repo.save(rule);
    }

    public async listAll(): Promise<VideoProcessRule[]> {
        const repo = this._databaseService.getVideoProcessRuleRepository(true);
        return await repo.findAll();
    }

    public async listByBangumi(bangumiId: string): Promise<VideoProcessRule[]> {
        const repo = this._databaseService.getVideoProcessRuleRepository(true);
        return await repo.find({ bangumiId });
    }

    public async updateRule(ruleId: string, updateRule: VideoProcessRule): Promise<any> {
        const repo = this._databaseService.getVideoProcessRuleRepository(true);
        const rule = await repo.findOneOrFail({ id: ruleId });
        rule.name = updateRule.name;
        rule.condition = updateRule.condition;
        rule.actions = updateRule.actions;
        rule.priority = updateRule.priority;
        await repo.save(rule);
    }

    public async deleteRule(ruleId: string): Promise<any> {
        const repo = this._databaseService.getVideoProcessRuleRepository(true);
        await repo.nativeDelete({ id: ruleId });
    }
}