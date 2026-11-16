#!/bin/bash
# kill-port.sh <port>: stop whatever listens on that port
for pid in $(ss -ltnpH "sport = :$1" | grep -o "pid=[0-9]*" | cut -d= -f2 | sort -u); do kill $pid; done
