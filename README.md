# Mira Video Manager

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
  
JobExecutor specific environment variable
- `JOBEXEC_PROFILE_DIR` the job executor profile path, default is `~/.mira/video-manager`
- `VIDEO_TEMP_DIR` the job executor's temp directory for copied/downloaded video files, default is `$(JOBEXEC_PROFILE_DIR)/temp`