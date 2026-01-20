# Telecare API Documentation

BS 8521-2 compliant telecare device and alarm management API.

## Overview

The Telecare API manages BS 8521-2 (NOW-IP) compliant telecare devices, their SIP credentials, and alarm events. It connects to a PostgreSQL database that is also used by Asterisk for PJSIP realtime configuration.

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Admin Portal   │     │   Agent App     │     │ Telecare Device │
│  (React)        │     │   (WebRTC)      │     │ (SIP Client)    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ Cognito JWT           │ JWT                   │ SIP/WSS
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Express API                               │
│                    /telecare/* endpoints                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
┌─────────────────────┐         ┌─────────────────────┐
│     PostgreSQL      │         │      MongoDB        │
│  (RDS)              │         │  (Atlas)            │
│  - ps_endpoints     │         │  - Patient          │
│  - ps_auths         │         │  - FhirDevice       │
│  - ps_aors          │         │  - Organization     │
│  - telecare_devices │         │                     │
│  - alarm_events     │         │                     │
└─────────────────────┘         └─────────────────────┘
              │
              ▼
┌─────────────────────┐
│      Asterisk       │
│  (PJSIP Realtime)   │
└─────────────────────┘
```

## Authentication

### Admin Routes (`/telecare/admin/*`)
- **Method**: AWS Cognito JWT token
- **Header**: `Authorization: Bearer <cognito-token>`
- **Additional Header**: `X-Organization-Id: <org-id>` (optional, for org context)
- **Required**: Practitioner role with appropriate permissions

### Agent Routes (`/telecare/*`)
- **Method**: Application JWT token
- **Header**: `Authorization: Bearer <jwt-token>`

## API Endpoints

### Device Management (Admin)

#### List Devices
```http
GET /telecare/admin/devices?active=true&limit=50&offset=0
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| active | boolean | Filter by active status |
| limit | number | Results per page (default: 50) |
| offset | number | Pagination offset |

**Response:**
```json
{
  "resourceType": "Bundle",
  "type": "searchset",
  "total": 100,
  "entry": [
    {
      "resource": {
        "resourceType": "TelecareDevice",
        "id": "TC-0001",
        "status": "active",
        "deviceType": "pendant",
        "deviceModel": "Tunstall Lifeline Vi+",
        "user": {
          "name": "Margaret Smith",
          "address": "42 High Street, London, SW1A 1AA",
          "phone": "+447700900123"
        },
        "emergencyContact": {
          "name": "John Smith",
          "phone": "+447700900124",
          "relationship": "Son"
        },
        "references": {
          "fhirDeviceId": "507f1f77bcf86cd799439011",
          "patientId": "507f1f77bcf86cd799439012",
          "organizationId": "org-001"
        }
      }
    }
  ]
}
```

#### Get Device
```http
GET /telecare/admin/devices/:deviceId
```

#### Create Device
```http
POST /telecare/admin/devices
Content-Type: application/json

{
  "deviceId": "TC-0001",          // Optional - auto-generated if not provided
  "userName": "Margaret Smith",
  "userAddress": "42 High Street, London, SW1A 1AA",
  "userPhone": "+447700900123",
  "emergencyContactName": "John Smith",
  "emergencyContactPhone": "+447700900124",
  "emergencyContactRelationship": "Son",
  "secondaryContactName": "Jane Smith",
  "secondaryContactPhone": "+447700900125",
  "gpName": "Dr Williams",
  "gpPhone": "+441onal234567",
  "deviceType": "pendant",
  "deviceModel": "Tunstall Lifeline Vi+",
  "patientId": "507f1f77bcf86cd799439012",    // MongoDB Patient ID
  "fhirDeviceId": "507f1f77bcf86cd799439011", // MongoDB FhirDevice ID
  "notes": "Hearing impaired - speak clearly"
}
```

**Response:**
```json
{
  "message": "Device created successfully",
  "device": { ... },
  "credentials": {
    "deviceId": "TC-0001",
    "sipPassword": "xK7mNp3qRs9tVw2y",
    "sipServer": "asterisk.brigid-personal-assistant.com",
    "sipPort": 5060,
    "wssPort": 4443,
    "transport": "wss"
  }
}
```

#### Update Device
```http
PUT /telecare/admin/devices/:deviceId
Content-Type: application/json

{
  "userName": "Margaret Smith-Jones",
  "emergencyContactPhone": "+447700900999"
}
```

#### Deactivate Device
```http
POST /telecare/admin/devices/:deviceId/deactivate
```

#### Delete Device (Super Admin only)
```http
DELETE /telecare/admin/devices/:deviceId
```

#### Link Device to Patient
```http
POST /telecare/admin/devices/:deviceId/link
Content-Type: application/json

{
  "patientId": "507f1f77bcf86cd799439012",
  "fhirDeviceId": "507f1f77bcf86cd799439011"
}
```

#### Get SIP Credentials
```http
GET /telecare/admin/devices/:deviceId/credentials
```

**Response:**
```json
{
  "deviceId": "TC-0001",
  "sipPassword": "xK7mNp3qRs9tVw2y",
  "sipServer": "asterisk.brigid-personal-assistant.com",
  "sipPort": 5060,
  "wssPort": 4443,
  "transport": "wss"
}
```

#### Regenerate SIP Password
```http
POST /telecare/admin/devices/:deviceId/regenerate-password
```

### Alarm Management

#### List Alarms
```http
GET /telecare/admin/alarms?deviceId=TC-0001&acknowledged=false&limit=50
GET /telecare/alarms?acknowledged=false  # Agent route
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| deviceId | string | Filter by device |
| acknowledged | boolean | Filter by acknowledgment status |
| limit | number | Results per page |
| offset | number | Pagination offset |

**Response:**
```json
{
  "resourceType": "Bundle",
  "type": "searchset",
  "total": 5,
  "entry": [
    {
      "resource": {
        "resourceType": "TelecareAlarm",
        "id": 123,
        "deviceId": "TC-0001",
        "alarmType": "fall",
        "alarmCode": "FA01",
        "location": "Living Room",
        "user": {
          "name": "Margaret Smith",
          "address": "42 High Street, London",
          "phone": "+447700900123"
        },
        "emergencyContact": {
          "name": "John Smith",
          "phone": "+447700900124"
        },
        "receivedAt": "2026-01-20T14:30:00Z",
        "acknowledged": false
      }
    }
  ]
}
```

#### Get Alarm Details
```http
GET /telecare/admin/alarms/:alarmId
GET /telecare/alarms/:alarmId  # Agent route
```

#### Acknowledge Alarm
```http
POST /telecare/admin/alarms/:alarmId/acknowledge
POST /telecare/alarms/:alarmId/acknowledge  # Agent route
Content-Type: application/json

{
  "notes": "Caller confirmed false alarm - cat knocked pendant"
}
```

### Statistics

#### Get Dashboard Statistics
```http
GET /telecare/admin/stats
GET /telecare/stats  # Agent route
```

**Response:**
```json
{
  "devices": {
    "active": 950,
    "inactive": 50,
    "total": 1000
  },
  "alarms": {
    "unacknowledged": 3,
    "today": 12,
    "total": 5432
  }
}
```

## RBAC Permissions

| Permission | Description |
|------------|-------------|
| `devices:read` | View telecare devices and alarms |
| `devices:write` | Create/update devices, acknowledge alarms |
| `devices:delete` | Deactivate devices |
| `super_admin` role | Delete devices, regenerate passwords |
| `org_admin` role | Access SIP credentials |

## Database Schema

### telecare_devices
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| device_id | VARCHAR(40) | Unique device identifier (e.g., TC-0001) |
| user_name | VARCHAR(100) | Service user's name |
| user_address | VARCHAR(500) | Service user's address |
| user_phone | VARCHAR(20) | Service user's phone |
| emergency_contact_name | VARCHAR(100) | Emergency contact name |
| emergency_contact_phone | VARCHAR(20) | Emergency contact phone |
| emergency_contact_relationship | VARCHAR(50) | Relationship to user |
| secondary_contact_name | VARCHAR(100) | Secondary contact name |
| secondary_contact_phone | VARCHAR(20) | Secondary contact phone |
| gp_name | VARCHAR(100) | GP name |
| gp_phone | VARCHAR(20) | GP phone |
| device_type | VARCHAR(50) | pendant, wristband, fixed_unit, etc. |
| device_model | VARCHAR(100) | Device model name |
| organization_id | VARCHAR(40) | Managing organization ID |
| fhir_device_id | VARCHAR(40) | MongoDB FhirDevice reference |
| patient_id | VARCHAR(40) | MongoDB Patient reference |
| is_active | BOOLEAN | Device active status |
| notes | TEXT | Additional notes |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |

### alarm_events
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| device_id | VARCHAR(40) | Source device ID |
| alarm_type | VARCHAR(50) | Alarm type (fall, panic, smoke, etc.) |
| alarm_code | VARCHAR(20) | BS 8521-2 alarm code |
| location | VARCHAR(200) | Location within property |
| raw_xml | TEXT | Original alarm XML |
| received_at | TIMESTAMP | When alarm was received |
| acknowledged_at | TIMESTAMP | When alarm was acknowledged |
| acknowledged_by | VARCHAR(40) | Who acknowledged |
| call_id | VARCHAR(100) | Associated voice call ID |
| notes | TEXT | Agent notes |

## Environment Variables

```bash
# PostgreSQL (required for telecare)
POSTGRES_HOST=your-rds-instance.region.rds.amazonaws.com
POSTGRES_PORT=5432
POSTGRES_DATABASE=postgres
POSTGRES_USER=asterisk
POSTGRES_PASSWORD=your-secure-password
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| DEVICE_NOT_FOUND | 404 | Device ID does not exist |
| DEVICE_EXISTS | 409 | Device ID already in use |
| DEVICE_LIST_ERROR | 500 | Failed to list devices |
| DEVICE_CREATE_ERROR | 500 | Failed to create device |
| DEVICE_UPDATE_ERROR | 500 | Failed to update device |
| ALARM_NOT_FOUND | 404 | Alarm ID does not exist |
| ALARM_LIST_ERROR | 500 | Failed to list alarms |
| MISSING_PATIENT_ID | 400 | patientId required for linking |

## Integration with Asterisk

When a device is created via this API:

1. **ps_auths** - SIP authentication credentials are created
2. **ps_aors** - Address of Record entry is created
3. **ps_endpoints** - PJSIP endpoint is created with:
   - WebRTC/WSS transport
   - `from-telecare` context for voice calls
   - `telecare-messages` context for SIP MESSAGE (alarms)

The device can immediately register with Asterisk using the provided credentials.

## Call Flow

1. Device sends SIP MESSAGE with BS 8521-2 alarm XML
2. Asterisk AGI parses XML, logs to `alarm_events` table
3. Device initiates voice call
4. Asterisk AGI looks up device info from `telecare_devices`
5. Call routes to `inbound-queue`
6. Agent answers, sees device/user info
7. Agent acknowledges alarm via API
