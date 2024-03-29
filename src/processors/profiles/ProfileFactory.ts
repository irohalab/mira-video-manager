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

import { SoundOnlyProfile } from "./SoundOnlyProfile";
import { VideoOnlyProfile } from "./VideoOnlyProfile";
import { DefaultProfile } from "./DefaultProfile";
import { interfaces } from "inversify";
import { BaseProfile } from "./BaseProfile";
import { ContainerOnlyProfile } from './ContainerOnlyProfile';
import { ConvertAction } from '../../domains/ConvertAction';
import { ConfigManager } from '../../utils/ConfigManager';
import { TYPES } from '@irohalab/mira-shared';

export function ProfileFactory(context: interfaces.Context): ProfileFactoryInitiator {
    const configManager = context.container.get<ConfigManager>(TYPES.ConfigManager);
    const fontsDir = configManager.fontsDir();
    return (profileName: string, action: ConvertAction, profileExtraData?: any) => {
        switch (profileName) {
            case SoundOnlyProfile.profileName:
                return new SoundOnlyProfile(action, profileExtraData.data, fontsDir);
            case VideoOnlyProfile.profileName:
                return new VideoOnlyProfile(action, fontsDir);
            case ContainerOnlyProfile.profileName:
                return new ContainerOnlyProfile(action, fontsDir);
            case DefaultProfile.profileName:
            default:
                return new DefaultProfile(action, fontsDir);
        }
    };
}

export type ProfileFactoryInitiator = (profileName: string, action: ConvertAction, profileExtraData?: any) => BaseProfile;