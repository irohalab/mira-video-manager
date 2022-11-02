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

export interface Extractor {
    /**
     * generate a string being used as ffmpeg arguments.
     * this can return null, if there is no need to run ffmpeg, in such
     * case we just copy the file to outputPath
     */
    extractCMD(): Promise<string[]>;

    /**
     * the inputPath to process with
     */
    getInputPath(): string;
}