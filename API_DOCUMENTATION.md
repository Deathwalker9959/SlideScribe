# API Documentation

This document provides comprehensive API documentation for the PPTX-TTS microservices architecture.

## Services Overview

### AI Refinement Service
**Base URL:** `http://localhost:8001`

The AI Refinement Service provides text enhancement capabilities using AI models to improve clarity, grammar, and readability.

#### Authentication
All endpoints require JWT authentication via Bearer token in the Authorization header.

#### Endpoints

##### Health Check
```http
GET /health
```
Returns the health status of the AI Refinement Service.

**Response:**
```json
{
  "success": true,
  "message": "AI Refinement Service is healthy",
  "data": null
}
```

##### Text Refinement
```http
POST /refine
```
Apply AI-powered refinements to improve text quality.

**Request Body:**
```json
{
  "text": "Text to be refined",
  "refinement_type": "clarity_enhancement",
  "language": "en",
  "preserve_formatting": true
}
```

**Response:**
```json
{
  "refined_text": "Enhanced version of the input text",
  "refinement_type": "clarity_enhancement",
  "changes_applied": ["grammar_correction", "clarity_improvement"],
  "processing_time": 2.34
}
```

##### Get Refinement Types
```http
GET /refinement-types
```
Retrieve all available refinement types and their configurations.

**Response:**
```json
{
  "success": true,
  "message": "Refinement types retrieved successfully",
  "data": {
    "types": [
      {
        "id": "clarity_enhancement",
        "name": "Clarity Enhancement",
        "description": "Improves text clarity and readability"
      },
      {
        "id": "professional_tone",
        "name": "Professional Tone",
        "description": "Enhances professional writing style"
      }
    ]
  }
}
```

##### Batch Text Refinement
```http
POST /batch-refine
```
Process multiple text refinement requests simultaneously.

**Request Body:**
```json
[
  {
    "text": "First text to refine",
    "refinement_type": "clarity_enhancement"
  },
  {
    "text": "Second text to refine",
    "refinement_type": "professional_tone"
  }
]
```

**Response:**
```json
[
  {
    "refined_text": "First improved text with better clarity",
    "refinement_type": "clarity_enhancement",
    "changes_applied": ["grammar_correction"],
    "processing_time": 1.23
  },
  {
    "refined_text": "Second improved text with professional tone",
    "refinement_type": "professional_tone",
    "changes_applied": ["tone_adjustment"],
    "processing_time": 2.45
  }
]
```

### TTS Service
**Base URL:** `http://localhost:8002`

The Text-to-Speech Service converts text into high-quality speech audio using multiple TTS providers.

#### Endpoints

##### Health Check
```http
GET /health
```
Returns the health status of the TTS Service.

**Response:**
```json
{
  "status": "ok"
}
```

##### Text-to-Speech Synthesis
```http
POST /synthesize
```
Generate speech audio from text using configurable TTS engines.

**Request Body:**
```json
{
  "text": "Hello, welcome to our text-to-speech service!",
  "voice": "en-US-AriaNeural",
  "speed": 1.2,
  "pitch": 5,
  "output_format": "mp3",
  "driver": "azure"
}
```

**Response:**
```json
{
  "audio_url": "https://api.example.com/media/audio/speech_12345.mp3",
  "duration": 15.4,
  "format": "mp3",
  "voice_used": "en-US-AriaNeural",
  "file_size": 245760,
  "created_at": "2024-01-15T10:30:00Z"
}
```

### Authentication Service

#### User Login
```http
POST /token
```
Authenticate user credentials and receive JWT access token.

**Request Body (form-data):**
```
username=testuser
password=testpass
```

**Response:**
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "token_type": "bearer"
}
```

#### Get Current User
```http
GET /users/me
```
Retrieve current authenticated user information.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "username": "testuser",
  "disabled": false
}
```

## Error Handling

All services follow a consistent error response format:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error information"
}
```

### Common HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `500` - Internal Server Error

## Rate Limiting

Each service implements rate limiting to ensure fair usage:
- AI Refinement Service: 100 requests per minute per user
- TTS Service: 50 requests per minute per user

## Data Models

### TextRefinementRequest
```json
{
  "text": "string (required)",
  "refinement_type": "string (optional)",
  "language": "string (optional, default: 'en')",
  "preserve_formatting": "boolean (optional, default: true)"
}
```

### TextRefinementResponse
```json
{
  "refined_text": "string",
  "refinement_type": "string",
  "changes_applied": ["string"],
  "processing_time": "number"
}
```

### TTSRequest
```json
{
  "text": "string (required)",
  "voice": "string (optional, default: 'en-US-AriaNeural')",
  "speed": "number (optional, default: 1.0)",
  "pitch": "number (optional, default: 0)",
  "output_format": "string (optional, default: 'mp3')",
  "driver": "string (optional, default: 'azure')"
}
```

## Interactive Documentation

For interactive API documentation with live testing capabilities:

- **AI Refinement Service**: `http://localhost:8001/docs`
- **TTS Service**: `http://localhost:8002/docs`

These endpoints provide full OpenAPI/Swagger documentation with the ability to test API calls directly from your browser.

## SDKs and Examples

### Python Example
```python
import requests

# Authenticate
auth_response = requests.post("http://localhost:8000/token", 
                            data={"username": "testuser", "password": "testpass"})
token = auth_response.json()["access_token"]

headers = {"Authorization": f"Bearer {token}"}

# Refine text
refine_response = requests.post("http://localhost:8001/refine", 
                               json={"text": "This needs improvement"}, 
                               headers=headers)
refined = refine_response.json()

# Generate speech
tts_response = requests.post("http://localhost:8002/synthesize",
                           json={"text": refined["refined_text"]})
audio_info = tts_response.json()
```

### JavaScript Example
```javascript
// Authenticate
const authResponse = await fetch('http://localhost:8000/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'username=testuser&password=testpass'
});
const { access_token } = await authResponse.json();

// Refine text
const refineResponse = await fetch('http://localhost:8001/refine', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ text: 'This needs improvement' })
});
const refined = await refineResponse.json();

// Generate speech
const ttsResponse = await fetch('http://localhost:8002/synthesize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: refined.refined_text })
});
const audioInfo = await ttsResponse.json();
```

## Support

For technical support and questions:
- Email: support@example.com
- Documentation: [GitHub Repository](https://github.com/example/pptx-tts)
- Issues: [GitHub Issues](https://github.com/example/pptx-tts/issues)
