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
import { TaskQueue } from './TaskQueue';
import { query } from 'express';

test('should exclude duplicate elements', (t) => {
    const list = ['a', 'b', 'c', 'd', 'a', 'd', 'e'];
    const expect = ['a', 'b', 'c', 'd', 'e'];
    const queue = new TaskQueue<string>();
    for (const el of list) {
        queue.add(el);
    }

    for (const ex of expect) {
        t.true(ex === queue.poll().value);
    }
});

test('peek should return head but not remove any element', (t) => {
    const list = ['a', 'b', 'c', 'd'];
    const queue = new TaskQueue<string>();
    list.forEach(e => queue.add(e));
    const head = queue.head.value;
    t.true(queue.peek().value === 'a' && head === 'a', 'should peek the head element "a"');
    t.true(queue.head.value === 'a', 'list should change after peek');
})

test('poll should remove head element', (t) => {
    const list = ['a', 'b', 'c', 'd'];
    const queue = new TaskQueue<string>();
    list.forEach(e => queue.add(e));
    const head = queue.head.value;
    t.true(queue.poll().value === 'a' && head === 'a', 'poll should be "a"');
    t.true(queue.head.value === 'b');
});

test('poll on empty queue returns null and remove/clear maintain tail correctly', (t) => {
    const queue = new TaskQueue<string>();
    t.is(queue.poll(), null);

    ['a', 'b', 'c', 'd'].forEach(e => queue.add(e));

    t.true(queue.remove('b'));
    t.is(queue.head.value, 'a');
    t.is(queue.head.next.value, 'c');

    t.true(queue.remove('d'));
    t.is(queue.tail.value, 'c');

    t.true(queue.remove('a'));
    t.is(queue.head.value, 'c');
    t.is(queue.tail.value, 'c');

    queue.add('e');
    t.is(queue.head.value, 'c');
    t.is(queue.tail.value, 'e');

    queue.clear();
    t.is(queue.peek(), null);
    t.is(queue.tail, null);
});