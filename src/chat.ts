import { globalContext, runCharacterFieldGeneration, CHARACTER_FIELDS, CHARACTER_LABELS } from "./generate.js";
import { settingsManager } from "./settings.js";
import { ExtractedData } from 'sillytavern-utils-lib/types';
import { selected_group, this_chid, world_names } from 'sillytavern-utils-lib/config';
import { SessionService } from './services/sessionService.js';
import { ChatMessage, ContentPart } from './types.js';

// Remove duplicate ChatMessage interface - using the one from types.ts
// Remove ChatSession - using unified session storage

// Use the unified session service
const sessionService = SessionService.getInstance();
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
    $('#chat_image_input').on('change', function (e) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file.');
            input.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = function () {
            pendingInlineImageDataUrl = reader.result as string;
            const previewEl = $('#chat_image_preview');
            previewEl.attr('src', pendingInlineImageDataUrl || '');
            previewEl.closest('.chat-image-preview-container').show();
        };
        reader.readAsDataURL(file);
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

    const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: message,
        inlineImageUrl: pendingInlineImageDataUrl ?? undefined,
        timestamp: Date.now()
    };

    addMessageToChat(userMessage);
    input.val('');

    try {
        const response = await generateChatResponse(message, pendingInlineImageDataUrl ?? undefined);

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
        // Reset pending image after send
        pendingInlineImageDataUrl = null;
        const fileInput = document.getElementById('chat_image_input') as HTMLInputElement | null;
        if (fileInput) fileInput.value = '';
        const previewEl = $('#chat_image_preview');
        previewEl.attr('src', '');
        previewEl.closest('.chat-image-preview-container').hide();
    }
}

async function generateChatResponse(userMessage: string, inlineImageUrl?: string): Promise<string> {
    const settings = settingsManager.getSettings();

    if (!settings.profileId) {
        throw new Error('No connection profile selected');
    }

    try {
        const activeSession = sessionService.getSession();

        // Don't add the user message to chat history yet - do it after generation
        // to avoid duplicate messages in the request

        // Get context from SillyTavern
        const context = SillyTavern.getContext();

        // Prepare world info entries
        const entriesGroupByWorldName: Record<string, any[]> = {};
        await Promise.all(
            world_names
                .filter((name: string) => activeSession.selectedWorldNames.includes(name))
                .map(async (name: string) => {
                    const worldInfo = await globalContext.loadWorldInfo(name);
                    if (worldInfo) {
                        entriesGroupByWorldName[name] = Object.values(worldInfo.entries);
                    }
                }),
        );

        // Build prompt options
        const profile = context.extensionSettings.connectionManager?.profiles?.find(
            (p: any) => p.id === settings.profileId,
        );
        
        const buildPromptOptions = {
            presetName: profile?.preset,
            contextName: profile?.context,
            instructName: profile?.instruct,
            targetCharacterId: this_chid,
            ignoreCharacterFields: true,
            ignoreWorldInfo: true,
            ignoreAuthorNote: true,
            maxContext:
                settings.maxContextType === 'custom'
                    ? settings.maxContextValue
                    : settings.maxContextType === 'profile'
                        ? 'preset' as const
                        : 'active' as const,
            includeNames: !!selected_group,
            messageIndexesBetween: { start: -1, end: -1 }, // No chat messages for chat generation
        };

        // Format description based on settings
        let formatDescription = '';
        switch (settings.outputFormat) {
            case 'xml':
                formatDescription = settings.prompts.xmlFormat.content;
                break;
            case 'json':
                formatDescription = settings.prompts.jsonFormat.content;
                break;
            case 'none':
                formatDescription = settings.prompts.noneFormat.content;
                break;
        }

        // Prepare prompt settings (remove unused prompts for chat)
        const promptSettings = structuredClone(settings.prompts);
        if (!settings.contextToSend.stDescription) {
            // @ts-ignore
            delete promptSettings.stDescription;
        }
        if (!settings.contextToSend.charCard || activeSession.selectedCharacterIndexes.length === 0) {
            // @ts-ignore
            delete promptSettings.charDefinitions;
        }
        if (!settings.contextToSend.worldInfo || activeSession.selectedWorldNames.length === 0) {
            // @ts-ignore
            delete promptSettings.lorebookDefinitions;
        }
        if (!settings.contextToSend.existingFields) {
            // @ts-ignore
            delete promptSettings.existingFieldDefinitions;
        }
        if (!settings.contextToSend.persona) {
            // @ts-ignore
            delete promptSettings.personaDescription;
        }
        // @ts-ignore - since this is only for saving as world info entry
        delete promptSettings.worldInfoCharDefinition;

        // Use the main character field generation system with chat-specific instructions
        // Include the current user message in the prompt
        const chatPrompt = `This is a chat request. The user just said: "${userMessage}". Please respond naturally as an AI assistant helping with character creation to continue the conversation.`;
        
        const response = await runCharacterFieldGeneration({
            profileId: settings.profileId,
            userPrompt: chatPrompt,
            buildPromptOptions,
            session: activeSession,
            allCharacters: context.characters,
            entriesGroupByWorldName,
            promptSettings,
            formatDescription: { content: formatDescription },
            mainContextList: settings.mainContextTemplatePresets[settings.mainContextTemplatePreset].prompts
                .filter((p) => p.enabled)
                .map((p) => ({
                    promptName: p.promptName,
                    role: p.role,
                })),
            includeUserMacro: settings.contextToSend.persona,
            maxResponseToken: settings.maxResponseToken,
            targetField: 'chat_response',
            outputFormat: settings.outputFormat,
            // Attach image to current user message for providers supporting inline parts
            additionalContentPartsForCurrentUserMessage: inlineImageUrl
                ? [{ type: 'image_url', image_url: { url: inlineImageUrl, detail: 'auto' } } as ContentPart]
                : undefined,
        });

        // Now add both the user message and assistant response to chat history
        const userChatMessage = sessionService.convertUIMessageToChatMessage(
            { content: userMessage, imageUrl: inlineImageUrl },
            'user'
        );
        sessionService.addChatMessage(userChatMessage);
        
        sessionService.addChatMessage({
            role: 'assistant',
            content: response
        });

        return response || '';
    } catch (error) {
        console.error('Chat API error:', error);
        throw error;
    }
}


