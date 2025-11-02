# WebRTC Call History - FHIR Implementation

This implementation adds comprehensive call history tracking for WebRTC calls using the FHIR R4 Communication resource standard.

## Overview

All WebRTC calls are automatically tracked and stored in FHIR format, capturing:
- Call participants (sender and recipients)
- Call status (preparation, in-progress, completed, not-done, etc.)
- Call duration
- Call type (regular, emergency)
- Connection quality metrics
- End reasons (completed, rejected, missed, timeout, error)

## Architecture

### Models
- **FhirCommunication** ([models/FhirCommunication.js](models/FhirCommunication.js))
  - FHIR R4 Communication resource schema
  - Stores call metadata in compliance with FHIR standards
  - Includes WebRTC-specific extensions for Socket.IO integration

### Services
- **CallHistoryService** ([services/call-history-service.js](services/call-history-service.js))
  - Handles all call history operations
  - Methods: initiateCall, acceptCall, rejectCall, endCall, missedCall
  - Query methods for retrieving history and statistics

### WebSocket Integration
Call history is automatically tracked at the WebSocket event level:

1. **[socketIo/events/callUser.js](socketIo/events/callUser.js)** - Creates call record when call is initiated
2. **[socketIo/events/acceptCall.js](socketIo/events/acceptCall.js)** - Updates status to "in-progress" when call is accepted
3. **[socketIo/events/rejectCall.js](socketIo/events/rejectCall.js)** - Marks call as "not-done" with reason "rejected"
4. **[socketIo/events/hangUp.js](socketIo/events/hangUp.js)** - Marks call as completed and calculates duration

### API Endpoints

Base path: `/call-history`

#### Get My Call History
```http
GET /call-history
Authorization: Required (isAuth middleware)
Query Parameters:
  - status: Filter by call status (preparation, in-progress, completed, not-done, etc.)
  - isEmergency: Filter emergency calls (true/false)
  - startDate: Filter by start date (ISO format)
  - endDate: Filter by end date (ISO format)
  - limit: Number of records (default: 100)
  - skip: Pagination offset (default: 0)

Response:
{
  "success": true,
  "count": 25,
  "data": [/* array of FHIR Communication resources */]
}
```

#### Get FHIR-Formatted Call History
```http
GET /call-history/fhir
Authorization: Required
Query Parameters: Same as above

Response: FHIR Bundle
{
  "resourceType": "Bundle",
  "type": "searchset",
  "total": 25,
  "entry": [
    {
      "fullUrl": "Communication/{id}",
      "resource": {/* FHIR Communication resource */}
    }
  ]
}
```

#### Get My Call Statistics
```http
GET /call-history/stats
Authorization: Required
Query Parameters:
  - startDate: ISO date
  - endDate: ISO date

Response:
{
  "success": true,
  "data": {
    "totalCalls": 150,
    "totalDuration": 45000,
    "averageDuration": 300,
    "byStatus": [
      { "_id": "completed", "count": 120, "totalDuration": 40000, "avgDuration": 333 },
      { "_id": "not-done", "count": 30, "totalDuration": 0, "avgDuration": 0 }
    ]
  }
}
```

#### Get Specific Call
```http
GET /call-history/call/:callId
Authorization: Required

Response:
{
  "success": true,
  "data": {/* FHIR Communication resource */}
}
```

#### Get User Call History (by email)
```http
GET /call-history/user/:email
Authorization: Required
Query Parameters: Same as main call history endpoint
```

#### Get User Call Statistics (by email)
```http
GET /call-history/stats/:email
Authorization: Required
Query Parameters: startDate, endDate
```

## WebSocket Event Updates

### Client-Side Changes Required

To enable call history tracking, clients must include the `callId` in their WebSocket events:

