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

import { TrackInfo } from './TrackInfo';

export interface VideoInfo extends TrackInfo {
    Format_Level: string;
    Format_Tier: string;
    CodecId: string;
    Duration: string;
    BitRate: string;
    Width: string;
    Height: string;
    Sampled_Width: string;
    Sampled_height: string;
    PixelAspectRatio: string;
    DisplayAspectRatio: string;
    Delay: string;
    FrameRate_Mode: string;
    ColorSpace: string;
    ChromaSubsampling: string;
    BitDepth: string;
    StreamSize: string;
    Encoded_Library: string;
    Encoded_Library_Name: string;
    Encoded_Library_Version: string;
    Encoded_Library_Settings: string;
    Language: string;
    Default: boolean;
    Forced: boolean;
    colour_description_present: boolean;
    colour_description_present_Source: string;
    colour_range: string;
    colour_range_Source: string;
    colour_primaries: string;
    colour_primaries_Source: string;
    transfer_characteristics: string;
    transfer_characteristics_Source: string;
    matrix_coefficients: string;
    matrix_coefficients_Source: string;
}