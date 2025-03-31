import { buildPrompt, BuildPromptOptions, ExtensionSettingsManager, Message } from 'sillytavern-utils-lib';
import { ExtractedData } from 'sillytavern-utils-lib/types';
import { parseResponse } from './parsers.js';
import { Character } from 'sillytavern-utils-lib/types';
import { WIEntry } from 'sillytavern-utils-lib/types/world-info';
import { ExtensionSettings, SYSTEM_PROMPT_KEYS } from './settings.js';

// @ts-ignore
import { Handlebars } from '../../../../../lib.js';

// @ts-ignore
export const globalContext = SillyTavern.getContext();

export type CharacterFieldName = 'name' | 'description' | 'personality' | 'scenario' | 'first_mes' | 'mes_example';

export const CHARACTER_FIELDS: CharacterFieldName[] = [
  'name',
  'description',
  'personality',
  'scenario',
  'first_mes',
  'mes_example',
];

export const CHARACTER_LABELS: Record<CharacterFieldName, string> = {
  name: 'Name',
  description: 'Description',
  personality: 'Personality',
  scenario: 'Scenario',
  first_mes: 'First Message',
  mes_example: 'Example Dialogue',
};

export interface CharacterField {
  prompt: string;
  value: string;
  label: string;
}

export interface Session {
  selectedCharacterIndexes: string[];
  selectedWorldNames: string[];
  fields: Record<CharacterFieldName, CharacterField>;
  draftFields: Record<string, CharacterField>;
}

export interface ContextToSend {
  stDescription: boolean;
  messages: {
    type: 'none' | 'all' | 'first' | 'last' | 'range';
    first?: number;
    last?: number;
    range?: {
      start: number;
      end: number;
    };
  };
  charCard: boolean;
  existingFields: boolean;
  worldInfo: boolean;
}

// @ts-ignore
const dumbSettings = new ExtensionSettingsManager<ExtensionSettings>('dumb', {}).getSettings();

export interface RunCharacterFieldGenerationParams {
  profileId: string;
  userPrompt: string;
  buildPromptOptions: BuildPromptOptions;
  contextToSend: ContextToSend;
  session: Session;
  allCharacters: Character[];
  entriesGroupByWorldName: Record<string, WIEntry[]>;
  promptSettings: typeof dumbSettings.prompts;
  formatDescription: {
    content: string;
  };
  mainContextTemplate: string;
  maxResponseToken: number;
  targetField: CharacterFieldName | string;
  outputFormat: 'xml' | 'json' | 'none';
}

