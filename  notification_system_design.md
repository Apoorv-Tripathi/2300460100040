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
