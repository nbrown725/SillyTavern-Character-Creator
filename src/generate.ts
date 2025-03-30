import { buildPrompt, BuildPromptOptions, ExtensionSettingsManager, Message } from 'sillytavern-utils-lib';
import { ExtractedData } from 'sillytavern-utils-lib/types';
import { parseResponse } from './parsers.js';
import { Character } from 'sillytavern-utils-lib/types';
import { WIEntry } from 'sillytavern-utils-lib/types/world-info';
import { ExtensionSettings } from './settings.js';

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

export interface CharacterField {
  prompt: string;
  value: string;
}

export interface Session {
  selectedCharacterIndexes: string[];
  selectedWorldNames: string[];
  fields: Record<CharacterFieldName, CharacterField>;
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
  targetField: CharacterFieldName;
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
    templateData['stDescription'] = promptSettings.stCharCard.content;
  }

  // Add Definitions of Selected Characters (if enabled and characters selected)
  if (contextToSend.charCard && session.selectedCharacterIndexes.length > 0) {
    try {
      const template = Handlebars.compile(promptSettings.charDefinition.content, { noEscape: true });
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
      const template = Handlebars.compile(promptSettings.lorebookDefinition.content, { noEscape: true });
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
  if (contextToSend.existingFields && session.fields && Object.keys(session.fields).length > 0) {
    const template = Handlebars.compile(promptSettings.existingFieldsDefinition.content, { noEscape: true });
    const fields: Record<string, string> = Object.fromEntries(
      Object.entries(session.fields).map(([fieldName, field]) => [fieldName, field.value]),
    );
    const existingFieldsPrompt = template({ fields });
    if (existingFieldsPrompt) {
      templateData['existingFields'] = existingFieldsPrompt;
    }
  }

  // Add Output Format Instructions
  templateData['outputFormatInstructions'] = formatDescription.content;

  // Construct and Add Final User Task
  {
    const template = Handlebars.compile(promptSettings.taskDescription.content, { noEscape: true });
    const taskDescriptionPrompt = template({
      userInstructions: processedUserPrompt,
      fieldSpecificInstructions: session.fields[targetField].prompt,
      targetField,
    });
    if (taskDescriptionPrompt) {
      templateData['taskDescription'] = taskDescriptionPrompt;
    }
  }

  const messages: Message[] = [];
  {
    // split by "[CREC_NEXT_MESSAGE]"
    const parts = mainContextTemplate.split('[CREC_NEXT_MESSAGE]');
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (part) {
        const template = Handlebars.compile(part, { noEscape: true });
        if (part.includes('{{chatHistory}}') && chatMessages.length > 0) {
          const exist = template({ chatHistory: chatMessages.length > 0 ? chatMessages : undefined }).trim();
          if (exist) {
            messages.push(...chatMessages);
          }
        } else {
          const message = template(templateData).trim();
          if (message) {
            messages.push({ role: 'system', content: message });
          }
        }
      }
    }
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
