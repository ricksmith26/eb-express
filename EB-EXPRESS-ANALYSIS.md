# eb-express API Analysis

> Generated: 2026-02-15

## Overview

eb-express is a multi-tenant healthcare API built with Express.js, supporting patient management, telecare, telemedicine, and real-time signaling.

| Metric | Count |
|---|---|
| HTTP endpoints | ~219 |
| Route files | 36 |
| Data models | 24 (mostly FHIR R4) |
| Socket.IO events | 23 |
| Services | 17 |
| Auth systems | 3 (Google OAuth, Cognito, Device JWT) |
| Consuming repos | 5 |

---

## Consuming Repositories

| Repository | Type | Framework | Endpoints Used |
|---|---|---|---|
| brigid-admin-portal | Web | React + RTK Query | ~55 |
| brigid-family-app | Mobile | React Native + Axios | ~22 + 16 socket events |
| brigid-response-center-v2 | Web | React + RTK Query | ~31 + 13 socket events |
| pi-setup | Desktop (Pi) | PyQt5 + Requests | ~16 |
| agent-starter-python | Backend | Python + aiohttp | ~26 |

**Excluded from analysis:** `outbound-caller`, `trisafe`

---

## Endpoint Usage by Consumer

### brigid-admin-portal

**Auth** (`authApi.ts`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/admin/auth/register` | Register practitioner |
| GET | `/admin/auth/me` | Get current user profile |
| PUT | `/admin/auth/me` | Update profile |
| POST | `/admin/auth/switch-org` | Switch organization |
| GET | `/admin/auth/my-organizations` | Get user's organizations |

**Organizations** (`organizationApi.ts`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/organizations` | List organizations |
| GET | `/admin/organizations/:id` | Get organization |
| POST | `/admin/organizations` | Create organization |
| PUT | `/admin/organizations/:id` | Update organization |
| DELETE | `/admin/organizations/:id` | Delete organization |
| POST | `/admin/organizations/:id/status` | Update org status |

**Patients** (`patientApi.ts`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/patients` | List patients |
| GET | `/admin/patients/:id` | Get patient |
| POST | `/admin/patients` | Create patient |
| PUT | `/admin/patients/:id` | Update patient |
| DELETE | `/admin/patients/:id` | Delete patient |
| POST | `/admin/patients/:patientId/devices` | Assign device |
| DELETE | `/admin/patients/:patientId/devices/:deviceId` | Remove device |

**Practitioners** (`practitionerApi.ts`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/practitioners` | List practitioners |
| GET | `/admin/practitioners/:id` | Get practitioner |
| POST | `/admin/practitioners/invite` | Invite practitioner |
| PUT | `/admin/practitioners/:id/role` | Update role |
| POST | `/admin/practitioners/:id/status` | Update status |
| DELETE | `/admin/practitioners/:id` | Remove practitioner |

**Devices** (`deviceApi.ts`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/devices` | List devices |
| GET | `/admin/devices/:id` | Get device |
| PUT | `/admin/devices/:id` | Update device |
| POST | `/admin/devices/:id/revoke` | Revoke device |
| POST | `/admin/devices/:id/reactivate` | Reactivate device |
| POST | `/admin/devices/:id/assign` | Assign to org |

**Roles** (`roleApi.ts`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/roles` | List roles |
| GET | `/admin/roles/permissions` | Get permissions |
| GET | `/admin/roles/:id` | Get role |
| POST | `/admin/roles` | Create role |
| PUT | `/admin/roles/:id` | Update role |
| DELETE | `/admin/roles/:id` | Delete role |

**Device Connections** (`deviceConnectionApi.ts`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/device-connections` | List connections |
| GET | `/device-connections/status` | Status summary |
| GET | `/device-connections/history` | Connection history |
| GET | `/device-connections/user/:email` | User's connections |
| GET | `/device-connections/history/:email` | User's connection history |

**Recordings** (`recordingApi.ts`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/recordings` | List recordings |
| GET | `/api/recordings/:key/download` | Presigned download URL |
| DELETE | `/api/recordings/:key` | Delete recording |

**Telecare Admin** (`telecareApi.ts`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/telecare/admin/devices/health` | Device health summary |
| POST | `/telecare/admin/devices/health/check` | Run health check |
| GET | `/telecare/admin/devices` | List telecare devices |
| GET | `/telecare/admin/devices/:deviceId` | Get telecare device |
| GET | `/telecare/admin/devices/:deviceId/status-history` | Status history |
| GET | `/telecare/admin/devices/:deviceId/metrics` | FHIR DeviceMetric history |
| GET | `/telecare/admin/devices/:deviceId/uptime` | Uptime statistics |
| GET | `/telecare/admin/devices/:deviceId/patient` | Linked patient/contacts |
| GET | `/telecare/admin/devices/:deviceId/power-status` | Power status |

**Socket.IO** (`connectionSocket.ts`)
| Direction | Event | Description |
|---|---|---|
| emit | `joinStatusMonitor` | Join status monitoring room |
| on | `telecareDeviceStatus` | Telecare device status change |
| on | `telecarePowerStatus` | Power status change |
| on | `device_status_change` | Device connection change |
| on | `statusMonitorJoined` | Receives current device list |

---

### brigid-response-center-v2

**Auth** (`authSlice.ts`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/admin/auth/register` | Register practitioner with backend after Cognito signup |
| GET | `/admin/auth/me` | Fetch user profile after login |

**Agents** (`agentApi.ts`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/asterisk/getInactiveAgent` | Get inactive agent |
| GET | `/asterisk/all` | Get all agents |
| PATCH | `/asterisk/agent/status/:id` | Update agent status |

**Patients** (`patientApi.ts`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/patient/lookup?phone=` | Lookup by phone |
| GET | `/patient/lookup?email=` | Lookup by email |
| GET | `/patient/:id` | Get patient |
| GET | `/patient/search` | Search patients |
| PATCH | `/patient/:patientId/medical-info` | Update medical info |
| PUT | `/patient/:patientId` | Update patient |

**Clinical** (`clinicalApi.ts`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/clinical/allergy-intolerance?patientId=` | Get allergies |
| POST | `/clinical/allergy-intolerance` | Create allergy |
| PUT | `/clinical/allergy-intolerance/:id` | Update allergy |
| DELETE | `/clinical/allergy-intolerance/:id` | Delete allergy |
| GET | `/clinical/condition?patientId=` | Get conditions |
| POST | `/clinical/condition` | Create condition |
| PUT | `/clinical/condition/:id` | Update condition |
| DELETE | `/clinical/condition/:id` | Delete condition |
| GET | `/clinical/medication-statement?patientId=` | Get medications |
| POST | `/clinical/medication-statement` | Create medication |
| PUT | `/clinical/medication-statement/:id` | Update medication |
| DELETE | `/clinical/medication-statement/:id` | Delete medication |
| GET | `/patient/:patientId/clinical-summary` | Get FHIR bundle |

**Call History** (`callHistoryApi.ts`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/call-history/twilio` | Create Twilio call record |
| POST | `/call-history/:callId/notes` | Add call notes |
| POST | `/call-history/:callId/end` | End call |
| GET | `/call-history/patient/:patientId` | Get by patient (legacy) |
| POST | `/call-history/patient/:patientId/note` | Create patient note |
| GET | `/call-history/patient/:patientId/communications` | All communications |

**Telecare** (`telecareApi.ts`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/telecare/alarms` | List alarms |
| GET | `/telecare/alarms/:alarmId` | Get alarm |
| GET | `/telecare/outcome-codes` | Get outcome codes |
| POST | `/telecare/alarms/:alarmId/acknowledge` | Acknowledge alarm |

**Signaling** (`patientApi.ts`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/send-webrtc-message/emergencyCall` | Trigger emergency call |

**Socket.IO** (`useSocket.ts`, `useEmergencyVideo.ts`)
| Direction | Event | Description |
|---|---|---|
| emit | `registerAgent` | Register agent |
| emit | `register` | Register with email + deviceType |
| emit | `activateVideoFeed` | Start video feed with offer |
| emit | `videoFeedIceCandidate` | Send ICE candidate for video |
| emit | `videoFeedDisconnected` | Disconnect video feed |
| on | `emergencyCallConnection` | Emergency call event |
| on | `agentStatusChange` | Agent status change |
| on | `deviceStatusChange` | Device status change |
| on | `alarmEscalation` | Alarm escalation event |
| on | `videoFeedAnswer` | Receive video feed answer |
| on | `videoFeedIceCandidate` | Receive ICE candidate for video |
| on | `videoFeedDisconnected` | Video feed disconnected |
| on | `videoFeedError` | Video feed error |

---

### brigid-family-app

**Auth** (`HomeScreen.tsx`, `axiosConfig.ts`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/login` | Login — sends email and name, receives tokens + user |
| POST | `/auth/refresh` | Token refresh via axios interceptor |

**Contacts** (`ContactsTab.tsx`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/relatedPerson/contacts` | Get contacts (requires `x-user-email` header) |
| POST | `/relatedPerson/contacts` | Add new contact |

**Patient Media** (`patientMediaService.ts`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/patient-media/upload-url` | Get presigned upload URL |
| POST | `/api/patient-media/:mediaId/confirm` | Confirm upload |
| GET | `/api/patient-media/patient/:email` | Get patient media |
| GET | `/api/patient-media/:mediaId/download-url` | Get download URL |
| DELETE | `/api/patient-media/:mediaId` | Delete media |

**Call History** (`callHistoryService.ts`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/call-history` | Get my call history |
| GET | `/call-history/fhir` | FHIR-formatted history |
| GET | `/call-history/stats` | Call statistics |
| GET | `/call-history/call/:callId` | Get specific call |
| GET | `/call-history/user/:email` | Get user's history |
| GET | `/call-history/stats/:email` | User's stats |

**Withings** (`withingsService.ts`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/withings/status` | Connection status |
| GET | `/withings/oauth/authorize` | OAuth authorization URL |
| POST | `/withings/disconnect` | Disconnect integration |
| GET | `/withings/data/measurements` | Body measurements |
| GET | `/withings/data/activity` | Activity data |
| GET | `/withings/data/sleep` | Sleep data |
| POST | `/withings/sync` | Manual sync |
| POST | `/withings/oauth/refresh` | Refresh token |

**Signaling** (`HomeScreen.tsx`, `ContactsTab.tsx`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/send-webrtc-message` | Send WebRTC message notification |

**Socket.IO** (`SocketProvider.tsx`, `CallScreen.tsx`, `WebRTCService.ts`)
| Direction | Event | Description |
|---|---|---|
| emit | `Register` | Register user with email + deviceType |
| emit | `RegisterPushToken` | Register FCM push token |
| emit | `CallUser` | Start outgoing call with offer |
| emit | `acceptCall` | Accept incoming call |
| emit | `rejectCall` | Reject incoming call |
| emit | `cancel_call` | Cancel queued outgoing call |
| emit | `hangup` | Hang up active call |
| emit | `Answer` | Send WebRTC answer |
| emit | `IceCandidate` | Send ICE candidate |
| on | `Message` | Receive WebRTC notification |
| on | `Offer` | Receive WebRTC offer |
| on | `CallInitiated` | Call initiation confirmation with callId |
| on | `recipient_available` | Recipient is online |
| on | `call_declined` | Recipient declined call |
| on | `call_cancelled` | Caller cancelled call |
| on | `HangUp` | Remote hangup |
| on | `CallRejected` | Call rejection |

---

### pi-setup

**Device Auth** (`auth_manager.py`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/device/register` | Register device with CSR |
| POST | `/device/token` | Exchange cert for JWT |
| POST | `/device/token/refresh` | Refresh JWT |

**Contacts** (`contacts_api.py`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/relatedPerson/contacts` | Get contacts by email |

**Calls** (`asterisk_api.py`, `call_history_api.py`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/asterisk/getInactiveCustomer` | Get SIP credentials |
| GET | `/call-history` | Get call history |

**Wellness** (`wellness_api.py`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/observation` | Submit FHIR Observation |

**Audit** (`audit_logger.py`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/auditEvent/batch` | Batch upload audit events |

**Telecare** (`telecare_api.py`, `app.py`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/telecare/devices/provision` | Provision SIP credentials |
| POST | `/telecare/devices/:deviceId/power-status` | Report power status |

**Media** (`media_uploader.py`, `media_fetcher.py`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/patient-media/upload-url` | Get presigned upload URL |
| POST | `/api/patient-media/:mediaId/confirm` | Confirm upload |
| GET | `/api/patient-media/patient/:email` | Get patient media |
| GET | `/api/patient-media/:mediaId/download-url` | Get download URL |

**LiveKit** (`winston.py`, `onboarding.py`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/livekit/connect/:identifier` | Get LiveKit room token |
| GET | `/api/livekit/connect/:identifier?isOnboarding=true` | LiveKit for onboarding |

**Socket.IO** (`socket_client.py`)
| Direction | Event | Description |
|---|---|---|
| on | `incomingCall` | Incoming call |
| on | `modeChange` | Mode change |
| on | `brigidCalendarReminder` | Calendar reminder |
| on | `spotify` | Spotify event |
| on | `emergencyCall` | Emergency call |
| on | `videoFeedOffer` | Video feed offer |

---

### agent-starter-python

**Patient** (`patient_service.py`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/patient/lookup?email=` | Lookup patient |
| POST | `/observation` | Submit wellness observation |

**Onboarding** (`onboarding_service.py`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/patients/` | Create new patient record (FHIR Patient) |
| POST | `/relatedPerson/` | Add contact for patient (FHIR RelatedPerson) |

**Contacts** (`contacts_service.py`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/relatedPerson/email/ai` | Get contacts (AI endpoint) |
| POST | `/send-webrtc-message` | Send WebRTC message |
| POST | `/send-webrtc-message/emergencyCall` | Emergency call |

**Outbound Call** (`patient_service.py`, `agent.py`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/outbound-call/pending-notifications/:email` | Get pending notifications |
| POST | `/outbound-call/pending-notifications/:id/acknowledge` | Acknowledge notification |
| GET | `/outbound-call/facial-recognition/:patientId` | Facial recognition notifications |
| POST | `/outbound-call/callback` | Callback URL for appointment confirmation |

**Session** (`session_service.py`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/modes/` | Change mode / disconnect user |

**Media** (`media_service.py`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/spotify/requestMusic` | Request music playback |

**Old Calendar** (`calendar_service.py`) — *commented out in agent.py but code exists*
| Method | Endpoint | Description |
|---|---|---|
| GET | `/calendar/:email/week` | Week's events |
| GET | `/calendar/:email/today` | Today's events |
| GET | `/calendar/:email/date?date=` | Events by date |
| POST | `/calendar/event` | Create event |

**Brigid Calendar** (`brigid_calendar_service.py`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/brigid-calendar/events` | Get events |
| GET | `/brigid-calendar/events/today` | Today's events |
| GET | `/brigid-calendar/events/range` | Events by range |
| GET | `/brigid-calendar/events/:eventId` | Get event |
| POST | `/brigid-calendar/events` | Create event |
| PUT | `/brigid-calendar/events/:eventId` | Update event |
| DELETE | `/brigid-calendar/events/:eventId` | Delete event |
| POST | `/brigid-calendar/events/:eventId/rsvp` | RSVP to event |
| POST | `/brigid-calendar/events/:eventId/invitees` | Add invitees |
| DELETE | `/brigid-calendar/events/:eventId/invitees/:email` | Remove invitee |

---

## Unused Endpoints

These endpoints exist in eb-express but have **no consumer** in any repo:

### Definitely Unused

| Feature | Endpoints | Notes |
|---|---|---|
| Google OAuth | `GET /auth/google`, `GET /auth/google/callback` | Replaced by Cognito |
| Google Calendar webhook | `POST /webhook/google-calendar` | Legacy |
| Auth (partial) | `GET /auth/me`, `GET /auth/logout` | `POST /auth/login` and `POST /auth/refresh` ARE used by brigid-family-app |
| Spotify (partial) | `POST /spotify/search`, `/spotify/token`, `/spotify/refresh` | `POST /spotify/requestMusic` IS used by agent-starter-python; socket event also used by pi-setup |
| Images | `GET /images/image/:fileId/:email`, `GET /images/all` | No consumer |
| Queue | `POST /queue/addAgent`, `POST /queue/addCustomer` | No consumer |
| WebRTC add credentials | `POST /send-webrtc-message/addAsteriskCredentials` | No consumer |
| Device connections (partial) | `GET /device-connections/online`, `GET /device-connections/agent/:username`, `GET /device-connections/:id` | Other device-connection endpoints ARE used |
| Observation (partial) | `GET /observation/stats`, `GET /observation/device/:deviceId` | POST and patient-level GET are used |
| AuditEvent (partial) | `POST /auditEvent` (single), `GET /auditEvent/stats`, `GET /auditEvent/alerts`, `GET /auditEvent/device/*`, `GET /auditEvent/:id` | Only batch POST is used |
| Telecare admin (partial) | `POST /telecare/admin/devices` (create), `PUT /telecare/admin/devices/:id` (update), `POST .../deactivate`, `DELETE .../devices/:id`, `POST .../link`, `GET .../credentials`, `POST .../regenerate-password` | Some admin device endpoints are used, these specific ones are not |
| Telecare escalation | `GET /telecare/admin/escalation-config`, `PUT /telecare/admin/escalation-config`, `GET .../escalation-config/all`, `GET .../escalation-status` | No consumer |
| Telecare admin stats | `GET /telecare/admin/stats` | No consumer |
| Telecare admin alarms | `GET /telecare/admin/alarms`, `GET .../alarms/:id`, `POST .../acknowledge`, `GET .../outcome-codes` | Agent-facing `/telecare/alarms` used instead |
| Observation by device | `GET /observation/device/:deviceId`, `GET /observation/:id` | No consumer |
| Call history (partial) | `GET /call-history/phone/:phone` | No consumer |
| Related person (partial) | `GET /relatedPerson/:id`, `GET /relatedPerson`, `PUT /relatedPerson/:id`, `DELETE /relatedPerson/:id`, `GET /relatedPerson/getByEmail` | `POST /relatedPerson`, GET/POST `/relatedPerson/contacts`, and `GET /relatedPerson/email/ai` are used; CRUD by ID is not |

### Potentially Redundant

| Issue | Details |
|---|---|
| Two calendar systems | Old `/calendar/*` (4 endpoints) AND new `/brigid-calendar/*` (10 endpoints) both active in agent-starter-python |
| Duplicate patient routes | `/patients` and `/patient` mount the same router |
| Duplicate patient media access | Both pi-setup and brigid-family-app use the same media endpoints |

---

## Naming Convention Issues

| Issue | Examples | Recommendation |
|---|---|---|
| camelCase vs kebab-case in routes | `relatedPerson` vs `call-history` vs `patient-media` | Standardise to kebab-case |
| Inconsistent `/api` prefix | `/api/recordings`, `/api/patient-media`, `/api/livekit` have it; `/call-history`, `/patients` don't | Pick one convention |
| Duplicate route mount | `/patients` AND `/patient` both work | Use one path |
| Controller file naming | `ImagesController.js` (Pascal), `patientController.js` (camel), `call-history-controller.js` (kebab) | Standardise to kebab-case |
| Service file naming | `WithingsService.js` (Pascal), `pushNotificationService.js` (camel), `call-history-service.js` (kebab) | Standardise to kebab-case |
| Method name typo | `addAddAsteriskCredentials` (double "Add") | Fix |
| Route structure inconsistency | Admin routes nested under `/admin/*`, telecare under `/telecare/admin/*`, others flat | Consider unified prefix strategy |

---

## Code Quality & Security Issues

### Critical

1. **Hardcoded Spotify credentials in `app.js`** — Client ID and secret in source code. Move to env vars.
2. **Placeholder auth in `call-history-routes.js`** — `noAuth` middleware accepts `x-user-email` header as identity with fallback to `test@example.com`. Anyone can impersonate any user.
3. **Empty file** — `call-center-controller.js` is 0 bytes.

### High

4. **Optional auth on sensitive endpoints** — Observation and audit event routes use `optionalDeviceAuth`, callable without authentication.
5. **No input validation** — No joi/zod/yup. Query params parsed directly without type checking.
6. **No rate limiting** — No `express-rate-limit` or equivalent.
7. **No security headers** — No `helmet` middleware.

### Medium

8. **Old `asterisk-manager` dependency** (v0.2.0) — Audit for vulnerabilities.
9. **Inconsistent auth patterns** — 4 auth systems with complex fallback chains.
10. **Socket.IO minimal validation** — User registration events have limited access control.
11. **Missing CORS configuration** — No explicit CORS library.

---

## Architecture Notes

### Authentication

| System | Used By | Mechanism |
|---|---|---|
| AWS Cognito | brigid-admin-portal | JWT via JWKS |
| Device JWT | pi-setup | Certificate + JWT |
| API Key (`X-API-Key`) | agent-starter-python | Header-based |
| Google OAuth | *unused* | Legacy |
| `x-user-email` header | pi-setup (call-history) | Insecure placeholder |

### Databases

| Database | Purpose |
|---|---|
| MongoDB | Primary — FHIR models, patients, all documents |
| PostgreSQL | Telecare/PJSIP realtime tables |

### External Services

| Service | Status |
|---|---|
| AWS S3 | Active — recordings, patient media |
| AWS Cognito | Active — admin auth |
| Firebase Admin SDK | Active — push notifications |
| Asterisk AMI | Active — VoIP call management |
| Withings API | Active — health data |
| LiveKit | Active — Winston AI voice |
| Google OAuth/Calendar/Drive | Unused |
| Spotify API | `POST /spotify/requestMusic` used by agent-starter-python; socket event used by pi-setup; search/token/refresh unused |

---

## Recommended Structure for New API

Based on active usage, the new API needs ~120 endpoints grouped as:

1. **Auth** — Cognito registration, profile, org switching (~5 endpoints)
2. **Admin: Organizations** — CRUD + status (~6 endpoints)
3. **Admin: Patients** — CRUD + device assignment (~7 endpoints)
4. **Admin: Practitioners** — CRUD + invite, role, status (~6 endpoints)
5. **Admin: Devices** — CRUD + revoke, reactivate, assign (~6 endpoints)
6. **Admin: Roles** — CRUD + permissions (~6 endpoints)
7. **Telecare: Admin** — Device health, metrics, uptime, power, patient links (~9 endpoints)
8. **Telecare: Agent** — Alarms, acknowledge, outcome codes (~4 endpoints)
9. **Telecare: Device** — Provision, power-status reporting (~2 endpoints)
10. **Device Auth** — Register, token, refresh (~3 endpoints)
11. **Device Connections** — List, status, history (~5 endpoints)
12. **Patients** — Lookup, search, medical-info, clinical-summary (~5 endpoints)
13. **Clinical** — Allergy, condition, medication CRUD (~12 endpoints)
14. **Call History** — History, FHIR, stats, notes, communications (~12 endpoints)
15. **Recordings** — List, download, delete, attach (~4 endpoints)
16. **Patient Media** — Upload, confirm, list, download, delete (~5 endpoints)
17. **Observations** — Submit, patient observations, wellness (~5 endpoints)
18. **Audit Events** — Batch submit (~1 endpoint, expand later)
19. **Related Persons** — Get by email, contacts (~3 endpoints)
20. **Calendar** — Brigid calendar full CRUD + old calendar reads (~14 endpoints)
21. **Outbound Call** — Notifications, acknowledge, facial recognition (~3 endpoints)
22. **Signaling** — WebRTC messages, emergency call (~2 endpoints)
23. **LiveKit** — Connection tokens (~1 endpoint)
24. **Withings** — OAuth, data, sync (~8 endpoints)
25. **Asterisk** — Agent status, inactive customer/agent (~4 endpoints)
26. **Modes** — Mode change (~1 endpoint)
27. **Spotify** — Request music (~1 endpoint)
28. **Auth (Family App)** — Login, refresh (~2 endpoints)
29. **Socket.IO Events** — ~40+ active events across all consumers

### Can be dropped entirely
- Google OAuth (`/auth/google`, `/auth/google/callback`)
- Google Calendar webhook (`/webhook/google-calendar`)
- Auth partial (`GET /auth/me`, `GET /auth/logout`) — login + refresh ARE used by brigid-family-app
- Spotify partial (`/spotify/search`, `/spotify/token`, `/spotify/refresh`) — requestMusic IS used
- Images (`/images/*`)
- Queue (`/queue/*`)
- Google Drive integration
- User model (Google-based)
