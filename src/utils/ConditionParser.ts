/*
 * Copyright 2021 IROHA LAB
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

import { RemoteFile } from '../domains/RemoteFile';
import * as jsep from 'jsep';
import {
    BinaryExpression,
    CallExpression,
    Expression,
    Identifier,
    Literal,
    MemberExpression,
    UnaryExpression
} from 'jsep';

const VAR_FILENAME = 'filename';
const VAR_EXTNAME = 'extname';
const VAR_CONTAINER = 'container';
const VAR_VIDEO_CODEC = 'video_codec';
const VAR_AUDIO_CODEC = 'audio_codec';

export class ConditionParser {
    private readonly _ast: Expression;
    private static funcMapping = {
        startsWith: String.prototype.startsWith,
        contains: String.prototype.includes,
        substring: String.prototype.substring
    };

    constructor(private _condition: string,
                private _files: RemoteFile[],
                private _downloadManagerId: string) {
        this._ast = jsep(this._condition);
    }

    public async evaluate(): Promise<boolean> {
        let result = false;
        try {
            result = await this.evaluateExpression(this._ast);
        } catch (ex) {
            console.error(ex);
        }
        return result;
    }

    private async evaluateExpression(exp: Expression): Promise<any> {
        switch (exp.type) {
            case 'CallExpression':
                const callExp = exp as CallExpression;
                const callee = callExp.callee;
                switch (callee.type) {
                    case 'MemberExpression':
                        return ConditionParser.callFunction(((callee as MemberExpression).property as Identifier).name, callExp.arguments, await this.evaluateExpression((callee as MemberExpression).object));
                    case 'Identifier':
                        return ConditionParser.callFunction((callee as Identifier).name, callExp.arguments, null);
                    default:
                        throw new Error('Unsupported Call expression type');
                }
            case 'UnaryExpression':
                const unaryExp = exp as UnaryExpression;
                switch (unaryExp.operator) {
                    case '!':
                        return !(await this.evaluateExpression(unaryExp.argument));
                    default:
                        throw new Error('Unsupported unary operator: ' + unaryExp.operator);
                }
            case 'BinaryExpression':
            case 'LogicalExpression':
                const binaryExp = exp as BinaryExpression;
                const leftExp = await this.evaluateExpression(binaryExp.left);
                const rightExp = await this.evaluateExpression(binaryExp.right);
                // note that type won't convert
                switch (binaryExp.operator) {
                    case '==':
                        return leftExp === rightExp;
                    case '!=':
                        return leftExp !== rightExp;
                    case '>':
                        return leftExp > rightExp;
                    case '<':
                        return leftExp > rightExp;
                    case '>=':
                        return leftExp >= rightExp;
                    case '<=':
                        return leftExp <= rightExp;
                    case '&&':
                        return leftExp && rightExp;
                    case '||':
                        return leftExp || rightExp;
                    default:
                        throw new Error('Unsupported operator: ' + binaryExp.operator);
                }
            case 'Identifier':
                return await this.handleIdentifier((exp as Identifier).name);
            case 'Literal':
                return (exp as Literal).value;
            default:
                throw new Error('Unsupported expression type: ' + exp.type);
        }
    }

    private static callFunction(funcName: string, args: any[], context: string): any {
        const func = ConditionParser.funcMapping[funcName];
        if (!func) {
            throw new Error(`No function name ${funcName} is defined`);
        }
        return func.apply(context, args);
    }

    private async handleIdentifier(identifier: string): Promise<any> {
        return null;
    }
}