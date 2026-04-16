#!/bin/bash

# D&D Tools - Run Script

set -euo pipefail

echo "========================================="
echo "Starting D&D Tools Application"
echo "========================================="
echo ""

# Check if we're in the right directory
if [ ! -d "public" ] || [ ! -d "docs" ]; then
    echo "❌ Error: Please run this script from the dnd-tools root directory"
    exit 1
fi

# Check if database is running
if command -v podman >/dev/null 2>&1; then
    CONTAINER_CMD="podman"
elif command -v docker >/dev/null 2>&1; then
    CONTAINER_CMD="docker"
else
    echo "❌ Neither Podman nor Docker found"
    exit 1
fi

if ! $CONTAINER_CMD ps | grep -q dnd-tools; then
    echo "⚠️  D&D Tools are not running. Starting them now..."
    if command -v podman compose >/dev/null 2>&1; then
        $CONTAINER_CMD compose up -d
    else
        $CONTAINER_CMD compose up -d
    fi
    echo "Waiting for D&D Tools to be ready..."
    sleep 2
fi

echo "✓ D&D Tools are running"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down servers..."
    # bring down compose services (no -d)
    if command -v $CONTAINER_CMD >/dev/null 2>&1; then
        $CONTAINER_CMD compose down || true
    else
        echo "No container runtime available to stop services"
    fi
    exit
}

trap cleanup SIGINT SIGTERM

echo ""
echo "========================================="
echo "✅ Application Started!"
echo "========================================="
echo ""
echo "Backend:  http://localhost:3080/"
echo ""

# Health check helpers
wait_for_backend() {
    local max_retries=30
    local i=0
    echo "Checking backend health on http://localhost:3080/ ..."
    while [ $i -lt $max_retries ]; do
        # try to get HTTP status code
        status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:3080/ || true)
        if [ "$status" = "200" ]; then
            echo "✓ Backend returned HTTP 200"
            return 0
        fi
        i=$((i+1))
        sleep 1
    done
    echo "❌ Backend did not return HTTP 200 after ${max_retries} attempts"
    return 1
}

wait_for_db() {
    local max_retries=20
    local i=0
    local ports=(15432 3306 27017 6379)

    echo "Checking for a database (common ports + container names)..."

    # quick container name check
    if $CONTAINER_CMD ps | grep -E "postgres|mysql|mongo|redis|db" -qi >/dev/null 2>&1; then
        echo "✓ Found a DB container running"
        return 0
    fi

    # fallback: check if any common DB port is open on localhost
    while [ $i -lt $max_retries ]; do
        for p in "${ports[@]}"; do
            if nc -z localhost "$p" >/dev/null 2>&1; then
                echo "✓ Found service listening on port $p"
                return 0
            fi
        done
        i=$((i+1))
        sleep 1
    done

    echo "⚠️  No DB detected on common ports or in containers"
    return 1
}

echo "Press Ctrl+C to stop servers"
echo "========================================="
echo ""

# Run health checks; if any fail, shut down and exit non-zero
if ! wait_for_db; then
    echo "Database check failed"
    cleanup
fi

if ! wait_for_backend; then
    echo "Backend health check failed"
    cleanup
fi

# Keep the script running so trap can catch Ctrl+C and run cleanup
while true; do
    sleep 1
done
