# Video Process Rule

A rule is defined with Bangumi or VideoFile for video manager to know how to process a video. 

A bangumi can have multiple rules, but a video file can only have one rule. If a rule is applied directly to a video file,
all rules of bangumi is ignored.

Rules are matched by condition, all rules will be matched with priority, once a higher priority rule is matched, it will be 
selected and stop processing other rule matching.

Rule is consisted with actions which is what Video Manager will do to a download task.

## Condition

A condition is a javascript expression that return boolean value and has limited language features enabled with some 
additional instance to use.

1. A condition must be a single expression, multiple statements are not allowed.
2. Any keyword of javascript is not allowed.
3. There are some built-in javascript method and class can be used:
   1. `Math`, `String`, `RegExp`, `Array`
   2. NodeJS API `extname`, `basename` can also be used, use these two method without referencing `path`
4. There are some instance that passed to expression can be used:
   1. `video_filename` is a string that represents the video file relative path in the torrent.
   2. `other_filenames` is a string arry that represents all other files relative path in the torrent.
   3. `video_container` is an instance of MediaContainer class which contains the information of the video file. 
read [the code](src/utils/Runtime/MediaContainer.ts) to see all methods.
   4. `video_stream` is an instance of VideoStream class which contains the information of the default video stream of 
the video file. read [the code](src/utils/Runtime/VideoStream.ts) to see all methods.
   5. `audio_stream` is an instance of AudioStream class which contains the information of the default audio stream of
the audio file. read [the code](src/utils/Runtime/AudioStream.ts) to see all methods.
5. You can use `video_container.getContainerInfo()`, `video_container.getDefaultVideoStreamInfo()`, `video_container.getDefaultAudioStreamInfo` to
get information about container, video stream and audio stream, but instead of using dot operator, you have to use index operator
with property name to get the properties of these info. like `video_container.getContainerInfo()['Duration']`
   
## Actions

Actions define a pipeline operation that will apply to the video file. Actions will be executed by the defined order.
Currently, there 2 types of actions.
1. Convert Action: Convert video file format, a convert action need to specify a profile, there are 4 types of profile:
   1. Default: take one video file (the default video file or the last output video file) and convert with default configuration
this will process both video and audio stream by taking default video and audio stream and output a h264 video with aac audio in a
mp4 container.
   2. Sound Only: copy video stream and only process audio stream to aac format. will convert container if it's not mp4. Support preferred track with the following format:
      2. _preferredTrack is empty: use default audio track.
      3. _preferredTrack is a number: use 0-based index of audio (exclude other type of tracks).
      4. _preferredTrack is a format field:value, field is the name of property of audio stream when running ffprobe -v error -print_format json -show_format -show_streams
value is the property value, if the property is a sub property, a dot is needed. only one level sub property is supported.
If there is only one audio stream the _preferredTrack is ignored
   3. Video Only: copy audio stream and only process audio stream to h264 YUV420 8bit, will convert container if it's not mp4.
   4. Custom: accept user defined **ffmpeg** command line arguments
2. Merge Action: Can merge last output or video file with any other file (usually subtitle file) in the otherFiles of the torrent.
**WIP**

