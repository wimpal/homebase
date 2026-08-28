#!/bin/sh
# Cron wrapper for backup-nas.sh — sets PATH so docker is found in minimal cron env.
#
# Schedule (on NAS, as root — see docs/backup-restore.md):
#   0 3 * * * wim /volume1/docker/homebase/scripts/backup-nas-cron.sh

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
cd /volume1/docker/homebase
./scripts/backup-nas.sh >> /volume1/Docker-backups/homebase/backup.log 2>&1
