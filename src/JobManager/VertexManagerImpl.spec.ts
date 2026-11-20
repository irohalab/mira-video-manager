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

import 'reflect-metadata';
import { Container } from 'inversify';
import test from 'ava';
import { ConfigManager } from '../utils/ConfigManager';
import { Sentry, TYPES } from '@irohalab/mira-shared';
import { FakeConfigManager } from '../test-helpers/FakeConfigManager';
import { DatabaseService } from '../services/DatabaseService';
import { FakeDatabaseService } from '../test-helpers/FakeDatabaseService';
import { join } from 'path';
import { createJob, projectRoot } from '../test-helpers/helpers';
import { VideoProcessor } from '../processors/VideoProcessor';
import { TYPES_VM } from '../TYPES';
import { ProcessorFactoryInitiator } from '../processors/ProcessorFactory';
import { FakeVideoProcessorFactory } from '../test-helpers/FakeVideoProcessorFactory';
import { FakeJobRepository } from '../test-helpers/FakeJobRepository';
import { FakeVertexRepository } from '../test-helpers/FakeVertexRepository';
import { EVENT_VERTEX_FAIL, TERMINAL_VERTEX_FINISHED, VertexManager } from './VertexManager';
import { VertexManagerImpl } from './VertexManagerImpl';
import { JobStatus } from '../domains/JobStatus';
import { FakeSentry } from '../test-helpers/FakeSentry';
import { Action } from '../domains/Action';
import { ActionType } from '../domains/ActionType';
import { VertexStatus } from '../domains/VertexStatus';
import { Vertex } from '../entity/Vertex';
import { JobMessage } from '../domains/JobMessage';

type Cxt = { container: Container };

test.beforeEach((t) => {
    const context = t.context as Cxt;
    const container = new Container({ autoBindInjectable: true });
    context.container = container;
    container.bind<ConfigManager>(TYPES.ConfigManager).to(FakeConfigManager).inSingletonScope();
    container.bind<DatabaseService>(TYPES.DatabaseService).to(FakeDatabaseService).inSingletonScope();
    container.bind<Sentry>(TYPES.Sentry).to(FakeSentry).inSingletonScope();
    container.bind<ProcessorFactoryInitiator>(TYPES_VM.ProcessorFactory).toFactory<VideoProcessor>(FakeVideoProcessorFactory);
    container.bind<VertexManager>(TYPES_VM.VertexManager).to(VertexManagerImpl);
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    (configManager as FakeConfigManager).profilePath = join(projectRoot, 'temp/vertex-manager');
});

test.afterEach((t) => {
    const context = t.context as Cxt;
    const container = context.container;
    const dbService = container.get<DatabaseService>(TYPES.DatabaseService);
    const jobRepo = dbService.getJobRepository() as FakeJobRepository;
    jobRepo.reset();
    const vxRepo = dbService.getVertexRepository() as FakeVertexRepository;
    vxRepo.reset();
});

test.serial('execute vertices by their order defined by a graph', async(t) => {
    const context = t.context as Cxt;
    const container = context.container;
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    const dbService = container.get<DatabaseService>(TYPES.DatabaseService);
    const vm = container.get<VertexManager>(TYPES_VM.VertexManager);
    const job = createJob(await configManager.jobExecutorId(), JobStatus.Running);
    await dbService.getJobRepository().save(job);
    const jobLogPath = join(configManager.jobLogPath(), job.id);

    // need to create vertices manually before start
    await vm.createAllVertices(job);

    await vm.start(job, jobLogPath);
    await new Promise((resolve, reject) => {
        vm.events.on(EVENT_VERTEX_FAIL, (error) => {
            reject(error);
        });
        vm.events.on(TERMINAL_VERTEX_FINISHED, () => {
            t.pass('should go here');
            console.log('vertex finished');
            resolve('');
        });
    });
    await vm.stop();
    // the order check is performed in FakeVideoProcess.prepare(), if no error is thrown then everything is fine.
    t.plan(1);
});

