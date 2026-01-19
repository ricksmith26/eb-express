# Device Connection Tracking

Track online/offline status for all device types with real-time updates and historical logging.

## Device Types

| Code | Description |
|------|-------------|
| `brigid-pi` | Raspberry Pi devices |
| `android` | Android mobile app |
| `ios` | iOS mobile app |
| `agent` | Browser-based call center agents |

---

## WebSocket Events

### Join Status Monitor Room

Subscribe to real-time device status changes.

```javascript
// Join the monitoring room
socket.emit('joinStatusMonitor');

// Receive initial list of online devices
socket.on('statusMonitorJoined', (data) => {
  console.log('Online devices:', data.devices);
});

// Receive real-time status updates
socket.on('device_status_change', (data) => {
  console.log('Status change:', data);
  // {
  //   connectionId: "uuid",
  //   email: "patient@example.com",      // for patients
  //   username: "agent@example.com",     // for agents
  //   deviceType: "android",
  //   deviceId: "ABC123",                // for Pi devices
  //   status: "online" | "offline",
  //   timestamp: "2026-01-19T15:30:00Z"
  // }
});
```

---

## REST API Endpoints

All endpoints require authentication via `Authorization: Bearer <token>` header.

### List All Connections

```
GET /device-connections
```

Query params:
- `status` - Filter by `online` or `offline`
- `deviceType` - Filter by device type
- `limit` - Max results (default: 50)
- `offset` - Pagination offset

Response:
```json
{
  "resourceType": "Bundle",
  "type": "searchset",
  "total": 45,
  "entry": [
    {
      "resource": {
        "id": "uuid",
        "status": "online",
        "deviceType": { "coding": [{ "code": "android" }] },
        "subject": {
          "reference": "Patient/abc123",
          "email": "patient@example.com"
        },
        "lastOnlineAt": "2026-01-19T15:00:00Z"
      }
    }
  ]
}
```

### List Online Devices

```
GET /device-connections/online
```

Query params:
- `deviceType` - Filter by device type
- `limit` - Max results (default: 100)

### Get Status Summary (Dashboard)

```
GET /device-connections/status
```

Response:
```json
{
  "resourceType": "Bundle",
  "summary": {
    "total": 45,
    "online": {
      "total": 12,
      "byType": {
        "brigid-pi": 5,
        "android": 4,
        "ios": 2,
        "agent": 1
      }
    },
    "offline": {
      "total": 33,
      "byType": { ... }
    }
  },
  "timestamp": "2026-01-19T15:30:00Z"
}
```

### Get User's Connections

```
GET /device-connections/user/:email
```

Returns all device connections for a specific patient.

### Get Agent's Connection

```
GET /device-connections/agent/:username
```

Returns connection status for a specific agent.

### Get Connection History

```
GET /device-connections/history
```

Query params:
- `eventType` - Filter by `connect` or `disconnect`
- `deviceType` - Filter by device type
- `email` - Filter by user email
- `limit` - Max results (default: 100)
- `offset` - Pagination offset

Response:
```json
{
  "resourceType": "Bundle",
  "type": "searchset",
  "total": 150,
  "entry": [
    {
      "resource": {
        "id": "uuid",
        "eventType": "connect",
        "timestamp": "2026-01-19T15:00:00Z",
        "deviceType": { "coding": [{ "code": "android" }] },
        "subject": {
          "reference": "Patient/abc123",
          "email": "patient@example.com"
        },
        "connection": {
          "socketId": "abc123",
          "ipAddress": "192.168.1.1"
        }
      }
    },
    {
      "resource": {
        "id": "uuid",
        "eventType": "disconnect",
        "timestamp": "2026-01-19T16:00:00Z",
        "sessionDuration": 3600000,
        "disconnectReason": "client_disconnect"
      }
    }
  ]
}
```

### Get User's Connection History

```
GET /device-connections/history/:email
```

Returns connection event history for a specific user.

---

## Data Models

### FhirDeviceConnection (Current Status)

```typescript
interface DeviceConnection {
  id: string;
  status: 'online' | 'offline';
  deviceType: {
    coding: [{ code: 'brigid-pi' | 'android' | 'ios' | 'agent' }]
  };
  subject: {
    reference: string;  // 'Patient/{id}' or 'Practitioner/{id}'
    type: 'Patient' | 'Practitioner';
    email?: string;
    username?: string;
  };
  device?: {
    reference: string;  // 'Device/{id}' for Pi devices
    deviceId: string;
  };
  currentConnection?: {
    socketId: string;
    connectedAt: Date;
    ipAddress: string;
  };
  lastOnlineAt: Date;
  lastOfflineAt: Date;
}
```

### FhirConnectionEvent (History)

```typescript
interface ConnectionEvent {
  id: string;
  eventType: 'connect' | 'disconnect';
  timestamp: Date;
  deviceType: { coding: [{ code: string }] };
  subject: {
    reference: string;
    email?: string;
    username?: string;
  };
  device?: {
    reference: string;
    deviceId: string;
  };
  connection: {
    socketId: string;
    ipAddress?: string;
  };
  sessionDuration?: number;  // milliseconds, on disconnect only
  disconnectReason?: string; // 'client_disconnect' | 'timeout' | 'replaced' | etc.
}
```

---

## Example: React Dashboard Component

```jsx
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

function DeviceStatusDashboard() {
  const [devices, setDevices] = useState([]);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    // Fetch initial summary
    fetch('/device-connections/status', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setSummary(data.summary));

    // Connect to WebSocket for real-time updates
    const socket = io();

    socket.emit('joinStatusMonitor');

    socket.on('statusMonitorJoined', (data) => {
      setDevices(data.devices);
    });

    socket.on('device_status_change', (event) => {
      setDevices(prev => {
        // Update device in list or add if new
        const idx = prev.findIndex(d =>
          d.subject?.email === event.email ||
          d.device?.deviceId === event.deviceId
        );

        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], status: event.status };
          return updated;
        }
        return prev;
      });

      // Refresh summary
      fetch('/device-connections/status', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => setSummary(data.summary));
    });

    return () => socket.disconnect();
  }, []);

  return (
    <div>
      <h2>Device Status</h2>
      {summary && (
        <div>
          <p>Online: {summary.online.total}</p>
          <p>Offline: {summary.offline.total}</p>
        </div>
      )}
      <ul>
        {devices.map(d => (
          <li key={d.id}>
            {d.subject?.email || d.device?.deviceId} - {d.status}
          </li>
        ))}
      </ul>
    </div>
  );
}
```
