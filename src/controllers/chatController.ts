import { runCharacterFieldGeneration, globalContext } from '../generate.js';
import { SessionService } from '../services/sessionService.js';
import { ImageService } from '../services/imageService.js';
import { settingsManager } from '../settings.js';
import { ChatMessage, CreatorChatMessage } from '../types.js';
import { selected_group, this_chid, world_names } from 'sillytavern-utils-lib/config';

export interface SendMessageOptions {
  content: string;
  imageUrl?: string;
}

export interface EditMessageOptions {
  messageIndex: number;
  newContent: string;
}

export interface ChatExportData {
  messages: ChatMessage[];
  exportedAt: string;
}

export class ChatController {
  private static instance: ChatController;
  private sessionService: SessionService;
  private imageService: ImageService;

  static getInstance(): ChatController {
    if (!ChatController.instance) {
      ChatController.instance = new ChatController();
    }
    return ChatController.instance;
  }

  private constructor() {
    this.sessionService = SessionService.getInstance();
    this.imageService = ImageService.getInstance();
  }

  /**
   * Send a chat message and get AI response
   */
  async sendMessage(options: SendMessageOptions): Promise<{ userMessage: ChatMessage; aiMessage: ChatMessage }> {
    const { content, imageUrl } = options;
    const settings = settingsManager.getSettings();

    if (!settings.profileId) {
      throw new Error('No connection profile selected');
    }

    // Create user message
    const userMessage: ChatMessage = {
      id: this.generateId(),
      role: 'user',
      content: content.trim(),
      inlineImageUrl: imageUrl,
      timestamp: Date.now(),
    };

    // Convert to creator chat message format and add to session
    const userChatMessage = this.sessionService.convertUIMessageToChatMessage(
      { content: content.trim(), imageUrl },
      'user'
    );

    // Generate AI response
    const response = await this.generateChatResponse(content, imageUrl);

    // Create AI message
    const aiMessage: ChatMessage = {
      id: this.generateId(),
      role: 'assistant',
      content: response,
      timestamp: Date.now(),
    };

    // Add both messages to session
    this.sessionService.addChatMessage(userChatMessage);
    this.sessionService.addChatMessage({
      role: 'assistant',
      content: response,
    });

    return { userMessage, aiMessage };
  }

  /**
   * Edit an existing message
   */
  async editMessage(options: EditMessageOptions): Promise<void> {
    const { messageIndex, newContent } = options;
    
    if (!newContent.trim()) {
      throw new Error('Message cannot be empty');
    }

    const messages = this.sessionService.getChatMessagesForUI();
    if (messageIndex < 0 || messageIndex >= messages.length) {
      throw new Error('Invalid message index');
    }

    const message = messages[messageIndex];
    const updatedMessage = this.sessionService.convertUIMessageToChatMessage(
      { content: newContent.trim(), imageUrl: message.inlineImageUrl },
      message.role
    );

    this.sessionService.replaceChatMessage(messageIndex, updatedMessage);
  }

  /**
   * Delete a message by index
   */
  async deleteMessage(messageIndex: number): Promise<void> {
    const messages = this.sessionService.getChatMessagesForUI();
    if (messageIndex < 0 || messageIndex >= messages.length) {
      throw new Error('Invalid message index');
    }

    this.sessionService.deleteChatMessage(messageIndex);
  }

  /**
   * Clear all chat messages
   */
  async clearChat(): Promise<void> {
    this.sessionService.clearChatHistory();
  }

  /**
   * Export chat to JSON
   */
  exportChat(): ChatExportData {
    const messages = this.sessionService.getChatMessagesForUI();
    return {
      messages,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Get all chat messages for UI display
   */
  getChatMessages(): ChatMessage[] {
    return this.sessionService.getChatMessagesForUI();
  }

  /**
   * Process image file for chat attachment
   */
  async processImageFile(file: File): Promise<string> {
    return this.imageService.processImageFile(file);
  }

  /**
   * Create image preview HTML for UI
   */
  createImagePreviewHtml(imageUrl: string): string {
    return this.imageService.createImagePreviewHtml(imageUrl);
  }

  // Private helper methods

  private async generateChatResponse(userMessage: string, inlineImageUrl?: string): Promise<string> {
    const settings = settingsManager.getSettings();
    const activeSession = this.sessionService.getSession();

    // Get context from SillyTavern
    const context = globalContext;

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
      maxContext: this.getMaxContext(settings),
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

    // Use the main character field generation system with chat-specific instructions
    const chatPrompt = `This is a chat request. The user just said: "${userMessage}". Please respond naturally as an AI assistant helping with character creation to continue the conversation.`;
    
    const response = await runCharacterFieldGeneration({
      profileId: settings.profileId,
      userPrompt: chatPrompt,
      buildPromptOptions,
      session: activeSession,
      allCharacters: context.characters,
      entriesGroupByWorldName,
      formatDescription: { content: formatDescription },
      includeUserMacro: settings.contextToSend.persona,
      maxResponseToken: settings.maxResponseToken,
      targetField: 'chat_response',
      outputFormat: settings.outputFormat,
      // Attach image to current user message for providers supporting inline parts
      additionalContentPartsForCurrentUserMessage: inlineImageUrl
        ? [this.imageService.createImageContentPart(inlineImageUrl)]
        : undefined,
    });

    return response || '';
  }

  private getMaxContext(settings: any): string | number {
    switch (settings.maxContextType) {
      case 'custom':
        return settings.maxContextValue;
      case 'profile':
        return 'preset' as const;
      case 'sampler':
        return 'active' as const;
      default:
        return 'preset' as const;
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}
