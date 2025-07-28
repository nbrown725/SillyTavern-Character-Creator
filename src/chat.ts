import { globalContext, runCharacterFieldGeneration, CHARACTER_FIELDS, CHARACTER_LABELS } from "./generate.js";
import { settingsManager } from "./settings.js";
import { ExtractedData } from 'sillytavern-utils-lib/types';
import { selected_group, this_chid, world_names } from 'sillytavern-utils-lib/config';

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

    try {
        const sessionKey = `charCreator`;
        const activeSession = JSON.parse(localStorage.getItem(sessionKey) ?? '{}');
        
        // Only initialize missing properties - don't overwrite existing data
        if (!activeSession.selectedCharacterIndexes) {
            activeSession.selectedCharacterIndexes = this_chid ? [this_chid] : [];
        }
        if (!activeSession.selectedWorldNames) {
            activeSession.selectedWorldNames = [];
        }
        if (!activeSession.fields) {
            activeSession.fields = {};
        }
        if (!activeSession.draftFields) {
            activeSession.draftFields = {};
        }
        if (!activeSession.lastLoadedCharacterId) {
            activeSession.lastLoadedCharacterId = '';
        }
        
        // Only initialize missing fields - preserve existing field data
        CHARACTER_FIELDS.forEach((field) => {
            if (!activeSession.fields[field]) {
                activeSession.fields[field] = {
                    value: '',
                    prompt: '',
                    label: CHARACTER_LABELS[field],
                };
            }
        });
        
        // Ensure creatorChatHistory exists but preserve existing messages
        if (!activeSession.creatorChatHistory) {
            activeSession.creatorChatHistory = { messages: [] };
        }
        if (!Array.isArray(activeSession.creatorChatHistory.messages)) {
            activeSession.creatorChatHistory.messages = [];
        }

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
        });

        // Now add both the user message and assistant response to chat history
        activeSession.creatorChatHistory.messages.push({
            role: 'user',
            content: userMessage
        });
        activeSession.creatorChatHistory.messages.push({
            role: 'assistant',
            content: response
        });

        // Save the updated session
        localStorage.setItem(sessionKey, JSON.stringify(activeSession));

        return response || '';
    } catch (error) {
        console.error('Chat API error:', error);
        throw error;
    }
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

    messageElement.attr('data-message-id', message.id);
    messageElement.addClass(`message-${message.role}`);
    messageElement.find('.message-role').text(message.role === 'user' ? 'You' : 'AI');
    messageElement.find('.message-timestamp').text(formatTimestamp(message.timestamp));
    messageElement.find('.message-content').html(formatMessageContent(message.content));

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
    
    // Also clear creatorChatHistory in main session
    updateCreatorChatHistory();
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

function startEditMessage(messageId: string): void {
    if (!currentSession) return;
    
    const message = currentSession.messages.find(m => m.id === messageId);
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
    if (!currentSession) return;
    
    const messageElement = $(`.chat-message[data-message-id="${messageId}"]`);
    const editContainer = messageElement.find('.message-edit-container');
    const editTextarea = editContainer.find('.message-edit-textarea');
    const newContent = editTextarea.val()?.toString().trim();
    
    if (!newContent) {
        alert('Message cannot be empty');
        return;
    }
    
    // Update message in session
    const messageIndex = currentSession.messages.findIndex(m => m.id === messageId);
    if (messageIndex !== -1) {
        currentSession.messages[messageIndex].content = newContent;
        saveChatSession();
        
        // Update UI
        const contentElement = messageElement.find('.message-content');
        contentElement.html(formatMessageContent(newContent));
        contentElement.show();
        editContainer.hide();
        
        // Update creatorChatHistory in main session
        updateCreatorChatHistory();
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
    if (!currentSession) return;
    
    if (!confirm('Are you sure you want to delete this message?')) return;
    
    // Remove message from session
    const messageIndex = currentSession.messages.findIndex(m => m.id === messageId);
    if (messageIndex !== -1) {
        currentSession.messages.splice(messageIndex, 1);
        saveChatSession();
        
        // Remove from UI with animation
        const messageElement = $(`.chat-message[data-message-id="${messageId}"]`);
        messageElement.fadeOut(200, function() {
            $(this).remove();
        });
        
        // Update creatorChatHistory in main session
        updateCreatorChatHistory();
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

function updateCreatorChatHistory(): void {
    if (!currentSession) return;
    
    // Update the main session's creatorChatHistory
    const sessionKey = `charCreator`;
    const activeSession = JSON.parse(localStorage.getItem(sessionKey) ?? '{}');
    
    if (activeSession.creatorChatHistory) {
        activeSession.creatorChatHistory.messages = currentSession.messages.map(m => ({
            role: m.role,
            content: m.content
        }));
        
        localStorage.setItem(sessionKey, JSON.stringify(activeSession));
    }
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