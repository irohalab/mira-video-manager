# Mira Video Manager

system dependencies: ffmpeg, mediainfo

## Migrate from 0.x to 1.0
If you are currently using prev-1.0 version. then you need to check the [migration document](blob/master/pre1migrate.md)

## Development

### Start
- Start JobScheduler: `npm run start:jobscheduler`
- Start JobExecutor: `npm run start:jobexecutor`
- Start Meta JobExecutor: `npm run start:jobexecutor:meta`
- Start web api server: `npm run start:server:api`
- Start server for job executor: `npm run start:server:jobe*xecutor`*

## Deployment

Environment variables:

Required:
- `START_AS` define which mode should be used: 
  - For JobExecutor or JobScheduler, valid value `JOB_EXECUTOR` or `JOB_SCHEDULER`;
  - For web server, valid value `JOB_EXECUTOR` or `API_SERVER`;
- `EXEC_MODE` define the executed mode for JobExecutor  

Optional:
- ORMCONFIG: the ormconfig.json path, default is current project root
- APPCONFIG: the config.yml path, default is current project root
- AMQP_URL: if you provide this url, it will override the amqp config in the APPCONFIG file.
- SERVER_BASE_URL: you may need to provide a server base url for the job executor server to allow other services download file from it. if it runs in localhost, then it can be ignored.
