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

/**
 * A FIFO queue that does not allow duplicate value.
 */
export class TaskQueue<T> {
    public head: TaskQueue<T>;
    public tail: TaskQueue<T>;
    public next: TaskQueue<T>;
    public value: T;

    /**
     * Add a new value to this queue. but if the value already exists then skip it.
     * @param v
     */
    public add(v: T): void {
        if (!this.head) {
            this.head = new TaskQueue<T>();
            this.head.value = v;
            this.tail = this.head;
            return;
        }
        let curr = this.head;
        if (curr.value === v) {
            return;
        }
        while(curr.next) {
            if (curr.next.value === v) {
                return;
            }
            curr = curr.next;
        }
        curr.next = new TaskQueue<T>();
        curr.next.value = v;
        this.tail = curr.next;
    }

    public peek(): TaskQueue<T> {
        return this.head;
    }

    public poll(): TaskQueue<T> {
        if (!this.head) {
            return null;
        }
        const oldHead = this.head;
        this.head = this.head.next;
        if (!this.head) {
            this.tail = null;
        }
        return oldHead;
    }

    public remove(v: T): boolean {
        if (!this.head) {
            return false;
        }
        if (this.head.value === v) {
            this.head = this.head.next;
            if (!this.head) {
                this.tail = null;
            }
            return true;
        }
        let prev = this.head;
        let curr = this.head.next;
        while (curr) {
            if (curr.value === v) {
                prev.next = curr.next;
                if (curr === this.tail) {
                    this.tail = prev;
                }
                return true;
            }
            prev = curr;
            curr = curr.next;
        }
        return false;
    }

    public clear(): void {
        this.head = null;
        this.tail = null;
    }
}