function addMessageToChat(message: ChatMessage): void {
    // Convert UI message to creator chat message and add to session
    const creatorMessage = sessionService.convertUIMessageToChatMessage(
        { content: message.content, imageUrl: message.inlineImageUrl },
        message.role
    );
    sessionService.addChatMessage(creatorMessage);
    
    renderMessage(message);
    scrollToBottom();
}

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
        const img = $(`<div class="inline-image" style="margin-top:6px;"><img src="${message.inlineImageUrl}" alt="inline image" style="max-width: 200px; max-height: 200px; border:1px solid var(--SmartThemeBorderColor); border-radius:4px;"/></div>`);
        container.append(img);
    }

    $('#chat_messages').append(messageElement);
}

function renderChatHistory(): void {
    $('#chat_messages').empty();
    const messages = sessionService.getChatMessagesForUI();
    messages.forEach(message => renderMessage(message));
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

    sessionService.clearChatHistory();
    $('#chat_messages').empty();
}

function exportChat(): void {
    const messages = sessionService.getChatMessagesForUI();
    if (messages.length === 0) {
        alert('No chat history to export');
        return;
    }

    const exportData = {
        messages: messages,
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

function startEditMessage(messageId: string): void {
    const messages = sessionService.getChatMessagesForUI();
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

function saveEditMessage(messageId: string): void {
    const messageElement = $(`.chat-message[data-message-id="${messageId}"]`);
    const editContainer = messageElement.find('.message-edit-container');
    const editTextarea = editContainer.find('.message-edit-textarea');
    const newContent = editTextarea.val()?.toString().trim();
    
    if (!newContent) {
        alert('Message cannot be empty');
        return;
    }
    
    // Find message index by ID
    const messages = sessionService.getChatMessagesForUI();
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex !== -1) {
        // Update message in session - convert back to creator chat message format
        const updatedMessage = sessionService.convertUIMessageToChatMessage(
            { content: newContent },
            messages[messageIndex].role
        );
        sessionService.replaceChatMessage(messageIndex, updatedMessage);
        
        // Update UI
        const contentElement = messageElement.find('.message-content');
        contentElement.html(formatMessageContent(newContent));
        contentElement.show();
        editContainer.hide();
    }
}

function cancelEditMessage(messageId: string): void {
    const messageElement = $(`.chat-message[data-message-id="${messageId}"]`);
    const contentElement = messageElement.find('.message-content');
    const editContainer = messageElement.find('.message-edit-container');
    
    contentElement.show();
    editContainer.hide();
}

function deleteMessage(messageId: string): void {
    if (!confirm('Are you sure you want to delete this message?')) return;
    
    // Find message index by ID
    const messages = sessionService.getChatMessagesForUI();
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex !== -1) {
        sessionService.deleteChatMessage(messageIndex);
        
        // Remove from UI with animation
        const messageElement = $(`.chat-message[data-message-id="${messageId}"]`);
        messageElement.fadeOut(200, function() {
            $(this).remove();
        });
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
    return sessionService.getChatMessagesForUI();
}

export function formatChatAsContext(): string {
    const messages = sessionService.getChatMessagesForUI();
    if (messages.length === 0) return '';

    const header = "=== Character Brainstorming Chat ===\n\n";
    const messageStrings = messages.map(msg =>
        `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`
    ).join('\n\n');

    return header + messageStrings + '\n\n=== End of Chat ===\n';
}