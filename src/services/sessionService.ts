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
      creatorChatHistory: { messages: [] }
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
      localStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
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
  addChatMessage(message: CreatorChatMessage): void {
    const session = this.getSession();
    session.creatorChatHistory.messages.push(message);
    this.saveSession();
  }

  /**
   * Replace a chat message by index
   */
  replaceChatMessage(index: number, message: CreatorChatMessage): void {
    const session = this.getSession();
    if (index >= 0 && index < session.creatorChatHistory.messages.length) {
      session.creatorChatHistory.messages[index] = message;
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
          inlineImageUrl = imagePart?.image_url?.url;
        }

        return {
          id: `${index}-${Date.now()}`, // Simple ID generation
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
   * Reset session to defaults
   */
  resetSession(): void {
    localStorage.removeItem(SESSION_KEY);
    this.createNewSession();
  }
}
