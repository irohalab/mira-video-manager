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

import test from 'ava';
import 'reflect-metadata';
import { RemoteFile } from '@irohalab/mira-shared';
import { ConditionParser } from './ConditionParser';

test('detect invalid identifier, keyword and punctuator', t => {
    const conditionParser = new ConditionParser('bash ls', null, null);
    t.throws(conditionParser.tokenCheck);
});

test('identify conditions that require video info', t => {
    t.false(ConditionParser.requiresVideoInfo('video_filename.includes("[Nix-Raws]")'));
    t.false(ConditionParser.requiresVideoInfo('other_filenames.includes("subtitle.ass")'));
    t.true(ConditionParser.requiresVideoInfo('video_container.videoStreamCount() > 0'));
    t.true(ConditionParser.requiresVideoInfo('video_stream.getWidth() >= 1920'));
    t.true(ConditionParser.requiresVideoInfo('audio_stream.isPlayable()'));
});

test('evaluate filename-only conditions without probing the video', async t => {
    const videoFile = new RemoteFile();
    videoFile.filename = '[Nix-Raws] Tenkousaki no Seiso Karen na Bishoujo ga Mukashi Danshi to Omotte Issho ni Asonda Osananajimi datta Ken S01E05 [CR WEB-DL 1080p AVC AAC][SC_TC].mkv';
    videoFile.fileLocalPath = '/nonexistent/video.mkv';
    const conditions = [
        'video_filename.includes("[SubsPlease]")',
        'video_filename.includes("[Nix-Raws]")'
    ];
    const matches = [];

    for (const condition of conditions) {
        const conditionParser = new ConditionParser(condition, videoFile, []);
        conditionParser.tokenCheck();
        matches.push(await conditionParser.evaluate());
    }

    t.deepEqual(matches, [false, true]);
});