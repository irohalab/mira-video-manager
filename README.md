# Mira Video Manager
 
system dependencies: ffmpeg, mediainfo

## Start
- Start JobScheduler: `npm run start:jobscheduler`
- Start JobExecutor: `npm run start:jobexecutor`
- Start web api server: `npm run start:server:api`
- Start server for job executor: `npm run start:server:jobe*xecutor`*

Environment variables:

Required:
- `START_AS` define which mode should be used: 
  - For JobExecutor or JobScheduler, valid value `JOB_EXECUTOR` or `JOB_SCHEDULER`;
  - For web server, valid value `JOB_EXECUTOR` or `API_SERVER`;

Optional:
- ORMCONFIG: the ormconfig.json path, default is current project root
- APPCONFIG: the config.yml path, default is current project root
- AMQP_URL: if you provide this url, it will override the amqp config in the APPCONFIG file.

## Configuration file

