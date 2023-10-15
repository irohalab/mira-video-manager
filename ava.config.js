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

const {familySync, GLIBC}  = require('detect-libc');

module.exports = {
    extensions: [
        "ts"
    ],
    files: [
        "src/utils/*.spec.ts",
        "src/services/*.spec.ts",
        "src/processors/*.spec.ts",
        "src/api-service/controller/*.spec.ts",
        "src/JobManager/*.spec.ts",
        "src/domains/*.spec.ts"
    ],
    require: [
        "ts-node/register"
    ],
    verbose: true,
    workerThreads: familySync() !== GLIBC
};