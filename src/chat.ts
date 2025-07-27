import { globalContext } from "./generate.js";
import { settingsManager } from "./settings.js";
import { ExtractedData } from 'sillytavern-utils-lib/types';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export interface ChatSession {
    id: string;
    messages: ChatMessage[];
    createdAt: number;
    lastModified: number;
}

const CHAT_STORAGE_KEY = 'character_creator_chat_session';
let currentSession: ChatSession | null = null;
let chatContainer: JQuery | null = null;

export function initializeChat(): void {
    loadChatSession();
    setupChatEventHandlers();
}

export async function loadChatUI(): Promise<void> {
    const chatContainerElement = $('#charCreator_chatContainer');
    
    try {
        const chatHtml = await globalContext.renderExtensionTemplateAsync(
            'third-party/SillyTavern-Character-Creator',
            'templates/chat'
        );
        
        chatContainerElement.html(chatHtml);
        chatContainer = $('#chat_container');
        chatContainer.show();
        
        bindChatEvents();
        renderChatHistory();
    } catch (error) {
        console.error('Failed to load chat template:', error);
        chatContainerElement.html('<div class="error">Failed to load chat interface</div>');
    }
}

function loadChatSession(): void {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    if (stored) {
        try {
            currentSession = JSON.parse(stored);
        } catch (e) {
            console.error('Failed to parse chat session:', e);
            createNewSession();
        }
    } else {
        createNewSession();
    }
}

function createNewSession(): void {
    currentSession = {
        id: generateId(),
        messages: [],
        createdAt: Date.now(),
        lastModified: Date.now()
    };
    saveChatSession();
}

function saveChatSession(): void {
    if (currentSession) {
        currentSession.lastModified = Date.now();
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(currentSession));
    }
}

function setupChatEventHandlers(): void {
    $(document).on('click', '.tab-button[data-tab="charCreator_chatContainer"]', function() {
        if (!chatContainer) {
            loadChatUI();
        }
    });
}

function bindChatEvents(): void {
    $('#send_message').on('click', sendMessage);
    
    $('#chat_input').on('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    $('#clear_chat').on('click', clearChat);
    $('#export_chat').on('click', exportChat);
}

async function sendMessage(): Promise<void> {
    const input = $('#chat_input');
    const message = input.val()?.toString().trim();
    
    if (!message) return;
    
    const sendButton = $('#send_message');
    sendButton.prop('disabled', true);
    input.prop('disabled', true);
    
    const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: message,
        timestamp: Date.now()
    };
    
    addMessageToChat(userMessage);
    input.val('');
    
    try {
        const response = await generateChatResponse(message);
        
        const assistantMessage: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: response,
            timestamp: Date.now()
        };
        
        addMessageToChat(assistantMessage);
    } catch (error) {
        console.error('Failed to generate response:', error);
        alert('Failed to generate response. Please check your connection settings.');
    } finally {
        sendButton.prop('disabled', false);
        input.prop('disabled', false);
        input.focus();
    }
}

async function generateChatResponse(userMessage: string): Promise<string> {
    const settings = settingsManager.getSettings();
    
    if (!settings.profileId) {
        throw new Error('No connection profile selected');
    }
    
    const chatContext = getChatContext();
    
    const messages = [
        {
            role: 'system' as const,
            content: chatContext
        },
        {
            role: 'user' as const,
            content: userMessage
        }
    ];
    
    try {
        const response = await globalContext.ConnectionManagerRequestService.sendRequest(
            settings.profileId,
            messages,
            settings.maxResponseToken || 2048
        ) as ExtractedData;
        
        return response.content || '';
    } catch (error) {
        console.error('Chat API error:', error);
        throw error;
    }
}

function getChatContext(): string {
    if (!currentSession || currentSession.messages.length === 0) {
        return "You are helping brainstorm and develop a character for a roleplay scenario. Be creative and helpful.";
    }
    
    const context = "You are helping brainstorm and develop a character for a roleplay scenario. Here is our conversation so far:\n\n";
    
    const recentMessages = currentSession.messages.slice(-10);
    
    const conversation = recentMessages.map(msg => 
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
    ).join('\n\n');
    
    return context + conversation;
}

function addMessageToChat(message: ChatMessage): void {
    if (!currentSession) return;
    
    currentSession.messages.push(message);
    saveChatSession();
    renderMessage(message);
    scrollToBottom();
}

function renderMessage(message: ChatMessage): void {
    const template = $('#chat_message_template')[0] as HTMLTemplateElement;
    const clonedContent = template.content.cloneNode(true) as DocumentFragment;
    const messageElement = $(clonedContent.querySelector('.chat-message')!);
    
    messageElement.addClass(`message-${message.role}`);
    messageElement.find('.message-role').text(message.role === 'user' ? 'You' : 'AI');
    messageElement.find('.message-timestamp').text(formatTimestamp(message.timestamp));
    messageElement.find('.message-content').text(message.content);
    
    $('#chat_messages').append(messageElement);
}

function renderChatHistory(): void {
    if (!currentSession) return;
    
    $('#chat_messages').empty();
    currentSession.messages.forEach(message => renderMessage(message));
    scrollToBottom();
}

function scrollToBottom(): void {
    const messagesContainer = $('#chat_messages')[0];
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

function clearChat(): void {
    if (!confirm('Are you sure you want to clear the chat history?')) return;
    
    createNewSession();
    $('#chat_messages').empty();
}

function exportChat(): void {
    if (!currentSession || currentSession.messages.length === 0) {
        alert('No chat history to export');
        return;
    }
    
    const exportData = {
        session: currentSession,
        exportedAt: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `character-chat-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function getChatSession(): ChatSession | null {
    return currentSession;
}

export function formatChatAsContext(session: ChatSession): string {
    if (!session || session.messages.length === 0) return '';
    
    const header = "=== Character Brainstorming Chat ===\n\n";
    const messages = session.messages.map(msg => 
        `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`
    ).join('\n\n');
    
    return header + messages + '\n\n=== End of Chat ===\n';
}