class SMSDashboard {
    constructor() {
        this.socket = io();
        this.conversations = {};
        this.customers = {};
        this.currentConversation = null;
        this.defaultMessage = '';
        this.unreadConversations = new Set();
        
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
        this.newConversationButton = document.getElementById('newConversationButton');
        this.exportButton = document.getElementById('exportButton');
        this.importButton = document.getElementById('importButton');
        this.importFile = document.getElementById('importFile');
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
        
        // New conversation
        this.newConversationButton.addEventListener('click', () => this.startNewConversation());
        
        // Export/Import database
        this.exportButton.addEventListener('click', () => this.exportDatabase());
        this.importButton.addEventListener('click', () => this.importFile.click());
        this.importFile.addEventListener('change', (e) => this.importDatabase(e));
        
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
        
        this.socket.on('conversation-deleted', (data) => {
            this.handleConversationDeleted(data);
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
            
            const isUnread = this.unreadConversations.has(phoneNumber);
            
            conversationElement.innerHTML = `
                <div class="unread-indicator ${isUnread ? '' : 'hidden'}"></div>
                <div class="conversation-content">
                    <div class="conversation-name">${customerName}</div>
                    <div class="conversation-phone">${phoneNumber}</div>
                    <div class="conversation-preview">${lastMessage.body}</div>
                </div>
                <div class="conversation-actions">
                    <button class="delete-button" data-phone="${phoneNumber}" title="Delete conversation">×</button>
                </div>
            `;
            
            conversationElement.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-button')) {
                    e.stopPropagation();
                    this.deleteConversation(phoneNumber);
                } else {
                    this.selectConversation(phoneNumber);
                }
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
        
        // Mark as read
        this.unreadConversations.delete(phoneNumber);
        this.updateUnreadIndicator(phoneNumber);
        
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
            const isOutbound = message.direction === 'outbound';
            const messageElement = document.createElement('div');
            messageElement.className = `message ${isOutbound ? 'outbound' : 'inbound'}`;
            
            const timeString = new Date(message.timestamp).toLocaleString();
            const senderLabel = isOutbound ? 'You' : (this.customers[phoneNumber] || phoneNumber);
            
            messageElement.innerHTML = `
                <div class="message-sender">${senderLabel}</div>
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
        const customerName = this.customerNameInput.value.trim();
        let message = this.defaultMessage;
        
        // Replace [Name] placeholder with actual customer name
        if (customerName) {
            message = message.replace(/\[Name\]/g, customerName);
        }
        
        this.messageTextarea.value = message;
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
        
        // Mark as unread if not current conversation
        if (this.currentConversation !== phoneNumber && message.direction === 'inbound') {
            this.unreadConversations.add(phoneNumber);
        }
        
        // If it's a new conversation, automatically select it
        if (this.conversations[phoneNumber].length === 1) {
            this.selectConversation(phoneNumber);
        }
    }
    
    async deleteConversation(phoneNumber) {
        if (!confirm(`Delete conversation with ${this.customers[phoneNumber] || phoneNumber}?`)) {
            return;
        }
        
        try {
            const response = await fetch(`/conversations/${encodeURIComponent(phoneNumber)}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Remove from local data
                delete this.conversations[phoneNumber];
                this.unreadConversations.delete(phoneNumber);
                
                // Clear current conversation if it was deleted
                if (this.currentConversation === phoneNumber) {
                    this.currentConversation = null;
                    this.chatHeader.innerHTML = '<h4>Select a conversation or send a new message</h4>';
                    this.messagesContainer.innerHTML = '';
                    this.phoneNumberInput.value = '';
                    this.customerNameInput.value = '';
                }
                
                // Re-render conversations
                this.renderConversations();
            } else {
                alert('Error deleting conversation: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error deleting conversation:', error);
            alert('Error deleting conversation: ' + error.message);
        }
    }
    
    handleConversationDeleted(data) {
        const { phoneNumber } = data;
        
        // Remove from local data
        delete this.conversations[phoneNumber];
        this.unreadConversations.delete(phoneNumber);
        
        // Clear current conversation if it was deleted
        if (this.currentConversation === phoneNumber) {
            this.currentConversation = null;
            this.chatHeader.innerHTML = '<h4>Select a conversation or send a new message</h4>';
            this.messagesContainer.innerHTML = '';
            this.phoneNumberInput.value = '';
            this.customerNameInput.value = '';
        }
        
        // Re-render conversations
        this.renderConversations();
    }
    
    updateUnreadIndicator(phoneNumber) {
        const conversationElement = document.querySelector(`[data-phone-number="${phoneNumber}"]`);
        if (conversationElement) {
            const indicator = conversationElement.querySelector('.unread-indicator');
            if (indicator) {
                indicator.classList.toggle('hidden', !this.unreadConversations.has(phoneNumber));
            }
        }
    }
    
    startNewConversation() {
        // Clear current conversation selection
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
        });
        
        this.currentConversation = null;
        
        // Clear and focus form
        this.phoneNumberInput.value = '';
        this.customerNameInput.value = '';
        this.messageTextarea.value = '';
        
        // Update chat header
        this.chatHeader.innerHTML = '<h4>New Conversation</h4>';
        
        // Clear messages
        this.messagesContainer.innerHTML = '<div class="empty-state">Enter a phone number and message to start a new conversation</div>';
        
        // Focus phone number input
        this.phoneNumberInput.focus();
    }
    
    async exportDatabase() {
        try {
            // Create a link element and trigger download
            const link = document.createElement('a');
            link.href = '/export-customers';
            link.download = `sms-customers-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            console.log('Database exported successfully');
        } catch (error) {
            console.error('Error exporting database:', error);
            alert('Error exporting database: ' + error.message);
        }
    }
    
    async importDatabase(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const importedData = JSON.parse(text);
            
            const response = await fetch('/import-customers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(importedData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                alert(`Successfully imported ${result.imported} customers. Total: ${result.total} customers.`);
                
                // Reload customers data
                const customersResponse = await fetch('/customers');
                this.customers = await customersResponse.json();
                
                // Re-render conversations to show updated names
                this.renderConversations();
            } else {
                alert('Error importing database: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error importing database:', error);
            alert('Error importing database: ' + error.message);
        } finally {
            // Clear file input
            event.target.value = '';
        }
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    new SMSDashboard();
});