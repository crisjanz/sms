class SMSDashboard {
    constructor() {
        this.socket = io();
        this.conversations = {};
        this.customers = {};
        this.currentConversation = null;
        this.defaultMessage = '';
        
        this.initializeElements();
        this.bindEvents();
        this.loadData();
    }
    
    initializeElements() {
        this.conversationsList = document.getElementById('conversationsList');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.chatHeader = document.getElementById('chatHeader');
        this.phoneNumberInput = document.getElementById('phoneNumber');
        this.customerNameInput = document.getElementById('customerName');
        this.messageTextarea = document.getElementById('messageText');
        this.sendButton = document.getElementById('sendButton');
        this.defaultMessageButton = document.getElementById('defaultMessageButton');
    }
    
    bindEvents() {
        // Send message
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.messageTextarea.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Default message
        this.defaultMessageButton.addEventListener('click', () => this.useDefaultMessage());
        
        // Phone number input formatting
        this.phoneNumberInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length >= 10) {
                if (!value.startsWith('1')) {
                    value = '1' + value;
                }
                e.target.value = '+' + value;
            }
        });
        
        // Socket events
        this.socket.on('new-message', (data) => {
            this.handleNewMessage(data);
        });
    }
    
    async loadData() {
        try {
            // Load conversations
            const conversationsResponse = await fetch('/conversations');
            this.conversations = await conversationsResponse.json();
            
            // Load customers
            const customersResponse = await fetch('/customers');
            this.customers = await customersResponse.json();
            
            // Load default message (from settings)
            this.defaultMessage = "Hi, this is Cris from In Your Vase Flowers. We have flowers for [Name] to deliver. Please confirm: 1) Is your address [Address] correct? 2) What time works best for delivery today? Reply here or call 250-562-8273. Thanks!";
            
            this.renderConversations();
            
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }
    
    renderConversations() {
        this.conversationsList.innerHTML = '';
        
        if (Object.keys(this.conversations).length === 0) {
            this.conversationsList.innerHTML = '<div class="empty-state">No conversations yet</div>';
            return;
        }
        
        // Sort conversations by most recent message
        const sortedPhoneNumbers = Object.keys(this.conversations).sort((a, b) => {
            const lastMessageA = this.conversations[a][this.conversations[a].length - 1];
            const lastMessageB = this.conversations[b][this.conversations[b].length - 1];
            return new Date(lastMessageB.timestamp) - new Date(lastMessageA.timestamp);
        });
        
        sortedPhoneNumbers.forEach(phoneNumber => {
            const conversation = this.conversations[phoneNumber];
            const lastMessage = conversation[conversation.length - 1];
            const customerName = this.customers[phoneNumber] || 'Unknown';
            
            const conversationElement = document.createElement('div');
            conversationElement.className = 'conversation-item';
            conversationElement.dataset.phoneNumber = phoneNumber;
            
            conversationElement.innerHTML = `
                <div class="conversation-name">${customerName}</div>
                <div class="conversation-phone">${phoneNumber}</div>
                <div class="conversation-preview">${lastMessage.body}</div>
            `;
            
            conversationElement.addEventListener('click', () => {
                this.selectConversation(phoneNumber);
            });
            
            this.conversationsList.appendChild(conversationElement);
        });
    }
    
    selectConversation(phoneNumber) {
        // Update active conversation in sidebar
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-phone-number="${phoneNumber}"]`).classList.add('active');
        
        // Set current conversation
        this.currentConversation = phoneNumber;
        
        // Update chat header
        const customerName = this.customers[phoneNumber] || 'Unknown';
        this.chatHeader.innerHTML = `<h4>${customerName} (${phoneNumber})</h4>`;
        
        // Pre-fill phone number and customer name
        this.phoneNumberInput.value = phoneNumber;
        this.customerNameInput.value = this.customers[phoneNumber] || '';
        
        // Render messages
        this.renderMessages(phoneNumber);
    }
    
    renderMessages(phoneNumber) {
        this.messagesContainer.innerHTML = '';
        
        if (!this.conversations[phoneNumber]) {
            this.messagesContainer.innerHTML = '<div class="empty-state">No messages in this conversation</div>';
            return;
        }
        
        const messages = this.conversations[phoneNumber];
        
        messages.forEach(message => {
            const messageElement = document.createElement('div');
            messageElement.className = `message ${message.direction === 'outbound' ? 'outbound' : 'inbound'}`;
            
            const timeString = new Date(message.timestamp).toLocaleString();
            
            messageElement.innerHTML = `
                <div class="message-bubble">${message.body}</div>
                <div class="message-time">${timeString}</div>
            `;
            
            this.messagesContainer.appendChild(messageElement);
        });
        
        // Scroll to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
    
    async sendMessage() {
        const phoneNumber = this.phoneNumberInput.value.trim();
        const customerName = this.customerNameInput.value.trim();
        const message = this.messageTextarea.value.trim();
        
        if (!phoneNumber || !message) {
            alert('Please enter both phone number and message');
            return;
        }
        
        // Disable send button
        this.sendButton.disabled = true;
        this.sendButton.textContent = 'Sending...';
        
        try {
            const response = await fetch('/send-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: phoneNumber,
                    message: message,
                    customerName: customerName
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Clear message textarea
                this.messageTextarea.value = '';
                
                // Update customer name if provided
                if (customerName) {
                    this.customers[phoneNumber] = customerName;
                }
                
                // The message will be added via socket event
            } else {
                alert('Error sending message: ' + (result.error || 'Unknown error'));
            }
            
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Error sending message: ' + error.message);
        } finally {
            // Re-enable send button
            this.sendButton.disabled = false;
            this.sendButton.textContent = 'Send';
        }
    }
    
    useDefaultMessage() {
        this.messageTextarea.value = this.defaultMessage;
        this.messageTextarea.focus();
    }
    
    handleNewMessage(data) {
        const { phoneNumber, message } = data;
        
        // Add message to conversations
        if (!this.conversations[phoneNumber]) {
            this.conversations[phoneNumber] = [];
        }
        this.conversations[phoneNumber].push(message);
        
        // Re-render conversations list
        this.renderConversations();
        
        // If this conversation is currently selected, update messages
        if (this.currentConversation === phoneNumber) {
            this.renderMessages(phoneNumber);
        }
        
        // If it's a new conversation, automatically select it
        if (this.conversations[phoneNumber].length === 1) {
            this.selectConversation(phoneNumber);
        }
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    new SMSDashboard();
});