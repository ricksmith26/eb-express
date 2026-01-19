#!/bin/bash
# Fetch application logs from Elastic Beanstalk via CloudWatch Logs
# Usage: ./scripts/get-app-logs.sh [minutes_ago]
#
# Examples:
#   ./scripts/get-app-logs.sh       # Last 5 minutes
#   ./scripts/get-app-logs.sh 30    # Last 30 minutes

MINUTES_AGO=${1:-5}
LOG_GROUP="/aws/elasticbeanstalk/brigid-api-prod/var/log/web.stdout.log"
REGION="eu-west-2"

# Calculate start time (milliseconds since epoch)
if [[ "$OSTYPE" == "darwin"* ]]; then
  START_TIME=$(($(date -v-${MINUTES_AGO}M +%s) * 1000))
else
  START_TIME=$(($(date -d "-${MINUTES_AGO} minutes" +%s) * 1000))
fi

echo "Fetching logs from last $MINUTES_AGO minutes..."
echo "Log group: $LOG_GROUP"
echo "================================================"

aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --start-time "$START_TIME" \
  --region "$REGION" \
  --query 'events[*].message' \
  --output text 2>&1
