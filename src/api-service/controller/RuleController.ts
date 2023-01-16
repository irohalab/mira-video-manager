/*
 * Copyright 2023 IROHA LAB
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
    BaseHttpController,
    controller,
    httpDelete,
    httpGet,
    httpPost,
    httpPut, IHttpActionResult,
    interfaces,
    requestParam
} from 'inversify-express-utils';
import { Request } from 'express';
import { VideoProcessRule } from '../../entity/VideoProcessRule';
import { ConditionParser } from '../../utils/ConditionParser';
import { TokenCheckException, TYPES } from '@irohalab/mira-shared';
import { ActionType } from '../../domains/ActionType';
import { ExtractAction } from '../../domains/ExtractAction';
import { DatabaseService } from '../../services/DatabaseService';
import { getStdLogger } from '../../utils/Logger';
import { BadRequestResult, InternalServerErrorResult } from 'inversify-express-utils/lib/results';
import { ConfigManager } from '../../utils/ConfigManager';
import { readdir } from 'fs/promises';
import { extname, join } from 'path';
import { open as openFont } from 'fontkit';
import { inject } from 'inversify';

const logger = getStdLogger();

@controller('/rule')
export class RuleController extends BaseHttpController implements interfaces.Controller {
    private readonly _fontsDir: string;
    private fontFileNameMap = new Map<string, string>();
    constructor(@inject(TYPES.DatabaseService) private _databaseService: DatabaseService,
                @inject(TYPES.ConfigManager) private _configManager: ConfigManager) {
        super();
        this._fontsDir = this._configManager.fontsDir();
    }

    @httpGet('/')
    public async getRules(): Promise<IHttpActionResult> {
        try {
            const rules = await this._databaseService.getVideoProcessRuleRepository(true).findAll();
            return this.json({
                data: rules,
                status: 0
            });
        } catch (ex) {
            logger.warn(ex);
            return new InternalServerErrorResult();
        }
    }

    @httpGet('/bangumi/:id')
    public async getRulesByBangumiId(@requestParam('id') bangumiId: string): Promise<IHttpActionResult> {
        try {
            const rules = await this._databaseService.getVideoProcessRuleRepository(true).findByBangumiId(bangumiId);
            return this.json({
                data: rules,
                status: 0
            });
        } catch (ex) {
            logger.warn(ex);
            return new InternalServerErrorResult();
        }
    }

    @httpPost('/')
    public async addRule(request: Request): Promise<IHttpActionResult> {
        const rule = request.body as VideoProcessRule;
        try {
            if (rule.condition) {
                const conditionParser = new ConditionParser(rule.condition, null, null);
                conditionParser.tokenCheck();
            }

            if (rule.actions) {
                Object.keys(rule.actions).forEach(actId => {
                    const action = rule.actions[actId];
                    // auto correction for extractId
                    if (action && action.type === ActionType.Extract && !(action as ExtractAction).extractorId) {
                        throw new Error('No extractorId');
                    }
                });
            } else {
                return new BadRequestResult();
            }
            const result = await this._databaseService.getVideoProcessRuleRepository(true).save(rule);
            return this.json({
                data: result,
                status: 0
            });
        } catch (ex) {
            logger.warn(ex);
            if (ex.message && ex.message === 'No extractorId') {
                return new BadRequestResult();
            }
            return new InternalServerErrorResult();
        }
    }

    @httpPut('/:id')
    public async updateRule(request: Request): Promise<IHttpActionResult> {
        const ruleId = request.params.id;
        const updateRule = request.body;
        try {
            const repo = this._databaseService.getVideoProcessRuleRepository(true);
            const rule = await repo.findOneOrFail({ id: ruleId });
            rule.name = updateRule.name;
            rule.condition = updateRule.condition;
            rule.actions = updateRule.actions;
            rule.priority = updateRule.priority;
            await repo.save(rule);
            return this.json({
                status: 0,
                data: rule
            });
        } catch (ex) {
            logger.warn(ex);
            return new InternalServerErrorResult();
        }
    }

    @httpDelete('/:id')
    public async deleteRule(@requestParam('id') id: string): Promise<IHttpActionResult> {
        try {
            await this._databaseService.getVideoProcessRuleRepository(true).nativeDelete({id});
            return this.json({
                status: 0,
                data: null,
                message: 'OK'
            });
        } catch (ex) {
            logger.warn(ex);
            return new InternalServerErrorResult();
        }
    }

    @httpPost('/condition')
    public async checkCondition(request: Request): Promise<IHttpActionResult> {
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
        return this.json({
            status: result.type ? -1 : 0,
            data: result
        });
    }

    @httpGet('/font')
    public async listFontName(): Promise<IHttpActionResult> {
        const fsDirentList = await readdir(this._fontsDir, {encoding: 'utf-8', withFileTypes: true});
        const fontFileList = fsDirentList.filter(f => {
            if(f.isFile()) {
                const ext = extname(f.name).toLowerCase();
                return ext === '.ttf' || ext === '.otf';
            } else {
                return false;
            }
        }).map(f => join(this._fontsDir, f.name));
        const result = [];
        let fontName: string;
        for (const fontFilePath of fontFileList) {
            if (this.fontFileNameMap.has(fontFilePath)) {
                result.push(this.fontFileNameMap.get(fontFilePath));
            } else {
                fontName = await this.readFontName(fontFilePath);
                if (fontName) {
                    this.fontFileNameMap.set(fontFilePath, fontName);
                    result.push(fontName);
                }
            }
        }
        return this.json({
            data: result,
            status: 0
        });
    }

    public async uploadFontFile(req: Request): Promise<IHttpActionResult> {
        // TODO: finish this API
        return Promise.resolve(undefined);
    }

    private async readFontName(fontPath: string): Promise<string> {
        try {
            const font = await openFont(fontPath);
            return font.fullName;
        } catch (ex) {
            logger.warn(ex);
            return null;
        }
    }
}