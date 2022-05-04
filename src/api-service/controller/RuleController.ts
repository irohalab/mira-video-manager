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

import {
    controller,
    httpDelete,
    httpGet,
    httpPost,
    httpPut,
    interfaces,
    requestParam
} from 'inversify-express-utils';
import { Request } from 'express';
import { VideoProcessRule } from '../../entity/VideoProcessRule';
import { VideoProcessRuleService } from '../../services/VideoProcessRuleService';
import { ConditionParser } from '../../utils/ConditionParser';
import { ResponseWrapper, TokenCheckException } from '@irohalab/mira-shared';

@controller('/rule')
export class RuleController implements interfaces.Controller {

    constructor(private _videoProcessRuleService: VideoProcessRuleService) {
    }

    @httpGet('/')
    public async getRules(): Promise<ResponseWrapper<VideoProcessRule[]>> {
        const rules = await this._videoProcessRuleService.listAll();
        return {
            data: rules,
            status: 0
        };
    }

    @httpGet('/bangumi/:id')
    public async getRulesByBangumiId(@requestParam('id') bangumiId: string): Promise<ResponseWrapper<VideoProcessRule[]>> {
        const rules = await this._videoProcessRuleService.listByBangumi(bangumiId);
        return {
            data: rules,
            status: 0
        }
    }

    @httpPost('/')
    public async addRule(request: Request): Promise<ResponseWrapper<VideoProcessRule>> {
        const rule = request.body as VideoProcessRule;

        try {
            if (rule.condition) {
                const conditionParser = new ConditionParser(rule.condition, null, null);
                conditionParser.tokenCheck();
            }
            return {
                data: await this._videoProcessRuleService.addRule(rule),
                status: 0
            };
        } catch (ex) {
            throw ex;
        }
    }

    @httpPut('/:id')
    public async updateRule(request: Request): Promise<ResponseWrapper<any>> {
        const rule = await this._videoProcessRuleService.updateRule(request.params.id, request.body);
        return {
            status: 0,
            data: rule
        }
    }

    @httpDelete('/:id')
    public async deleteRule(@requestParam('id') id: string): Promise<ResponseWrapper<any>> {
        await this._videoProcessRuleService.deleteRule(id);
        return {
            status: 0,
            data: null,
            message: 'OK'
        }
    }

    @httpPost('/condition')
    public async checkCondition(request: Request): Promise<ResponseWrapper<any>> {
        const condition = request.body.condition;
        const conditionParser = new ConditionParser(condition, null, null);
        const result = {} as any;
        try {
            conditionParser.tokenCheck();
        } catch (ex) {
            if (ex instanceof TokenCheckException) {
                result.type = ex.type;
                result.message = ex.message;
                result.range = ex.range;
            } else {
                result.message = ex.message;
                result.type = 'unknown';
            }
        }
        return {
            status: result.type ? -1 : 0,
            data: result
        };
    }
}