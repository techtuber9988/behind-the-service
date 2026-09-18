# CSV Import Service with Background Job Processing

A REST API that accepts CSV file uploads for import, processes them in the background, and returns results asynchronously.

## Overview

This service demonstrates the **background job pattern**: the request that triggers work returns immediately (HTTP 202), and the actual processing happens behind the scenes. A caller never waits for the slow part.

## Architecture

- **Express.js** REST API
- **SQLite** (via better-sqlite3) for persistence
- **JWT** authentication with bcrypt password hashing
- **In-process background worker** that polls for pending jobs every 2 seconds
- **Idempotent writes** via idempotency keys

## API Endpoints

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Create account (email + password) |
| POST | `/auth/login` | Get JWT token |

### Imports

| Method | Path | Description |
|--------|------|-------------|
| POST | `/imports` | Upload CSV, returns 202 immediately |
| GET | `/imports/:id` | Check job status |
| GET | `/imports/:id/results` | Get processed results (when completed) |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (no auth required) |

## Usage Example

```bash
# Register
curl -X POST https://your-service.railway.app/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Login
curl -X POST https://your-service.railway.app/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Upload CSV (returns 202 immediately)
curl -X POST https://your-service.railway.app/imports \
  -H "Authorization: Bearer <token>" \
  -F "file=@contacts.csv"

# Check status
curl https://your-service.railway.app/imports/<job_id> \
  -H "Authorization: Bearer <token>"

# Get results (when status is "completed")
curl https://your-service.railway.app/imports/<job_id>/results \
  -H "Authorization: Bearer <token>"
```

## Retry Safety

Include an `Idempotency-Key` header on POST `/imports` to make retries safe:

```
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

If the same key is used twice, the second request returns the existing job instead of creating a duplicate.

## What Happens When the Worker Dies Mid-Job

This is the critical question for background job systems.

### The Problem

If the worker process crashes or is killed while processing a job, the job could be left in an ambiguous state: marked as `processing` but never completed.

### How This Service Handles It

1. **Jobs are persisted in SQLite** before the worker starts. The job and all its rows exist in the database regardless of worker state.

2. **On restart, the worker only picks up `pending` jobs.** Jobs stuck in `processing` remain in that state if the worker died mid-job.

3. **The worker does NOT currently recover stuck jobs.** This is a known limitation for this implementation. In production, you would add:
   - A stale job detector that requeues `processing` jobs older than N minutes
   - A heartbeat from the worker to detect liveness
   - Transactional outbox pattern for more complex workflows

4. **The caller can always check status** via `GET /imports/:id`. If a job is stuck in `processing` indefinitely, the caller knows something went wrong.

5. **No data is lost.** The original CSV rows are stored in the database. Even if the worker dies, the raw data is preserved and could be reprocessed manually or by a recovery mechanism.

### Production Improvements

For a production system, you would add:

- **Stale job recovery**: A periodic task that finds jobs in `processing` state for longer than a threshold and resets them to `pending`
- **Worker heartbeat**: The worker writes a timestamp; a supervisor checks it and restarts if stale
- **Dead letter queue**: Failed jobs move to a separate queue for inspection
- **Observability**: Logging, metrics, and alerts on stuck/failed jobs

## Error Responses

All errors follow a consistent format:

```json
{
  "error": "error_code",
  "message": "Human-readable description"
}
```

| Status | Error Code | When |
|--------|------------|------|
| 400 | `missing_fields` | Required fields missing |
| 400 | `missing_file` | No CSV file in request |
| 401 | `missing_credentials` | No Authorization header |
| 401 | `invalid_token` | Token is invalid or user deleted |
| 401 | `token_expired` | Token has expired |
| 401 | `invalid_credentials` | Wrong email/password |
| 404 | `not_found` | Job or user not found |
| 409 | `email_taken` | Email already registered |
| 409 | `not_ready` | Results requested before job completed |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3000 | Server port |
| `JWT_SECRET` | Yes | - | Secret for signing JWT tokens |
| `DATABASE_PATH` | No | `./data/database.db` | SQLite database path |
| `UPLOAD_DIR` | No | `./uploads` | Temporary upload directory |

## Setup

```bash
npm install
cp .env.example .env
# Edit .env and set JWT_SECRET to a random string
npm start
```

## License

MIT
