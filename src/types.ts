// Unified types for the extension

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
    // For persistence: store compressed/thumbnail version
    thumbnailUrl?: string;
    originalSize?: number;
  };
}

// Chat message that can handle both text and content parts (for images)
export interface CreatorChatMessage {
  role: MessageRole;
  content: string | ContentPart[];
}

// UI-level chat message for display
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  inlineImageUrl?: string;
  timestamp: number;
}

// Character field definition
export interface CharacterField {
  prompt: string;
  value: string;
  label: string;
}

// Creator chat history stored in session
export interface CreatorChatHistory {
  messages: CreatorChatMessage[];
}

// Main session interface
export interface Session {
  selectedCharacterIndexes: string[];
  selectedWorldNames: string[];
  fields: Record<string, CharacterField>;
  draftFields: Record<string, CharacterField>;
  lastLoadedCharacterId: string;
  creatorChatHistory: CreatorChatHistory;
  // Store image thumbnails separately to manage storage size
  imageThumbnails?: Record<string, string>; // imageId -> thumbnail data URL
}
