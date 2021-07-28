# Mira Video Manager

system dependencies: ffmpeg, mediainfo

## Start
`npm start`

Environment variables:

Required:
- `START_AS` define which mode should be used: valid value `JOB_EXECUTOR` or `JOB_SCHEDULER`;

Optional:
- `AMQP_HOST` the amqp sever host, default is `localhost`.
- `AMQP_PORT` the amqp server port, default is `5672`.
- `AMQP_USER` the amqp server user, default is `guest`.
- `PASSWORD` the amqp server user's password, default is `guest`.
- `APPID_HOST_MAP` format is `<AppId1>=<hostBaseURL1>;<AppId2>=<hostBaseURL2>;...` the remote url will be replaced with 
  host defined in the mapping. there is no default value, if appid is not found, no replacement will occur.
  
JobExecutor specific environment variable
- `JOBEXEC_PROFILE_DIR` the job executor profile path, default is `~/.mira/video-manager`
- `VIDEO_TEMP_DIR` the job executor's temp directory for copied/downloaded video files, default is `$(JOBEXEC_PROFILE_DIR)/temp`
- `SERVER_BASE_URL` used for composing the url for downloading output file from job executor, default is `http://localhost:8000/output/`.