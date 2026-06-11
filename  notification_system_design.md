# Stage 1

A campus notification platform needs to support these core actions:

- Fetch all notifications for a student
- Fetch a single notification
- Mark one notification as read
- Mark all as read
- Get unread count
- Real-time delivery of new notifications

---

## REST API Design

### GET /api/v1/notifications

Fetch paginated notifications for the logged-in student.

**Headers**

```
Authorization: Bearer <token>
Content-Type: application/json
```

**Query params:** `page`, `limit`, `notification_type` (Event | Result | Placement), `is_read`

**Response 200**

```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "b283218f-ea5a-4b7c-93a9-1f2f240d64b0",
        "type": "Placement",
        "message": "CSX Corporation hiring",
        "isRead": false,
        "createdAt": "2026-04-22T17:51:18Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

---

### GET /api/v1/notifications/:id

Get a single notification by ID.

**Response 200**

```json
{
  "success": true,
  "data": {
    "id": "81589ada-0ad3-4f77-9554-f52fb558e09d",
    "type": "Event",
    "message": "farewell",
    "isRead": false,
    "createdAt": "2026-04-22T17:51:06Z"
  }
}
```

**Response 404**

```json
{ "success": false, "error": "Notification not found" }
```

---

### PATCH /api/v1/notifications/:id/read

Mark a specific notification as read.

**Response 200**

```json
{
  "success": true,
  "data": { "id": "...", "isRead": true, "updatedAt": "2026-06-11T10:00:00Z" }
}
```

---

### PATCH /api/v1/notifications/read-all

Mark all notifications as read for the student.

**Response 200**

```json
{
  "success": true,
  "message": "All notifications marked as read",
  "updatedCount": 45
}
```

---

### GET /api/v1/notifications/unread-count

**Response 200**

```json
{ "success": true, "data": { "unreadCount": 12 } }
```

---

## Real-time Notifications — WebSockets (Socket.IO)

Went with WebSockets over polling or SSE because the connection is persistent and bi-directional. Polling hammers the DB every few seconds which doesn't scale. SSE is one-way only. WebSockets let the server push instantly when a notification is created.

**Flow:**

1. Client connects to `ws://localhost:4000` with JWT in the handshake
2. Server verifies token, joins student to their room: `student:<studentId>`
3. When a new notification is created, server emits to that room:

```json
{
  "event": "new_notification",
  "data": {
    "id": "uuid",
    "type": "Placement",
    "message": "Company XYZ hiring",
    "createdAt": "2026-06-11T10:00:00Z"
  }
}
```

4. Client receives it and updates the UI without any page reload.

---

# Stage 2

## DB Choice — PostgreSQL

Going with PostgreSQL. The data here is clearly relational — students have notifications, notifications have types, reads are tracked per student. PostgreSQL handles this well and gives us proper ENUM support for notification types, partial indexes (useful for unread-only queries), and it's battle-tested for this kind of workload.

MongoDB would add complexity without any real benefit here — the schema is fixed and we're not storing arbitrary nested documents.

---

## Schema

```sql
CREATE TYPE notification_type AS ENUM ('Event', 'Result', 'Placement');

CREATE TABLE students (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  email      VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  notification_type notification_type NOT NULL,
  message           TEXT NOT NULL,
  is_read           BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notif_student ON notifications(student_id);
CREATE INDEX idx_notif_created ON notifications(created_at DESC);
CREATE INDEX idx_notif_student_unread ON notifications(student_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notif_type_created ON notifications(notification_type, created_at DESC);
```

---

## Problems at scale and how to fix them

**50K students, 5M notifications — what breaks:**

- Full table scans on unindexed columns will make every query slow. Fix: composite indexes on `(student_id, is_read, created_at)`.
- `SELECT *` pulls every column on every query. Fix: only select what the frontend actually needs.
- Table keeps growing forever. Fix: partition by `created_at` monthly so old data doesn't slow down current queries.
- Every page load hits the DB. Fix: Redis cache per student with 60s TTL. Invalidate on new notification or mark-read.
- Single DB handles all reads and writes. Fix: read replicas for all GET endpoints, primary only for writes.
- Unread count re-queried constantly. Fix: store it in Redis, decrement/increment on read events.

---

## Queries

**All notifications for a student (paginated)**

```sql
SELECT id, notification_type, message, is_read, created_at
FROM notifications
WHERE student_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;
```

**Unread notifications for a student**

```sql
SELECT id, notification_type, message, created_at
FROM notifications
WHERE student_id = $1 AND is_read = FALSE
ORDER BY created_at DESC;
```

**Mark one as read**

```sql
UPDATE notifications
SET is_read = TRUE, updated_at = NOW()
WHERE id = $1 AND student_id = $2;
```

**Unread count**

```sql
SELECT COUNT(*) FROM notifications
WHERE student_id = $1 AND is_read = FALSE;
```

**Mark all as read**

```sql
UPDATE notifications
SET is_read = TRUE, updated_at = NOW()
WHERE student_id = $1 AND is_read = FALSE;
```

---

# Stage 3

## Is the query accurate?

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt ASC;
```

Functionally it returns the right rows but there are issues:

- `SELECT *` fetches every column including ones the frontend never uses
- `ORDER BY createdAt ASC` shows oldest first — most UIs want newest first
- No LIMIT, so if student 1042 has 10,000 unread notifications, all of them get returned at once

---

## Why is it slow?

No index on `studentID` or `isRead` means Postgres does a full sequential scan through all 5 million rows just to find notifications for one student. At that scale it's scanning gigabytes of data for every single request.

---

## Fixed query

```sql
SELECT id, notification_type, message, is_read, created_at
FROM notifications
WHERE student_id = 1042 AND is_read = FALSE
ORDER BY created_at DESC
LIMIT 20;
```

**Index to add:**

```sql
CREATE INDEX idx_notif_student_unread_created
  ON notifications(student_id, is_read, created_at DESC)
  WHERE is_read = FALSE;
