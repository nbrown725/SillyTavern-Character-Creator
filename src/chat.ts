import { globalContext } from "./generate.js";
import { SessionService } from './services/sessionService.js';
import { ChatController } from './controllers/chatController.js';
import { ChatMessage } from './types.js';

// Remove duplicate ChatMessage interface - using the one from types.ts
// Remove ChatSession - using unified session storage

// Use the unified session service and chat controller
const sessionService = SessionService.getInstance();
const chatController = ChatController.getInstance();
let chatContainer: JQuery | null = null;
let pendingInlineImageDataUrl: string | null = null;

export function initializeChat(): void {
    setupChatEventHandlers();
}

export async function loadChatUI(): Promise<void> {
    const chatContainerElement = $('#charCreator_chatContainer');

    try {
        const chatHtml = await globalContext.renderExtensionTemplateAsync(
            'third-party/SillyTavern-Character-Creator-Chat',
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

// Removed separate chat session functions - using unified sessionService

function setupChatEventHandlers(): void {
    $(document).on('click', '.tab-button[data-tab="charCreator_chatContainer"]', function () {
        if (!chatContainer) {
            loadChatUI();
        }
    });
}

function bindChatEvents(): void {
    $('#send_message').on('click', sendMessage);

    $('#chat_input').on('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    $('#clear_chat').on('click', clearChat);
    $('#export_chat').on('click', exportChat);
    
    // Bind edit/delete message events using event delegation
    $('#chat_messages').on('click', '.edit-message-btn', function() {
        const messageElement = $(this).closest('.chat-message');
        const messageId = messageElement.attr('data-message-id');
        if (messageId) {
            startEditMessage(messageId);
        }
    });
    
    $('#chat_messages').on('click', '.delete-message-btn', function() {
        const messageElement = $(this).closest('.chat-message');
        const messageId = messageElement.attr('data-message-id');
        if (messageId) {
            deleteMessage(messageId);
        }
    });
    
    $('#chat_messages').on('click', '.save-edit-btn', function() {
        const messageElement = $(this).closest('.chat-message');
        const messageId = messageElement.attr('data-message-id');
        if (messageId) {
            saveEditMessage(messageId);
        }
    });
    
    $('#chat_messages').on('click', '.cancel-edit-btn', function() {
        const messageElement = $(this).closest('.chat-message');
        const messageId = messageElement.attr('data-message-id');
        if (messageId) {
            cancelEditMessage(messageId);
        }
    });

    // Image attach UI
    $('#attach_image').on('click', function () {
        const input = document.getElementById('chat_image_input') as HTMLInputElement | null;
        input?.click();
    });
    $('#chat_image_input').on('change', async function (e) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        
        try {
            pendingInlineImageDataUrl = await chatController.processImageFile(file);
            const previewEl = $('#chat_image_preview');
            previewEl.attr('src', pendingInlineImageDataUrl || '');
            previewEl.closest('.chat-image-preview-container').show();
        } catch (error) {
            console.error('Failed to process image:', error);
            alert(error instanceof Error ? error.message : 'Failed to process image file.');
            input.value = '';
        }
    });
    $('#clear_image').on('click', function () {
        pendingInlineImageDataUrl = null;
        const fileInput = document.getElementById('chat_image_input') as HTMLInputElement | null;
        if (fileInput) fileInput.value = '';
        const previewEl = $('#chat_image_preview');
        previewEl.attr('src', '');
        previewEl.closest('.chat-image-preview-container').hide();
    });
}

async function sendMessage(): Promise<void> {
    const input = $('#chat_input');
    const message = input.val()?.toString().trim();

    if (!message) return;

    const sendButton = $('#send_message');
    sendButton.prop('disabled', true);
    input.prop('disabled', true);

    try {
		// Capture current image before clearing UI
		const imageUrlForSend = pendingInlineImageDataUrl ?? undefined;

		        // Create and render user message immediately
        const userMessage = await chatController.createAndStoreUserMessage({
            content: message,
            imageUrl: imageUrlForSend,
        });
        renderMessage(userMessage);
        scrollToBottom();

		// Clear input and image preview immediately
		input.val('');
		resetImagePreview();

        // Kick off AI response
		const aiMessage = await chatController.generateAndStoreAiResponse({
			content: message,
			imageUrl: imageUrlForSend,
		});
        renderMessage(aiMessage);
        scrollToBottom();
    } catch (error) {
        console.error('Failed to generate response:', error);
        alert('Failed to generate response. Please check your connection settings.');
    } finally {
        sendButton.prop('disabled', false);
        input.prop('disabled', false);
        input.focus();
    }
}

function resetImagePreview(): void {
    pendingInlineImageDataUrl = null;
    const fileInput = document.getElementById('chat_image_input') as HTMLInputElement | null;
    if (fileInput) fileInput.value = '';
    const previewEl = $('#chat_image_preview');
    previewEl.attr('src', '');
    previewEl.closest('.chat-image-preview-container').hide();
}


// Removed addMessageToChat - messages are now handled by ChatController

function renderMessage(message: ChatMessage): void {
    const template = $('#chat_message_template')[0] as HTMLTemplateElement;
    const clonedContent = template.content.cloneNode(true) as DocumentFragment;
    const messageElement = $(clonedContent.querySelector('.chat-message')!);

    messageElement.attr('data-message-id', message.id);
    messageElement.addClass(`message-${message.role}`);
    messageElement.find('.message-role').text(message.role === 'user' ? 'You' : 'AI');
    messageElement.find('.message-timestamp').text(formatTimestamp(message.timestamp));
    const container = messageElement.find('.message-content');
    container.html(formatMessageContent(message.content));
    if (message.inlineImageUrl) {
        const imageHtml = chatController.createImagePreviewHtml(message.inlineImageUrl);
        container.append($(imageHtml));
    }

    $('#chat_messages').append(messageElement);
}

function renderChatHistory(): void {
    $('#chat_messages').empty();
    const messages = chatController.getChatMessages();
    messages.forEach(message => renderMessage(message));
    scrollToBottom();
}

function scrollToBottom(): void {
    const messagesContainer = $('#chat_messages')[0];
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

async function clearChat(): Promise<void> {
    if (!confirm('Are you sure you want to clear the chat history?')) return;

    try {
        await chatController.clearChat();
        $('#chat_messages').empty();
    } catch (error) {
        console.error('Failed to clear chat:', error);
        alert('Failed to clear chat history.');
    }
}

function exportChat(): void {
    try {
        const exportData = chatController.exportChat();
        if (exportData.messages.length === 0) {
            alert('No chat history to export');
            return;
        }

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `character-chat-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Failed to export chat:', error);
        alert('Failed to export chat history.');
    }
}

function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Removed generateId - now handled by ChatController

function startEditMessage(messageId: string): void {
    const messages = chatController.getChatMessages();
    const message = messages.find(m => m.id === messageId);
    if (!message) return;
    
    const messageElement = $(`.chat-message[data-message-id="${messageId}"]`);
    const contentElement = messageElement.find('.message-content');
    const editContainer = messageElement.find('.message-edit-container');
    const editTextarea = editContainer.find('.message-edit-textarea');
    
    // Show edit container and hide content
    contentElement.hide();
    editContainer.show();
    editTextarea.val(message.content).focus();
    
    // Auto-resize textarea
    editTextarea.css('height', 'auto');
    editTextarea.css('height', editTextarea[0].scrollHeight + 'px');
}

async function saveEditMessage(messageId: string): Promise<void> {
    const messageElement = $(`.chat-message[data-message-id="${messageId}"]`);
    const editContainer = messageElement.find('.message-edit-container');
    const editTextarea = editContainer.find('.message-edit-textarea');
    const newContent = editTextarea.val()?.toString().trim();
    
    if (!newContent) {
        alert('Message cannot be empty');
        return;
    }
    
    try {
        // Find message index by ID
        const messages = chatController.getChatMessages();
        const messageIndex = messages.findIndex(m => m.id === messageId);
        if (messageIndex !== -1) {
            await chatController.editMessage({ messageIndex, newContent });
            
            // Update UI
            const contentElement = messageElement.find('.message-content');
            contentElement.html(formatMessageContent(newContent));
            contentElement.show();
            editContainer.hide();
        }
    } catch (error) {
        console.error('Failed to edit message:', error);
        alert('Failed to edit message.');
    }
}

function cancelEditMessage(messageId: string): void {
    const messageElement = $(`.chat-message[data-message-id="${messageId}"]`);
    const contentElement = messageElement.find('.message-content');
    const editContainer = messageElement.find('.message-edit-container');
    
    contentElement.show();
    editContainer.hide();
}

async function deleteMessage(messageId: string): Promise<void> {
    if (!confirm('Are you sure you want to delete this message?')) return;
    
    try {
        // IDs are aligned to session indices; parse directly for robustness
        const messageIndex = parseInt(messageId, 10);
        if (messageIndex !== -1) {
            await chatController.deleteMessage(messageIndex);
            
            // Remove from UI with animation
            const messageElement = $(`.chat-message[data-message-id="${messageId}"]`);
            messageElement.fadeOut(200, function() {
                $(this).remove();
            });
        }
    } catch (error) {
        console.error('Failed to delete message:', error);
        alert('Failed to delete message.');
    }
}

function formatMessageContent(content: string): string {
    // Basic markdown-style formatting
    let formatted = content;
    
    // Escape HTML first
    formatted = $('<div>').text(formatted).html();
    
    // Convert markdown-style formatting
    // Bold: **text** or __text__
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/__(.+?)__/g, '<strong>$1</strong>');
    
    // Italic: *text* or _text_
    formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/_(.+?)_/g, '<em>$1</em>');
    
    // Code blocks: ```code```
    formatted = formatted.replace(/```(.+?)```/gs, '<pre><code>$1</code></pre>');
    
    // Inline code: `code`
    formatted = formatted.replace(/`(.+?)`/g, '<code>$1</code>');
    
    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Lists (basic support)
    formatted = formatted.replace(/^- (.+)$/gm, '• $1');
    formatted = formatted.replace(/^\* (.+)$/gm, '• $1');
    formatted = formatted.replace(/^\d+\. (.+)$/gm, '$&');
    
    return formatted;
}

// Removed updateCreatorChatHistory - no longer needed with unified session

export function getChatMessagesForUI(): ChatMessage[] {
    return chatController.getChatMessages();
}

export function formatChatAsContext(): string {
    const messages = chatController.getChatMessages();
    if (messages.length === 0) return '';

    const header = "=== Character Brainstorming Chat ===\n\n";
    const messageStrings = messages.map(msg =>
        `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`
    ).join('\n\n');

    return header + messageStrings + '\n\n=== End of Chat ===\n';
}