export async function runCharacterFieldGeneration({
  profileId,
  userPrompt,
  buildPromptOptions,
  contextToSend,
  session,
  allCharacters,
  entriesGroupByWorldName,
  promptSettings,
  formatDescription,
  mainContextTemplate,
  maxResponseToken,
  targetField,
  outputFormat,
}: RunCharacterFieldGenerationParams): Promise<string> {
  if (!profileId) {
    throw new Error('No connection profile selected.');
  }
  const profile = globalContext.extensionSettings.connectionManager?.profiles?.find((p: any) => p.id === profileId);
  if (!profile) {
    throw new Error(`Connection profile with ID "${profileId}" not found.`);
  }

  const processedUserPrompt = globalContext.substituteParams(userPrompt.trim());

  const selectedApi = profile.api ? globalContext.CONNECT_API_MAP[profile.api].selected : undefined;
  if (!selectedApi) {
    throw new Error(`Could not determine API for profile "${profile.name}".`);
  }

  const templateData: Record<string, string | undefined> = {};

  // Build base prompt (system, memory, messages, persona - if applicable)
  const chatMessages = await buildPrompt(selectedApi, buildPromptOptions);

  // Add ST/Character Card Description
  if (contextToSend.stDescription) {
    templateData['stDescription'] = promptSettings.stDescription.content;
  }

  // Add Definitions of Selected Characters (if enabled and characters selected)
  if (contextToSend.charCard && session.selectedCharacterIndexes.length > 0) {
    try {
      const template = Handlebars.compile(promptSettings.charDefinitions.content, { noEscape: true });
      const charactersData: Array<Character> = [];
      session.selectedCharacterIndexes.forEach((charIndex) => {
        const charIndexNumber = parseInt(charIndex);
        const char = allCharacters[charIndexNumber];
        if (char) {
          charactersData.push(char);
        }
      });

      if (charactersData.length > 0) {
        const charDefinitionsPrompt = template({ characters: charactersData });
        if (charDefinitionsPrompt) {
          templateData['charDefinitions'] = charDefinitionsPrompt;
        }
      }
    } catch (error: any) {
      console.error('Error compiling or executing Handlebars template for character definitions:', error);
      throw new Error(`Error compiling or executing Handlebars template for character definitions: ${error.message}`);
    }
  }
  // Add Definitions of Selected Lorebooks (World Info)
  if (contextToSend.worldInfo && session.selectedWorldNames.length > 0) {
    try {
      const template = Handlebars.compile(promptSettings.lorebookDefinitions.content, { noEscape: true });
      const lorebooksData: Record<string, WIEntry[]> = {};
      Object.entries(entriesGroupByWorldName)
        .filter(
          ([worldName, entries]) =>
            entries.length > 0 &&
            session.selectedWorldNames.includes(worldName) &&
            entries.some((entry) => !entry.disable),
        )
        .forEach(([worldName, entries]) => {
          lorebooksData[worldName] = entries.filter((entry) => !entry.disable);
        });

      if (Object.keys(lorebooksData).length > 0) {
        const lorebookPrompt = template({ lorebooks: lorebooksData });
        if (lorebookPrompt) {
          templateData['lorebookDefinitions'] = lorebookPrompt;
        }
      }
    } catch (error: any) {
      console.error('Error compiling or executing Handlebars template for lorebook definitions:', error);
      throw new Error(`Error compiling or executing Handlebars template for lorebook definitions: ${error.message}`);
    }
  }

  // Add Current Field Values (if enabled)
  if (
    contextToSend.existingFields &&
    (session.fields || session.draftFields) &&
    (Object.keys(session.fields).length > 0 || Object.keys(session.draftFields).length > 0)
  ) {
    try {
      const template = Handlebars.compile(promptSettings.existingFieldDefinitions.content, { noEscape: true });
      const coreFields: Record<string, string> = Object.fromEntries(
        Object.entries(session.fields).map(([fieldName, field]) => [field.label, field.value]),
      );
      const draftFields: Record<string, string> = Object.fromEntries(
        Object.entries(session.draftFields || {}).map(([fieldName, field]) => [field.label, field.value]),
      );

      // Combine core and draft fields for the template context
      const allFields = {
        core: coreFields,
        draft: draftFields,
      };

      const existingFieldsPrompt = template({ fields: allFields });
      if (existingFieldsPrompt) {
        templateData['existingFieldDefinitions'] = existingFieldsPrompt;
      }
    } catch (error: any) {
      console.error('Error compiling or executing Handlebars template for existing fields:', error);
      throw new Error(`Error compiling or executing Handlebars template for existing fields: ${error.message}`);
    }
  }

  // Add Output Format Instructions
  templateData['outputFormatInstructions'] = formatDescription.content;

  // Construct and Add Final User Task
  {
    const template = Handlebars.compile(promptSettings.taskDescription.content, { noEscape: true });
    const taskDescriptionPrompt = template({
      userInstructions: processedUserPrompt,
      // @ts-ignore
      fieldSpecificInstructions: session.draftFields[targetField]?.prompt ?? session.fields[targetField]?.prompt,
      targetField,
    });
    if (taskDescriptionPrompt) {
      templateData['taskDescription'] = taskDescriptionPrompt;
    }
  }

  // Add user-added prompts
  Object.entries(promptSettings)
    .filter(([key]) => !SYSTEM_PROMPT_KEYS.includes(key))
    .forEach(([key, value]) => {
      templateData[key] = globalContext.substituteParams(value.content);
    });

  /**
   * Helper function to process a content block from the template.
   */
  function processContentBlock(
    contentBlock: string,
    roleForBlock: string,
    templateData: Record<string, any>, // Use a more specific type if possible
    chatMessages: Message[],
    targetMessagesArray: Message[],
  ): void {
    if (!contentBlock) {
      return; // Skip empty blocks
    }

    const template = Handlebars.compile(contentBlock, { noEscape: true });

    if (contentBlock.includes('{{chatHistory}}')) {
      // Check if rendering results in non-empty output *and* chat messages exist
      const renderedCheck = template({ chatHistory: chatMessages.length > 0 ? chatMessages : undefined }).trim();
      if (renderedCheck && chatMessages.length > 0) {
        targetMessagesArray.push(...chatMessages); // Add chat history respecting its internal roles
      }
    } else {
      // Handle regular content blocks
      const renderedContent = template(templateData).trim();
      if (renderedContent) {
        // Basic role validation (adjust as needed for your specific supported roles)
        const validRole = ['system', 'user', 'assistant'].includes(roleForBlock) ? roleForBlock : 'system';
        targetMessagesArray.push({ role: validRole, content: renderedContent });
      }
    }
  }

  const messages: Message[] = [];
  {
    const separatorRegex = /\[CREC_NEXT_MESSAGE(?:=([a-zA-Z]+))?\]/g;
    const defaultRole = 'system'; // Default role if not specified
    let lastIndex = 0;
    let roleForNextBlock = defaultRole; // Role determined by the *previous* separator (or default)

    let match;
    while ((match = separatorRegex.exec(mainContextTemplate)) !== null) {
      const contentBlock = mainContextTemplate.substring(lastIndex, match.index).trim();

      // Process the block *before* the separator using the role determined by the PREVIOUS separator
      processContentBlock(contentBlock, roleForNextBlock, templateData, chatMessages, messages);

      // Determine role for the block *after* this separator
      roleForNextBlock = match[1]?.toLowerCase() || defaultRole; // Use captured role or default, normalize
      lastIndex = separatorRegex.lastIndex;
    }

    // Process the final content block after the last separator
    const finalContentBlock = mainContextTemplate.substring(lastIndex).trim();
    processContentBlock(finalContentBlock, roleForNextBlock, templateData, chatMessages, messages);
  }

  // console.log("Sending messages:", JSON.stringify(messages, null, 2)); // For debugging

  const response = (await globalContext.ConnectionManagerRequestService.sendRequest(
    profileId,
    messages,
    maxResponseToken,
  )) as ExtractedData;

  // console.log("Received raw content:", response.content); // For debugging

  // Parse the response based on the expected format
  const parsedContent = parseResponse(response.content, outputFormat);

  return parsedContent;
}
