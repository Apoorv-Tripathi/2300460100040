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
