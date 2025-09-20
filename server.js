const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const twilio = require('twilio');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static('public'));

// Data file paths
const DATA_DIR = path.join(__dirname, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const CONVERSATIONS_FILE = path.join(DATA_DIR, 'conversations.json');

// Global variables
let settings = {};
let customers = {};
let conversations = {};
let twilioClient = null;

// Initialize app
async function initializeApp() {
  try {
    // Load settings
    const settingsData = await fs.readFile(SETTINGS_FILE, 'utf8');
    settings = JSON.parse(settingsData);
    
    // Initialize Twilio client
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    
    // Load customers
    try {
      const customersData = await fs.readFile(CUSTOMERS_FILE, 'utf8');
      customers = JSON.parse(customersData);
    } catch (error) {
      customers = {};
    }
    
    // Load conversations from Twilio
    await loadConversationsFromTwilio();
    
    console.log('App initialized successfully');
  } catch (error) {
    console.error('Error initializing app:', error);
  }
}

// Load recent messages from Twilio
async function loadConversationsFromTwilio() {
  try {
    console.log('Loading conversations from Twilio...');
    const messages = await twilioClient.messages.list({ limit: 1000 });
    
    conversations = {};
    
    const twilioFromNumber = process.env.TWILIO_FROM_NUMBER;
    
    messages.forEach(message => {
      // Determine if message is outbound (from our Twilio number) or inbound (to our Twilio number)
      const isOutbound = message.from === twilioFromNumber;
      const phoneNumber = isOutbound ? message.to : message.from;
      
      if (!conversations[phoneNumber]) {
        conversations[phoneNumber] = [];
      }
      
      conversations[phoneNumber].push({
        id: message.sid,
        from: message.from,
        to: message.to,
        body: message.body,
        direction: isOutbound ? 'outbound' : 'inbound',
        timestamp: message.dateCreated,
        status: message.status
      });
    });
    
    // Sort messages by timestamp for each conversation
    Object.keys(conversations).forEach(phoneNumber => {
      conversations[phoneNumber].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    });
    
    // Save to file
    await fs.writeFile(CONVERSATIONS_FILE, JSON.stringify(conversations, null, 2));
    console.log(`Loaded ${messages.length} messages for ${Object.keys(conversations).length} conversations`);
    
  } catch (error) {
    console.error('Error loading conversations from Twilio:', error);
    // Try to load from local file if Twilio fails
    try {
      const conversationsData = await fs.readFile(CONVERSATIONS_FILE, 'utf8');
      conversations = JSON.parse(conversationsData);
    } catch (fileError) {
      conversations = {};
    }
  }
}

// API Routes

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get conversations
app.get('/conversations', (req, res) => {
  res.json(conversations);
});

// Get customers
app.get('/customers', (req, res) => {
  res.json(customers);
});

// Save customer mapping
app.post('/customers', async (req, res) => {
  try {
    const { phoneNumber, name } = req.body;
    customers[phoneNumber] = name;
    await fs.writeFile(CUSTOMERS_FILE, JSON.stringify(customers, null, 2));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete conversation
app.delete('/conversations/:phoneNumber', async (req, res) => {
  try {
    const phoneNumber = decodeURIComponent(req.params.phoneNumber);
    
    if (conversations[phoneNumber]) {
      delete conversations[phoneNumber];
      await fs.writeFile(CONVERSATIONS_FILE, JSON.stringify(conversations, null, 2));
      
      // Broadcast deletion to connected clients
      io.emit('conversation-deleted', { phoneNumber });
      
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Conversation not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send message
app.post('/send-message', async (req, res) => {
  try {
    const { to, message, customerName } = req.body;
    
    // Send via Twilio
    const twilioMessage = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_FROM_NUMBER,
      to: to
    });
    
    // Save customer name if provided
    if (customerName) {
      customers[to] = customerName;
      await fs.writeFile(CUSTOMERS_FILE, JSON.stringify(customers, null, 2));
    }
    
    // Add to conversations
    if (!conversations[to]) {
      conversations[to] = [];
    }
    
    const messageData = {
      id: twilioMessage.sid,
      from: twilioMessage.from,
      to: twilioMessage.to,
      body: twilioMessage.body,
      direction: 'outbound',
      timestamp: new Date(),
      status: twilioMessage.status
    };
    
    conversations[to].push(messageData);
    await fs.writeFile(CONVERSATIONS_FILE, JSON.stringify(conversations, null, 2));
    
    // Broadcast to connected clients
    io.emit('new-message', { phoneNumber: to, message: messageData });
    
    res.json({ success: true, message: messageData });
    
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
});

// Twilio webhook for incoming messages
app.post('/webhook', async (req, res) => {
  try {
    console.log('Webhook received:', req.body);
    const { From, To, Body, MessageSid } = req.body;
    
    console.log('Incoming message:', { From, To, Body, MessageSid });
    
    // Add to conversations
    if (!conversations[From]) {
      conversations[From] = [];
    }
    
    const messageData = {
      id: MessageSid,
      from: From,
      to: To,
      body: Body,
      direction: 'inbound',
      timestamp: new Date(),
      status: 'received'
    };
    
    conversations[From].push(messageData);
    await fs.writeFile(CONVERSATIONS_FILE, JSON.stringify(conversations, null, 2));
    
    // Forward to owner if configured
    const ownerPhone = process.env.OWNER_PHONE_NUMBER || settings.ownerPhoneNumber;
    if (ownerPhone) {
      const customerName = customers[From] || From;
      const forwardMessage = `SMS from ${customerName}: ${Body}`;
      
      await twilioClient.messages.create({
        body: forwardMessage,
        from: process.env.TWILIO_FROM_NUMBER,
        to: ownerPhone
      });
    }
    
    // Broadcast to connected clients
    io.emit('new-message', { phoneNumber: From, message: messageData });
    
    // Return proper TwiML response (required for Twilio webhooks)
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.type('text/xml');
    res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

// Export customers database
app.get('/export-customers', (req, res) => {
  try {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `sms-customers-${timestamp}.json`;
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(customers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import customers database
app.post('/import-customers', async (req, res) => {
  try {
    const importedCustomers = req.body;
    
    // Validate format
    if (typeof importedCustomers !== 'object' || importedCustomers === null) {
      return res.status(400).json({ error: 'Invalid file format' });
    }
    
    // Merge with existing customers
    Object.assign(customers, importedCustomers);
    
    // Save to file
    await fs.writeFile(CUSTOMERS_FILE, JSON.stringify(customers, null, 2));
    
    res.json({ 
      success: true, 
      imported: Object.keys(importedCustomers).length,
      total: Object.keys(customers).length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test webhook endpoint
app.get('/webhook', (req, res) => {
  res.json({ 
    status: 'webhook endpoint active', 
    timestamp: new Date(),
    message: 'Use POST method for Twilio webhooks'
  });
});

// Ping endpoint for uptime monitoring
app.get('/ping', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
async function startServer() {
  await initializeApp();
  
  server.listen(PORT, () => {
    console.log(`SMS Dashboard server running on port ${PORT}`);
  });
}

startServer();