test.serial('asymmetric multi-step join graph does not deadlock on unready downstream vertex', async (t) => {
    const context = t.context as Cxt;
    const container = context.container;
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    const dbService = container.get<DatabaseService>(TYPES.DatabaseService);

    // V1 (instant) ----------------> C
    // S1 (40ms) ---> T2 (20ms) ----^
    const v1 = new Action();
    v1.type = ActionType.Extract;
    const s1 = new Action();
    s1.type = ActionType.Extract;
    const t2 = new Action();
    t2.type = ActionType.Extract;
    const c = new Action();
    c.type = ActionType.Convert;

    v1.downstreamIds = [c.id];
    s1.downstreamIds = [t2.id];
    t2.upstreamActionIds = [s1.id];
    t2.downstreamIds = [c.id];
    c.upstreamActionIds = [v1.id, t2.id];

    const executedOrder: string[] = [];
    container.rebind<ProcessorFactoryInitiator>(TYPES_VM.ProcessorFactory).toFactory<VideoProcessor>(() => {
        return () => ({
            prepare: async () => undefined,
            process: async (vertex: Vertex) => {
                if (vertex.action.id === s1.id) {
                    await new Promise(r => setTimeout(r, 40));
                } else if (vertex.action.id === t2.id) {
                    await new Promise(r => setTimeout(r, 20));
                }
                executedOrder.push(vertex.action.id);
                return vertex.id;
            },
            cancel: async () => undefined,
            dispose: async () => undefined,
            registerLogHandler: () => undefined
        });
    });

    const vm = container.get<VertexManager>(TYPES_VM.VertexManager);
    const job = createJob(await configManager.jobExecutorId(), JobStatus.Running);
    job.actionMap = { [v1.id]: v1, [s1.id]: s1, [t2.id]: t2, [c.id]: c };
    job.jobMessage.actions = job.actionMap;
    await dbService.getJobRepository().save(job);
    await vm.createAllVertices(job);

    await vm.start(job, join(configManager.jobLogPath(), job.id));
    await new Promise<void>((resolve, reject) => {
        vm.events.on(EVENT_VERTEX_FAIL, reject);
        vm.events.on(TERMINAL_VERTEX_FINISHED, () => resolve());
    });
    await vm.stop();

    t.is(executedOrder[executedOrder.length - 1], c.id);
    t.true(executedOrder.indexOf(s1.id) < executedOrder.indexOf(t2.id));
    t.true(executedOrder.indexOf(t2.id) < executedOrder.indexOf(c.id));
});

test.serial('disconnected graphs cap concurrent Convert vertices to 1 without blocking Extract graph', async (t) => {
    const context = t.context as Cxt;
    const container = context.container;
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    const dbService = container.get<DatabaseService>(TYPES.DatabaseService);

    const conv1 = new Action();
    conv1.type = ActionType.Convert;
    const conv2 = new Action();
    conv2.type = ActionType.Convert;
    const ext3 = new Action();
    ext3.type = ActionType.Extract;

    let runningConvert = 0;
    let maxRunningConvert = 0;
    let ext3FinishedWhileConv2Pending = false;
    const finishedActions: string[] = [];

    container.rebind<ProcessorFactoryInitiator>(TYPES_VM.ProcessorFactory).toFactory<VideoProcessor>(() => {
        return (actionType: ActionType) => ({
            prepare: async () => undefined,
            process: async (vertex: Vertex) => {
                if (actionType === ActionType.Convert) {
                    runningConvert++;
                    maxRunningConvert = Math.max(maxRunningConvert, runningConvert);
                    await new Promise(r => setTimeout(r, 60));
                    runningConvert--;
                } else {
                    await new Promise(r => setTimeout(r, 15));
                    if (!finishedActions.includes(conv2.id)) {
                        ext3FinishedWhileConv2Pending = true;
                    }
                }
                finishedActions.push(vertex.action.id);
                return vertex.id;
            },
            cancel: async () => undefined,
            dispose: async () => undefined,
            registerLogHandler: () => undefined
        });
    });

    const vm = container.get<VertexManager>(TYPES_VM.VertexManager);
    const job = createJob(await configManager.jobExecutorId(), JobStatus.Running);
    job.actionMap = { [conv1.id]: conv1, [conv2.id]: conv2, [ext3.id]: ext3 };
    job.jobMessage.actions = job.actionMap;
    await dbService.getJobRepository().save(job);
    await vm.createAllVertices(job);

    let terminalCount = 0;
    const allDone = new Promise<void>((resolve, reject) => {
        vm.events.on(EVENT_VERTEX_FAIL, reject);
        vm.events.on(TERMINAL_VERTEX_FINISHED, () => {
            terminalCount++;
            if (terminalCount === 3) {
                resolve();
            }
        });
    });

    await vm.start(job, join(configManager.jobLogPath(), job.id));
    await allDone;
    await vm.stop();

    t.is(maxRunningConvert, 1);
    t.true(ext3FinishedWhileConv2Pending, 'Non-CPU Extract graph should not be blocked behind queued Convert vertex');
    t.is(finishedActions.length, 3);
});