```

With this index, Postgres jumps straight to student 1042's unread rows — no full scan. Query goes from seconds to milliseconds.

---

## Should we index every column?

No, that's actually harmful. Every index has to be updated on every INSERT and UPDATE. With 5M rows and frequent writes (new notifications, mark-reads), indexing every column will slow down writes significantly and waste disk space. The query planner can also get confused and pick wrong indexes.

Only index columns that appear in WHERE, ORDER BY, or JOIN conditions. Here that's `student_id`, `is_read`, `created_at`, and `notification_type`.

---

## Students who got a Placement notification in the last 7 days

```sql
SELECT DISTINCT s.id, s.name, s.email
FROM students s
JOIN notifications n ON n.student_id = s.id
WHERE n.notification_type = 'Placement'
  AND n.created_at >= NOW() - INTERVAL '7 days';
```

The index on `(notification_type, created_at DESC)` makes this efficient.

---

# Stage 4

## Problem

Fetching notifications fresh from the DB on every single page load. With 50K students, even if only 10% are active at once, that's 5,000 DB queries hitting at the same time. The DB can't handle that.

---

## Solutions

### 1. Redis Cache (main fix)

Cache each student's notification list in Redis.

```
Key:   notifications:student:<studentId>
Value: JSON array
TTL:   60 seconds
```

On page load, check Redis first. Only go to DB on a cache miss, then populate Redis. On new notification or mark-read, delete that student's cache key.

Tradeoffs: Reduces DB load by 80-90%. Sub-millisecond reads. The downside is stale data — a new notification might take up to 60s to show if the cache isn't invalidated properly. Also need to manage memory if the student base grows further.

---

### 2. Pagination

Never load all notifications at once. Always use LIMIT/OFFSET or cursor-based pagination.

Tradeoffs: Simple to implement, no extra infrastructure. Doesn't fully solve the problem if thousands of students hit page 1 simultaneously — still 1000 DB queries. Combine with caching.

---

### 3. Read Replicas

All GET requests go to a read replica. Writes go to primary only.

Tradeoffs: Offloads the primary DB completely for reads. Can add more replicas as traffic grows. Downside is replication lag (100-500ms) so a student might not see their notification immediately after it's created.

---

### 4. WebSocket push instead of fetch-on-load

After the initial load, don't poll. Keep the WebSocket connection open. New notifications get pushed to the client directly and added to the local state.

Tradeoffs: Zero extra DB queries for new notifications after initial load. Best UX. But the initial load still hits the DB, and managing 50K concurrent WebSocket connections needs a Redis pub/sub adapter (like Socket.IO with Redis adapter) plus proper load balancing.

**Recommended approach:** Redis cache + pagination + WebSocket push. Read replicas when the traffic justifies the infrastructure cost.

---

# Stage 5

## Problems with the current implementation

```
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        send_email(student_id, message)
        save_to_db(student_id, message)
        push_to_app(student_id, message)
```

- It's sequential. 50K students, 100ms per student = 83 minutes. The HR is still waiting next morning.
- No error handling. Email fails for student 200, loop crashes, students 201-50000 get nothing.
- Email, DB, and push are tightly coupled. If the email API is down, DB inserts stop too.
- No retries. Failed sends are gone forever.
- 50K individual DB inserts instead of one bulk insert.

---

## What about DB save and email — should they happen together?

No. The DB insert is the source of truth and should always succeed regardless of what happens with email. Email is just a delivery channel. If email fails we can retry it, but we can always look up the DB record to know the notification was created. Coupling them means an email provider outage corrupts our data integrity.

---

## Redesigned solution — message queue

Producer enqueues jobs instantly (non-blocking). Worker pool processes them concurrently. DB insert is bulk upfront. Email/push are separate retryable jobs.

```typescript
async function notify_all(
  student_ids: string[],
  message: string,
): Promise<void> {
  // Bulk insert to DB first — one query, not 50K
  await db.notifications.bulkCreate(
    student_ids.map((id) => ({
      student_id: id,
      message,
      notification_type: "Placement",
    })),
  );
  logger.info(`Bulk inserted ${student_ids.length} notifications`);

  // Enqueue email + push jobs
  const jobs = student_ids.map((student_id) => ({
    name: "send-notification",
    data: { student_id, message },
    opts: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
  }));

  await notificationQueue.addBulk(jobs);
  logger.info(`Enqueued ${student_ids.length} jobs`);
}

// Worker runs with concurrency 50 — 50 students processed in parallel
notificationQueue.process("send-notification", 50, async (job) => {
  const { student_id, message } = job.data;

  try {
    await send_email(student_id, message);
    logger.info(`Email sent`, { student_id });
  } catch (err) {
    logger.error(`Email failed`, { student_id, error: err.message });
    throw err; // triggers retry with backoff
  }

  try {
    await push_to_app(student_id, message);
  } catch (err) {
    logger.warn(`Push failed`, { student_id, error: err.message });
    // push failure is non-critical, don't retry
  }
});
```

Now the 200 failed emails are tracked in the queue, can be inspected and retried. The other 49,800 are unaffected. The whole thing finishes in minutes instead of hours.

---
