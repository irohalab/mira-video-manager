# Migrate from prev-1.0 version

From 1.0 version, we change the database and old data are no long usable. You may need to make sure all task are done, before start to upgrade.

A sync schema step is needed if you are currently using prev-1.0 version. this operation will drop job and video_process_rule tables and then recreate them with current new schema.

To do this, You need to go the deployment folder if you are using mira-docker to deploy your system,

update the `ormconfig.json` to the new format:

- change **type** value from `postgres` to `postgresql`
- **username** change to **user**
- **database** change to **dbName**
- remove **synchronize**, **logging**, **migrations**, **subscribers** and **cli**
- add `"node_modules/@irohalab/mira-shared/entity/**/*.js"` to **entites** array value.
- add an **entitiesTs** with a similar value format but point to src files

then run the following command:

```bash
docker run --rm --network $mira \
  --env ORMCONFIG=/etc/mira/ormconfig.json \
  --env APPCONFIG=/etc/mira/config.yml \
  -v $config_dir:/etc/mira/ \
 ghcr.io/irohalab/mira-video-manager:$version node dist/migrate.js --sync --silent
```

- `$mira` your network name that can postgresql container is also attached
- `$version` is the tag of the image, see the Github repo
- `$config_dir` is the directory for ormconfig.json and config.yml

You also need to update config.yml file by adding some new option entries:
```yaml
# base path for job log.
jobLogPath: '${project_root}/log/jobs'

# expire time for jobs, unit is days
jobExpireTime:
  Canceled: 1
  UnrecoverableError: 7
  Finished: 2
```
