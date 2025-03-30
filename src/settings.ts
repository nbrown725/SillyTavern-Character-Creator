import { ExtensionSettingsManager } from 'sillytavern-utils-lib';
import {
  DEFAULT_CHAR_CARD_DESCRIPTION,
  DEFAULT_CHAR_CARD_DEFINITION_TEMPLATE,
  DEFAULT_LOREBOOK_DEFINITION,
  DEFAULT_XML_FORMAT_DESC,
  DEFAULT_JSON_FORMAT_DESC,
  DEFAULT_NONE_FORMAT_DESC,
  DEFAULT_WORLD_INFO_CHARACTER_DEFINITION,
  DEFAULT_EXISTING_FIELDS_DEFINITION,
  DEFAULT_TASK_DESCRIPTION,
  DEFAULT_MAIN_CONTEXT_TEMPLATE,
} from './constants.js';
import { ContextToSend } from './generate.js';

export const extensionName = 'SillyTavern-Character-Creator';
export const VERSION = '0.1.4';
export const FORMAT_VERSION = 'F_1.1';

export const KEYS = {
  EXTENSION: 'charCreator',
} as const;

export interface PromptSetting {
  label: string;
  content: string;
  isDefault: boolean;
}

export interface PromptPreset {
  content: string;
}

export interface MainContextTemplatePreset {
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

  // Consolidated system prompts
  prompts: {
    stCharCard: PromptSetting;
    charDefinition: PromptSetting;
    lorebookDefinition: PromptSetting;
    xmlFormat: PromptSetting;
    jsonFormat: PromptSetting;
    noneFormat: PromptSetting;
    worldInfoCharDefinition: PromptSetting;
    existingFieldsDefinition: PromptSetting;
    taskDescription: PromptSetting;
    [key: string]: PromptSetting;
  };

  // Generic Prompt Presets
  promptPreset: string;
  promptPresets: Record<string, PromptPreset>;

  mainContextTemplatePreset: string;
  mainContextTemplatePresets: Record<string, MainContextTemplatePreset>;

  // World Info
  showSaveAsWorldInfoEntry: {
    show: boolean;
  };
}

export const SYSTEM_PROMPT_KEYS: Array<string> = [
  'stCharCard',
  'charDefinition',
  'lorebookDefinition',
  'xmlFormat',
  'jsonFormat',
  'noneFormat',
  'worldInfoCharDefinition',
  'existingFieldsDefinition',
  'taskDescription',
];

// Map keys to their default values
export const DEFAULT_PROMPT_CONTENTS: Record<keyof ExtensionSettings['prompts'], string> = {
  stCharCard: DEFAULT_CHAR_CARD_DESCRIPTION,
  charDefinition: DEFAULT_CHAR_CARD_DEFINITION_TEMPLATE,
  lorebookDefinition: DEFAULT_LOREBOOK_DEFINITION,
  xmlFormat: DEFAULT_XML_FORMAT_DESC,
  jsonFormat: DEFAULT_JSON_FORMAT_DESC,
  noneFormat: DEFAULT_NONE_FORMAT_DESC,
  worldInfoCharDefinition: DEFAULT_WORLD_INFO_CHARACTER_DEFINITION,
  existingFieldsDefinition: DEFAULT_EXISTING_FIELDS_DEFINITION,
  taskDescription: DEFAULT_TASK_DESCRIPTION,
  mainContextTemplate: DEFAULT_MAIN_CONTEXT_TEMPLATE,
};

export const DEFAULT_SETTINGS: ExtensionSettings = {
  version: VERSION,
  formatVersion: FORMAT_VERSION,
  profileId: '',
  maxContextType: 'profile',
  maxContextValue: 16384,
  maxResponseToken: 1024,
  outputFormat: 'xml',
  contextToSend: {
    stDescription: true,
    messages: {
      type: 'last',
      first: 10,
      last: 10,
      range: {
        start: 0,
        end: 10,
      },
    },
    charCard: true,
    existingFields: true,
    worldInfo: true,
  },

  // Updated prompts structure
  prompts: {
    stCharCard: {
      content: DEFAULT_PROMPT_CONTENTS.stCharCard,
      isDefault: true,
      label: 'ST/Char Card Description',
    },
    charDefinition: {
      content: DEFAULT_PROMPT_CONTENTS.charDefinition,
      isDefault: true,
      label: 'Character Definition Template',
    },
    lorebookDefinition: {
      content: DEFAULT_PROMPT_CONTENTS.lorebookDefinition,
      isDefault: true,
      label: 'Lorebook Definition Template',
    },
    xmlFormat: {
      content: DEFAULT_PROMPT_CONTENTS.xmlFormat,
      isDefault: true,
      label: 'XML Format Description',
    },
    jsonFormat: {
      content: DEFAULT_PROMPT_CONTENTS.jsonFormat,
      isDefault: true,
      label: 'JSON Format Description',
    },
    noneFormat: {
      content: DEFAULT_PROMPT_CONTENTS.noneFormat,
      isDefault: true,
      label: 'Plain Text Format Description',
    },
    worldInfoCharDefinition: {
      content: DEFAULT_PROMPT_CONTENTS.worldInfoCharDefinition,
      isDefault: true,
      label: 'World Info Character Definition Template',
    },
    existingFieldsDefinition: {
      content: DEFAULT_EXISTING_FIELDS_DEFINITION,
      isDefault: true,
      label: 'Existing Fields Definition Template',
    },
    taskDescription: {
      content: DEFAULT_TASK_DESCRIPTION,
      isDefault: true,
      label: 'Task Description Template',
    },
  },

  // Generic Prompt Presets
  promptPreset: 'default',
  promptPresets: {
    default: {
      content:
        'Generate the field content based on the chat history and existing character details. Be creative but consistent.',
    },
  },

  mainContextTemplatePreset: 'default',
  mainContextTemplatePresets: {
    default: { content: DEFAULT_MAIN_CONTEXT_TEMPLATE },
  },

  // World Info
  showSaveAsWorldInfoEntry: {
    show: false,
  },
};

export function convertToVariableName(key: string) {
  // Remove non-ASCII and special characters
  const normalized = key.replace(/[^\w\s]/g, '');

  // Split by whitespace and filter out empty parts
  const parts = normalized.split(/\s+/).filter(Boolean);

  let firstWordPrinted = false;
  return parts
    .map((word, _) => {
      // Remove numbers from the start of words
      const cleanWord = word.replace(/^\d+/, '');
      // Convert to camelCase
      if (cleanWord) {
        const result = firstWordPrinted
          ? `${cleanWord[0].toUpperCase()}${cleanWord.slice(1).toLowerCase()}`
          : cleanWord.toLowerCase();
        if (!firstWordPrinted) {
          firstWordPrinted = true;
        }
        return result;
      }

      return '';
    })
    .join('');
}

export const settingsManager = new ExtensionSettingsManager<ExtensionSettings>(KEYS.EXTENSION, DEFAULT_SETTINGS);
