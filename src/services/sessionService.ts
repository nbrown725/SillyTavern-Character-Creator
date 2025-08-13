import { Session, CharacterField, CreatorChatMessage, ChatMessage, ContentPart } from '../types.js';
import { CHARACTER_FIELDS, CHARACTER_LABELS } from '../generate.js';

const SESSION_KEY = 'charCreator';

export class SessionService {
  private static instance: SessionService;
  private session: Session | null = null;

  static getInstance(): SessionService {
    if (!SessionService.instance) {
      SessionService.instance = new SessionService();
    }
    return SessionService.instance;
  }

  private constructor() {
    this.loadSession();
  }

  /**
   * Load session from localStorage
   */
  private loadSession(): void {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        this.session = JSON.parse(stored);
        this.ensureSessionIntegrity();
      } else {
        this.createNewSession();
      }
    } catch (error) {
      console.error('Failed to load session:', error);
      // Try to recover by clearing corrupted data
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch (removeError) {
        console.error('Failed to remove corrupted session:', removeError);
      }
      this.createNewSession();
    }
  }

  /**
   * Create a new empty session
   */
  private createNewSession(): void {
    this.session = {
      selectedCharacterIndexes: [],
      selectedWorldNames: [],
      fields: {},
      draftFields: {},
      lastLoadedCharacterId: '',
      creatorChatHistory: { messages: [] },
      imageThumbnails: {}
    };

    // Initialize core fields
    CHARACTER_FIELDS.forEach((field) => {
      this.session!.fields[field] = {
        value: '',
        prompt: '',
        label: CHARACTER_LABELS[field],
      };
    });

    this.saveSession();
  }

  /**
   * Ensure session has all required properties and fix any inconsistencies
   */
  private ensureSessionIntegrity(): void {
    if (!this.session) return;

    // Ensure all required properties exist
    if (!this.session.selectedCharacterIndexes) {
      this.session.selectedCharacterIndexes = [];
    }
    if (!this.session.selectedWorldNames) {
      this.session.selectedWorldNames = [];
    }
    if (!this.session.fields) {
      this.session.fields = {};
    }
    if (!this.session.draftFields) {
      this.session.draftFields = {};
    }
    if (!this.session.lastLoadedCharacterId) {
      this.session.lastLoadedCharacterId = '';
    }
    if (!this.session.creatorChatHistory) {
      this.session.creatorChatHistory = { messages: [] };
    }
    if (!Array.isArray(this.session.creatorChatHistory.messages)) {
      this.session.creatorChatHistory.messages = [];
    }
    if (!this.session.imageThumbnails) {
      this.session.imageThumbnails = {};
    }

    // Ensure all core fields exist
    CHARACTER_FIELDS.forEach((field) => {
      if (!this.session!.fields[field]) {
        this.session!.fields[field] = {
          value: '',
          prompt: '',
          label: CHARACTER_LABELS[field],
        };
      }
    });
  }

  /**
   * Save session to localStorage
   */
  private saveSession(): void {
    if (this.session) {
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
      } catch (error) {
        // Handle storage quota issues gracefully by pruning oversized data
        console.error('Failed to save session, attempting to prune and retry:', error);

        try {
          // Aggressive pruning for quota issues
          const session = this.session;
          if (session && session.creatorChatHistory && Array.isArray(session.creatorChatHistory.messages)) {
            // First: strip all image data URLs from messages
            session.creatorChatHistory.messages = session.creatorChatHistory.messages.map((msg) => this.sanitizeChatMessageForStorage(msg));

            // Second: keep only last 20 messages for emergency
            if (session.creatorChatHistory.messages.length > 20) {
              session.creatorChatHistory.messages = session.creatorChatHistory.messages.slice(-20);
            }

            // Third: if still too large, clear thumbnails older than 1 hour
            if (session.imageThumbnails) {
              const oneHourAgo = Date.now() - (60 * 60 * 1000);
              const filteredThumbnails: Record<string, string> = {};
              Object.entries(session.imageThumbnails).forEach(([id, thumbnail]) => {
                const timestamp = parseInt(id.split('_')[1]);
                if (timestamp > oneHourAgo) {
                  filteredThumbnails[id] = thumbnail;
                }
              });
              session.imageThumbnails = filteredThumbnails;
            }
          }
          localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        } catch (retryError) {
          console.error('Failed to save session after pruning:', retryError);
          // Last resort: clear chat history
          try {
            if (this.session) {
              this.session.creatorChatHistory.messages = [];
              this.session.imageThumbnails = {};
              localStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
            }
          } catch (finalError) {
            console.error('Final fallback failed, clearing all data:', finalError);
            localStorage.removeItem(SESSION_KEY);
          }
        }
      }
    }
  }

  /**
   * Get the current session
   */
  getSession(): Session {
    if (!this.session) {
      this.loadSession();
    }
    return this.session!;
  }

  /**
   * Update session with a partial update
   */
  updateSession(updates: Partial<Session>): void {
    if (!this.session) {
      this.loadSession();
    }
    this.session = { ...this.session!, ...updates };
    this.saveSession();
  }

  /**
   * Update a specific field
   */
  updateField(fieldName: string, updates: Partial<CharacterField>): void {
    const session = this.getSession();
    if (!session.fields[fieldName]) {
      session.fields[fieldName] = {
        value: '',
        prompt: '',
        label: fieldName,
      };
    }
    session.fields[fieldName] = { ...session.fields[fieldName], ...updates };
    this.saveSession();
  }

  /**
   * Update a draft field
   */
  updateDraftField(fieldName: string, updates: Partial<CharacterField>): void {
    const session = this.getSession();
    if (!session.draftFields[fieldName]) {
      session.draftFields[fieldName] = {
        value: '',
        prompt: '',
        label: fieldName,
      };
    }
    session.draftFields[fieldName] = { ...session.draftFields[fieldName], ...updates };
    this.saveSession();
  }

  /**
   * Delete a draft field
   */
  deleteDraftField(fieldName: string): void {
    const session = this.getSession();
    delete session.draftFields[fieldName];
    this.saveSession();
  }

  /**
   * Add a chat message to the creator chat history
   */
  addChatMessage(message: CreatorChatMessage): number {
    const session = this.getSession();
    session.creatorChatHistory.messages.push(this.sanitizeChatMessageForStorage(message));
    this.saveSession();
    return session.creatorChatHistory.messages.length - 1;
  }

  /**
   * Replace a chat message by index
   */
  replaceChatMessage(index: number, message: CreatorChatMessage): void {
    const session = this.getSession();
    if (index >= 0 && index < session.creatorChatHistory.messages.length) {
      session.creatorChatHistory.messages[index] = this.sanitizeChatMessageForStorage(message);
      this.saveSession();
    }
  }

  /**
   * Delete a chat message by index
   */
  deleteChatMessage(index: number): void {
    const session = this.getSession();
    if (index >= 0 && index < session.creatorChatHistory.messages.length) {
      session.creatorChatHistory.messages.splice(index, 1);
      this.saveSession();
    }
  }

  /**
   * Clear all chat messages
   */
  clearChatHistory(): void {
    const session = this.getSession();
    session.creatorChatHistory.messages = [];
    this.saveSession();
  }

  /**
   * Get chat history as UI messages for display
   */
  getChatMessagesForUI(): ChatMessage[] {
    const session = this.getSession();
    return session.creatorChatHistory.messages
      .filter(msg => msg.role === 'user' || msg.role === 'assistant') // Only show user/assistant messages in UI
      .map((msg, index) => {
        let content = '';
        let inlineImageUrl: string | undefined;

        if (typeof msg.content === 'string') {
          content = msg.content;
        } else if (Array.isArray(msg.content)) {
          // Extract text and image from content parts
          const textParts = msg.content.filter(part => part.type === 'text').map(part => part.text).join('');
          const imagePart = msg.content.find(part => part.type === 'image_url');
          content = textParts;
          // Use thumbnail for UI display, original URL for AI context
          if (imagePart?.image_url?.thumbnailUrl) {
            const imageId = imagePart.image_url.thumbnailUrl;
            inlineImageUrl = this.getImageThumbnail(imageId) || imagePart.image_url.url;
          } else {
            inlineImageUrl = imagePart?.image_url?.url;
          }
        }

          return {
          id: String(index),
          role: msg.role as 'user' | 'assistant',
          content,
          inlineImageUrl,
          timestamp: Date.now(), // We don't store timestamps currently, so use current time
        };
      });
  }

  /**
   * Convert UI message to creator chat message
   */
  convertUIMessageToChatMessage(uiMessage: { content: string; imageUrl?: string }, role: 'user' | 'assistant'): CreatorChatMessage {
    if (uiMessage.imageUrl) {
      const parts: ContentPart[] = [];
      if (uiMessage.content.trim()) {
        parts.push({ type: 'text', text: uiMessage.content });
      }
      parts.push({ 
        type: 'image_url', 
        image_url: { url: uiMessage.imageUrl, detail: 'auto' } 
      });
      return { role, content: parts };
    } else {
      return { role, content: uiMessage.content };
    }
  }

  /**
   * Store image thumbnail and return image ID for reference
   */
  storeImageThumbnail(imageDataUrl: string, thumbnailDataUrl: string): string {
    const session = this.getSession();
    if (!session.imageThumbnails) {
      session.imageThumbnails = {};
    }
    
    const imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    session.imageThumbnails[imageId] = thumbnailDataUrl;
    return imageId;
  }

  /**
   * Get image thumbnail by ID
   */
  getImageThumbnail(imageId: string): string | undefined {
    const session = this.getSession();
    return session.imageThumbnails?.[imageId];
  }

  /**
   * Sanitize chat message before persisting to localStorage.
   * For images: store only imageId reference, strip large data URLs completely
   */
  private sanitizeChatMessageForStorage(message: CreatorChatMessage): CreatorChatMessage {
    const { role, content } = message;
    if (typeof content === 'string') {
      return { role, content };
    }
    if (Array.isArray(content)) {
      // Process content parts to remove large data URLs
      const processedParts: ContentPart[] = content.map(part => {
        if (part.type === 'image_url' && part.image_url?.url) {
          // Store only thumbnail reference to avoid quota issues
          return {
            type: 'image_url',
            image_url: {
              url: '', // Clear large data URL for storage
              detail: part.image_url.detail || 'auto',
              thumbnailUrl: part.image_url.thumbnailUrl, // Reference to stored thumbnail
              originalSize: part.image_url.originalSize
            }
          };
        }
        return part;
      });
      return { role, content: processedParts };
    }
    return { role, content: '' };
  }

  /**
   * Get full message content for AI context (restores image URLs from storage)
   */
  getMessageForAIContext(message: CreatorChatMessage): CreatorChatMessage {
    const { role, content } = message;
    if (typeof content === 'string') {
      return { role, content };
    }
    if (Array.isArray(content)) {
      const restoredParts: ContentPart[] = content.map(part => {
        if (part.type === 'image_url' && part.image_url?.thumbnailUrl && !part.image_url.url) {
          // Restore thumbnail for AI context
          const thumbnail = this.getImageThumbnail(part.image_url.thumbnailUrl);
          return {
            type: 'image_url',
            image_url: {
              url: thumbnail || '', // Use thumbnail for AI
              detail: part.image_url.detail || 'auto'
            }
          };
        }
        return part;
      });
      return { role, content: restoredParts };
    }
    return { role, content: '' };
  }

  /**
   * Reset session to defaults
   */
  resetSession(): void {
    localStorage.removeItem(SESSION_KEY);
    this.createNewSession();
  }
}