test.serial('failure in one subgraph immediately cancels running vertex in sibling subgraph', async (t) => {
    const context = t.context as Cxt;
    const container = context.container;
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    const dbService = container.get<DatabaseService>(TYPES.DatabaseService);

    const slowConvert = new Action();
    slowConvert.type = ActionType.Convert;
    const failingExtract = new Action();
    failingExtract.type = ActionType.Extract;

    let slowVertexCanceled = false;
    let terminalEmitted = false;

    container.rebind<ProcessorFactoryInitiator>(TYPES_VM.ProcessorFactory).toFactory<VideoProcessor>(() => {
        return (actionType: ActionType) => {
            let resolveCancel: () => void;
            return {
                prepare: async () => undefined,
                process: async () => {
                    if (actionType === ActionType.Extract) {
                        await new Promise(r => setTimeout(r, 20));
                        throw new Error('subtitle extraction failed');
                    }
                    await new Promise<void>((resolve) => {
                        resolveCancel = resolve;
                        setTimeout(resolve, 2000);
                    });
                    return 'out.mp4';
                },
                cancel: async () => {
                    slowVertexCanceled = true;
                    if (resolveCancel) {
                        resolveCancel();
                    }
                },
                dispose: async () => undefined,
                registerLogHandler: () => undefined
            };
        };
    });

    const vm = container.get<VertexManager>(TYPES_VM.VertexManager);
    const job = createJob(await configManager.jobExecutorId(), JobStatus.Running);
    job.actionMap = { [slowConvert.id]: slowConvert, [failingExtract.id]: failingExtract };
    job.jobMessage.actions = job.actionMap;
    await dbService.getJobRepository().save(job);
    await vm.createAllVertices(job);

    const failPromise = new Promise<void>((resolve) => {
        vm.events.on(TERMINAL_VERTEX_FINISHED, () => {
            terminalEmitted = true;
        });
        vm.events.on(EVENT_VERTEX_FAIL, async () => {
            await vm.stop(job.id);
            resolve();
        });
    });

    await vm.start(job, join(configManager.jobLogPath(), job.id));
    await failPromise;

    const vertexMap = await dbService.getVertexRepository().getVertexMap(job.id);
    const vertices = Object.values(vertexMap);
    const convertVx = vertices.find(v => v.action.id === slowConvert.id);
    const extractVx = vertices.find(v => v.action.id === failingExtract.id);

    t.true(slowVertexCanceled);
    t.is(convertVx.status, VertexStatus.Canceled);
    t.is(extractVx.status, VertexStatus.Error);
    t.false(terminalEmitted);
});

test.serial('resume skips already-finished subgraph and runs only pending downstream vertex', async (t) => {
    const context = t.context as Cxt;
    const container = context.container;
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    const dbService = container.get<DatabaseService>(TYPES.DatabaseService);

    // Graph 1: v1 (Finished) -> v2 (Canceled -> recreated Pending)
    // Graph 2: s1 (Finished) -> s2 (Finished)
    const v1 = new Action();
    v1.type = ActionType.Extract;
    const v2 = new Action();
    v2.type = ActionType.Convert;
    v1.downstreamIds = [v2.id];
    v2.upstreamActionIds = [v1.id];

    const s1 = new Action();
    s1.type = ActionType.Extract;
    const s2 = new Action();
    s2.type = ActionType.Extract;
    s1.downstreamIds = [s2.id];
    s2.upstreamActionIds = [s1.id];

    const executedActionIds: string[] = [];
    container.rebind<ProcessorFactoryInitiator>(TYPES_VM.ProcessorFactory).toFactory<VideoProcessor>(() => {
        return () => ({
            prepare: async (_jm: JobMessage, vertex: Vertex) => {
                executedActionIds.push(vertex.action.id);
            },
            process: async (vertex: Vertex) => vertex.id,
            cancel: async () => undefined,
            dispose: async () => undefined,
            registerLogHandler: () => undefined
        });
    });

    const vm = container.get<VertexManager>(TYPES_VM.VertexManager);
    const job = createJob(await configManager.jobExecutorId(), JobStatus.Running);
    job.actionMap = { [v1.id]: v1, [v2.id]: v2, [s1.id]: s1, [s2.id]: s2 };
    job.jobMessage.actions = job.actionMap;
    await dbService.getJobRepository().save(job);
    await vm.createAllVertices(job);

    const vxRepo = dbService.getVertexRepository() as FakeVertexRepository;
    vxRepo.removeAndFlush = async () => undefined;
    const initialMap = await vxRepo.getVertexMap(job.id);
    const originalFinishedTime = new Date('2026-01-01T00:00:00.000Z');
    for (const vx of Object.values(initialMap)) {
        if (vx.action.id === v2.id) {
            vx.status = VertexStatus.Canceled;
        } else {
            vx.status = VertexStatus.Finished;
            vx.finishedTime = originalFinishedTime;
        }
        await vxRepo.save(vx);
    }

    await vm.recreateCanceledVertices(job);
    let terminalEmittedCount = 0;
    const donePromise = new Promise<void>((resolve, reject) => {
        vm.events.on(EVENT_VERTEX_FAIL, reject);
        vm.events.on(TERMINAL_VERTEX_FINISHED, () => {
            terminalEmittedCount++;
            resolve();
        });
    });

    await vm.start(job, join(configManager.jobLogPath(), job.id));
    await donePromise;
    await vm.stop();

    const finalMap = await vxRepo.getVertexMap(job.id);
    const s2Vertex = Object.values(finalMap).find(v => v.action.id === s2.id);
    t.deepEqual(executedActionIds, [v2.id]);
    t.is(terminalEmittedCount, 1);
    t.is(s2Vertex.finishedTime.getTime(), originalFinishedTime.getTime());
});