#### 1. callUser Event
```javascript
socket.emit('callUser', {
  toEmail: 'recipient@example.com',
  offer: sdpOffer,
  callerName: 'John Doe',        // Optional
  recipientName: 'Jane Smith'     // Optional
});

// Server will respond with:
socket.on('offer', ({ from, offer, callId }) => {
  // Store callId for subsequent events
  currentCallId = callId;
});
```

#### 2. acceptCall Event
```javascript
socket.emit('acceptCall', {
  from: callerEmail,
  callId: currentCallId  // Include callId received from offer
});
```

#### 3. rejectCall Event (New)
```javascript
socket.emit('rejectCall', {
  from: callerEmail,
  callId: currentCallId
});

socket.on('callRejected', ({ from, callId }) => {
  // Handle rejection
});
```

#### 4. hangup Event
```javascript
socket.emit('hangup', {
  toEmail: recipientEmail,
  callId: currentCallId,
  endReason: 'completed',  // or 'cancelled', 'error'
  connectionQuality: {     // Optional
    iceConnectionState: 'connected',
    iceGatheringState: 'complete',
    signalingState: 'stable'
  }
});
```

## FHIR Communication Resource Structure

Example call record:

```json
{
  "resourceType": "Communication",
  "status": "completed",
  "category": [{
    "coding": [{
      "system": "http://terminology.hl7.org/CodeSystem/communication-category",
      "code": "notification",
      "display": "Notification"
    }],
    "text": "WebRTC Call"
  }],
  "medium": [{
    "coding": [{
      "system": "http://terminology.hl7.org/CodeSystem/v3-ParticipationMode",
      "code": "VIDEOCONF",
      "display": "Video Conference"
    }]
  }],
  "sender": {
    "identifier": {
      "system": "email",
      "value": "caller@example.com"
    },
    "display": "John Doe"
  },
  "recipient": [{
    "identifier": {
      "system": "email",
      "value": "recipient@example.com"
    },
    "display": "Jane Smith"
  }],
  "sent": "2025-10-30T10:00:00Z",
  "received": "2025-10-30T10:00:05Z",
  "callMetadata": {
    "callId": "uuid-v4-string",
    "socketIds": {
      "caller": "socket-id-1",
      "recipient": "socket-id-2"
    },
    "callType": "regular",
    "callDuration": 300,
    "endReason": "completed",
    "isEmergency": false
  },
  "createdAt": "2025-10-30T10:00:00Z",
  "updatedAt": "2025-10-30T10:05:00Z"
}
```

## Database Indexes

The following indexes are automatically created for optimal query performance:

- `sender.identifier.value + createdAt` (descending)
- `recipient.identifier.value + createdAt` (descending)
- `callMetadata.callId` (unique)
- `status + createdAt` (descending)
- `callMetadata.isEmergency + createdAt` (descending)

## Testing

Example queries to test the implementation:

```bash
# Get my call history
curl -X GET http://localhost:3000/call-history \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get calls from last 7 days
curl -X GET "http://localhost:3000/call-history?startDate=2025-10-23T00:00:00Z" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get only completed calls
curl -X GET "http://localhost:3000/call-history?status=completed" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get call statistics
curl -X GET http://localhost:3000/call-history/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get specific call by ID
curl -X GET http://localhost:3000/call-history/call/YOUR_CALL_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get FHIR Bundle format
curl -X GET http://localhost:3000/call-history/fhir \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Benefits of FHIR Format

1. **Standardization**: Uses HL7 FHIR R4 standard for healthcare interoperability
2. **Extensibility**: Easy to add custom extensions while maintaining FHIR compliance
3. **Querying**: Rich querying capabilities with MongoDB indexes
4. **Integration**: Compatible with FHIR-compliant systems and EHRs
5. **Analytics**: Aggregation support for call statistics and reporting

## Future Enhancements

- Call recording storage (payload.contentAttachment)
- Quality metrics tracking (jitter, packet loss, bitrate)
- Call transcription integration
- Integration with FHIR Practitioner resources
- Real-time call analytics dashboard
- Export to FHIR servers via REST API
