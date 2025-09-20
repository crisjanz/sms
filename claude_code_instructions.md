# SMS Dashboard Project Instructions for Claude Code

## Project Overview
Building a standalone SMS dashboard server for a flower shop (In Your Vase Flowers) to manage customer delivery notifications and replies. This will be deployed to Render with domain integration.

## Current Status
We have an existing HTML file (`twilio_sms_dashboard.html`) that works but needs to be converted to a proper server-based solution with real-time capabilities.

## Project Requirements

### 1. Server Architecture
- **Platform**: Node.js/Express server for Render deployment
- **Storage**: JSON files (temporary solution until POS integration)
- **Real-time**: WebSocket for live message updates
- **Data Source**: Twilio API as source of truth (re-download on startup)

### 2. Core Features Needed
- Send SMS messages to customers via Twilio
- Receive incoming SMS replies in real-time
- Auto-forward customer replies to owner's cell phone
- Customer name management (phone number → name mapping)
- iPad Messages-style UI layout

### 3. Technical Specifications

#### Server Components
- **Express server** with WebSocket support
- **Twilio integration** for sending/receiving SMS
- **File-based storage**: 
  - `conversations.json` (rebuilt from Twilio on startup)
  - `customers.json` (phone → name mapping, persisted)
  - `settings.json` (Twilio config, owner phone number)

#### Twilio Configuration
Twilio credentials are configured via environment variables for security.

#### UI Layout Requirements
- **Left sidebar**: Contact list (customer names + phone numbers)
- **Right panel**: Chat interface for selected conversation
- **Send form**: Phone number field + Customer name field + Message area
- **Auto-save**: When sending message, save phone→name mapping
- **Real-time**: New messages appear instantly via WebSocket

### 4. Workflow Requirements

#### Sending Messages
1. User enters phone number, customer name, and message
2. Send via Twilio API
3. Save phone→name mapping to customers.json
4. Update conversations.json locally
5. Broadcast to connected clients via WebSocket

#### Receiving Messages
1. Twilio webhook receives incoming message
2. Save to conversations.json
3. Forward raw message to owner's cell phone via Twilio
4. Broadcast to connected clients via WebSocket

#### Startup Process
1. Load settings.json and customers.json
2. Fetch recent messages from Twilio API (last 1000 messages)
3. Rebuild conversations.json from Twilio data
4. Start server and WebSocket listeners

### 5. Deployment Requirements
- **Platform**: Render (free tier)
- **Domain**: Will be connected to user's domain
- **Keep-alive**: Include ping endpoint for UptimeRobot
- **File persistence**: JSON files are ephemeral on Render but conversations rebuild from Twilio

### 6. File Structure Needed
```
/project
├── server.js (main Express server)
├── public/
│   ├── index.html (dashboard interface)
│   ├── style.css
│   └── client.js (WebSocket client code)
├── data/
│   ├── conversations.json
│   ├── customers.json
│   └── settings.json
├── package.json
└── README.md
```

### 7. API Endpoints Needed
- `GET /` - Serve dashboard interface
- `POST /send-message` - Send SMS via Twilio
- `POST /webhook` - Receive Twilio incoming messages
- `GET /conversations` - Get all conversations
- `GET /customers` - Get customer name mappings
- `POST /customers` - Save customer name mapping
- `GET /ping` - Keep-alive endpoint for UptimeRobot

### 8. Environment Variables for Render
```
TWILIO_ACCOUNT_SID=[your_twilio_account_sid]
TWILIO_AUTH_TOKEN=[your_twilio_auth_token]
TWILIO_FROM_NUMBER=[your_twilio_phone_number]
OWNER_PHONE_NUMBER=[owner_phone_for_forwarding]
PORT=3000
```

### 9. Key Features from Existing File to Preserve
- Default message template: "Hi, this is Cris from In Your Vase Flowers. We have flowers for [Name] to deliver. Please confirm: 1) Is your address [Address] correct? 2) What time works best for delivery today? Reply here or call 250-562-8273. Thanks!"
- Conversation grouping by phone number
- Message direction indicators (incoming vs outgoing)
- Clean, professional UI styling

### 10. Next Steps for Implementation
1. Set up basic Express server with Twilio integration
2. Create file-based storage system
3. Implement Twilio message fetching on startup
4. Build WebSocket real-time functionality
5. Create iPad-style dashboard interface
6. Add webhook handling for incoming messages
7. Implement SMS forwarding to owner
8. Test and deploy to Render

## Priority Order
1. **Server setup** with Twilio integration
2. **File storage** and startup data loading
3. **Basic UI** with send/receive functionality
4. **WebSocket** real-time updates
5. **Customer management** (name mapping)
6. **SMS forwarding** to owner
7. **Polish UI** to iPad Messages style

This is a temporary solution until integration with a larger POS system, so prioritize functionality over perfect architecture.