test.serial('delayed parent callback on join vertex does not dispatch child twice', async (t) => {
    const context = t.context as Cxt;
    const container = context.container;
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    const dbService = container.get<DatabaseService>(TYPES.DatabaseService);

    const p1 = new Action();
    p1.type = ActionType.Extract;
    const p2 = new Action();
    p2.type = ActionType.Extract;
    const child = new Action();
    child.type = ActionType.Extract;
    p1.downstreamIds = [child.id];
    p2.downstreamIds = [child.id];
    child.upstreamActionIds = [p1.id, p2.id];

    let childExecCount = 0;
    let releaseDelayedSnapshot: () => void;
    const childStarted = new Promise<void>((resolve) => {
        releaseDelayedSnapshot = resolve;
    });

    container.rebind<ProcessorFactoryInitiator>(TYPES_VM.ProcessorFactory).toFactory<VideoProcessor>(() => {
        return () => ({
            prepare: async () => undefined,
            process: async (vertex: Vertex) => {
                if (vertex.action.id === child.id) {
                    childExecCount++;
                    releaseDelayedSnapshot();
                    // Stay running across at least one 500ms queue check tick
                    await new Promise(r => setTimeout(r, 650));
                }
                return vertex.id;
            },
            cancel: async () => undefined,
            dispose: async () => undefined,
            registerLogHandler: () => undefined
        });
    });

    const vm = container.get<VertexManager>(TYPES_VM.VertexManager);
    const job = createJob(await configManager.jobExecutorId(), JobStatus.Running);
    job.actionMap = { [p1.id]: p1, [p2.id]: p2, [child.id]: child };
    job.jobMessage.actions = job.actionMap;
    await dbService.getJobRepository().save(job);
    await vm.createAllVertices(job);

    const vxRepo = dbService.getVertexRepository() as FakeVertexRepository;
    const origGetVertexMap = vxRepo.getVertexMap.bind(vxRepo);
    let bothParentsFinishedReads = 0;
    vxRepo.getVertexMap = async (jobId: string) => {
        const rawMap = await origGetVertexMap(jobId);
        const snapshot: {[id: string]: Vertex} = {};
        for (const id of Object.keys(rawMap)) {
            snapshot[id] = Object.assign(new Vertex(), rawMap[id]);
        }
        const vals = Object.values(snapshot);
        const p1Vx = vals.find(v => v.action.id === p1.id);
        const p2Vx = vals.find(v => v.action.id === p2.id);
        const childVx = vals.find(v => v.action.id === child.id);
        if (p1Vx?.status === VertexStatus.Finished &&
            p2Vx?.status === VertexStatus.Finished &&
            childVx?.status === VertexStatus.Pending) {
            bothParentsFinishedReads++;
            if (bothParentsFinishedReads === 2) {
                // Simulate second parent's read resolving after child has already been dequeued and started
                await childStarted;
            }
        }
        return snapshot;
    };

    const donePromise = new Promise<void>((resolve, reject) => {
        vm.events.on(EVENT_VERTEX_FAIL, reject);
        vm.events.on(TERMINAL_VERTEX_FINISHED, () => resolve());
    });

    await vm.start(job, join(configManager.jobLogPath(), job.id));
    await donePromise;
    await vm.stop();

    t.is(childExecCount, 1);
});