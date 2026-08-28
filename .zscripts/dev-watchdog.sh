#!/bin/bash
# Keep-alive watchdog for the Next.js dev server (verification session).
cd /home/z/my-project
while true; do
  if ! curl -s --connect-timeout 2 --max-time 5 -o /dev/null http://127.0.0.1:3000/; then
    echo "[$(date '+%H:%M:%S')] server down -> (re)starting" >> /home/z/my-project/dev-watchdog.log
    pkill -f "next dev" 2>/dev/null
    pkill -f "next-server" 2>/dev/null
    sleep 1
    nohup bun run dev > /home/z/my-project/dev.log 2>&1 &
  fi
  sleep 5
done
