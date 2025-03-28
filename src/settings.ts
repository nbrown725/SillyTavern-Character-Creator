import { ExtensionSettingsManager } from 'sillytavern-utils-lib';
import {
  DEFAULT_CHAR_CARD_DESCRIPTION,
  DEFAULT_CHAR_CARD_DEFINITION_TEMPLATE,
  DEFAULT_LOREBOOK_DEFINITION,
  DEFAULT_XML_FORMAT_DESC,
  DEFAULT_JSON_FORMAT_DESC,
  DEFAULT_NONE_FORMAT_DESC,
} from './constants.js';
import { ContextToSend } from './generate.js';

export const extensionName = 'SillyTavern-Character-Creator';
export const VERSION = '0.1.0'; // Initial version
export const FORMAT_VERSION = 'F_1.0'; // Data format version

export const KEYS = {
  EXTENSION: 'charCreator',
} as const;

export interface PromptPreset {
  content: string;
}

export type OutputFormat = 'xml' | 'json' | 'none';

export interface ExtensionSettings {
  version: string;
  formatVersion: string;
  profileId: string;
  maxContextType: 'profile' | 'sampler' | 'custom';
  maxContextValue: number;
  maxResponseToken: number;
  outputFormat: OutputFormat;
  contextToSend: ContextToSend;

  // Character Card Prompts
  stCharCardPrompt: string;
  usingDefaultStCharCardPrompt: boolean;
  charCardDefinitionPrompt: string; // Handlebars template
  usingDefaultCharCardDefinitionPrompt: boolean;

  // Lorebook Prompt
  lorebookDefinitionPrompt: string;
  usingDefaultLorebookDefinitionPrompt: boolean;

  // Format Descriptions
  xmlFormatDesc: string;
  usingDefaultXmlFormatDesc: boolean;
  jsonFormatDesc: string;
  usingDefaultJsonFormatDesc: boolean;
  noneFormatDesc: string; // For plain text
  usingDefaultNoneFormatDesc: boolean;

  // Generic Prompt Presets
  promptPreset: string;
  promptPresets: Record<string, PromptPreset>;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  version: VERSION,
  formatVersion: FORMAT_VERSION,
  profileId: '',
  maxContextType: 'profile',
  maxContextValue: 16384,
  maxResponseToken: 1024,
  outputFormat: 'none', // Default to plain text
  contextToSend: {
    stDescription: true, // Description of ST/CharCard
    messages: {
      type: 'last', // Default to last 10 messages
      first: 10,
      last: 10,
      range: {
        start: 0,
        end: 10,
      },
    },
    charCard: true, // Include selected character context
    existingFields: true, // Include current field values
    worldInfo: true,
  },

  // Character Card Prompts
  stCharCardPrompt: DEFAULT_CHAR_CARD_DESCRIPTION,
  usingDefaultStCharCardPrompt: true,
  charCardDefinitionPrompt: DEFAULT_CHAR_CARD_DEFINITION_TEMPLATE,
  usingDefaultCharCardDefinitionPrompt: true,

  // Lorebook Prompt
  lorebookDefinitionPrompt: DEFAULT_LOREBOOK_DEFINITION,
  usingDefaultLorebookDefinitionPrompt: true,

  // Format Descriptions
  xmlFormatDesc: DEFAULT_XML_FORMAT_DESC,
  usingDefaultXmlFormatDesc: true,
  jsonFormatDesc: DEFAULT_JSON_FORMAT_DESC,
  usingDefaultJsonFormatDesc: true,
  noneFormatDesc: DEFAULT_NONE_FORMAT_DESC,
  usingDefaultNoneFormatDesc: true,

  // Generic Prompt Presets
  promptPreset: 'default',
  promptPresets: {
    default: {
      // Default prompt can be more specific to character creation
      content:
        'Generate the field content based on the chat history and existing character details. Be creative but consistent.',
    },
  },
};

export const settingsManager = new ExtensionSettingsManager<ExtensionSettings>(KEYS.EXTENSION, DEFAULT_SETTINGS);
