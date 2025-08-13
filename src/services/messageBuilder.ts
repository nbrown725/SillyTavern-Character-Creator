import { buildPrompt, BuildPromptOptions, Message } from 'sillytavern-utils-lib';
import { Character } from 'sillytavern-utils-lib/types';
import { WIEntry } from 'sillytavern-utils-lib/types/world-info';
import { name1, st_echo } from 'sillytavern-utils-lib/config';
import { ExtensionSettings, MessageRole, OutputFormat, settingsManager } from '../settings.js';
import { Session, ContentPart, CreatorChatMessage } from '../types.js';
import { CHARACTER_FIELDS, CHARACTER_LABELS, CharacterFieldName, globalContext } from '../generate.js';
import { getPrefilled } from '../parsers.js';

import * as Handlebars from 'handlebars';

export interface MessageBuilderOptions {
  targetField: CharacterFieldName | string;
  userPrompt: string;
  session: Session;
  allCharacters: Character[];
  entriesGroupByWorldName: Record<string, WIEntry[]>;
  buildPromptOptions: BuildPromptOptions;
  formatDescription: { content: string };
  includeUserMacro: boolean;
  continueFrom?: string;
  additionalContentPartsForCurrentUserMessage?: ContentPart[];
}

export class MessageBuilder {
  private static instance: MessageBuilder;

  static getInstance(): MessageBuilder {
    if (!MessageBuilder.instance) {
      MessageBuilder.instance = new MessageBuilder();
    }
    return MessageBuilder.instance;
  }

  private constructor() {}

  /**
   * Build complete message array for AI request
   */
  async buildMessages(options: MessageBuilderOptions): Promise<Message[]> {
    const {
      targetField,
      userPrompt,
      session,
      allCharacters,
      entriesGroupByWorldName,
      buildPromptOptions,
      formatDescription,
      includeUserMacro,
      continueFrom,
      additionalContentPartsForCurrentUserMessage,
    } = options;

    const settings = settingsManager.getSettings();
    
    // Build template data for Handlebars compilation
    const templateData = this.buildTemplateData({
      targetField,
      userPrompt,
      session,
      allCharacters,
      entriesGroupByWorldName,
      formatDescription,
      includeUserMacro,
    });

    // Get the main context list from settings
    const mainContextList = settings.mainContextTemplatePresets[settings.mainContextTemplatePreset].prompts
      .filter((p) => p.enabled)
      .map((p) => ({
        promptName: p.promptName,
        role: p.role,
      }));

    // Build messages array
    const messages: Message[] = [];
    
    for (const mainContext of mainContextList) {
      if (mainContext.promptName === 'chatHistory') {
        // Special handling for ST chat history
        const selectedApi = this.getSelectedApi(buildPromptOptions);
        const prompt = await buildPrompt(selectedApi, buildPromptOptions);
        if (prompt.warnings && prompt.warnings.length > 0) {
          for (const warning of prompt.warnings) {
            st_echo('warning', warning);
          }
        }
        messages.push(...prompt.result);
        continue;
      }

      if (mainContext.promptName === 'creatorChatHistory') {
        // Special handling for creator chat history - restore images for AI context
        const chatMessages = session.creatorChatHistory?.messages ?? [];
        // Import SessionService dynamically to avoid circular imports
        const { SessionService } = await import('./sessionService.js');
        const sessionService = SessionService.getInstance();
        const convertedMessages: Message[] = chatMessages.map(msg => {
          const restoredMsg = sessionService.getMessageForAIContext(msg);
          return {
            role: restoredMsg.role,
            content: restoredMsg.content, // Can be string or ContentPart[] - SillyTavern handles both
          } as Message;
        });
        messages.push(...convertedMessages);
        continue;
      }

      // Template-based blocks (stDescription, charDefinitions, etc.)
      const promptSettings = this.getFilteredPromptSettings(settings, session);
      const prompt = promptSettings[mainContext.promptName];
      if (!prompt) {
        continue;
      }

      let contextTemplateData = structuredClone(templateData);
      if (mainContext.promptName === 'stDescription') {
        contextTemplateData['char'] = '{{char}}';
        contextTemplateData['user'] = '{{user}}';
      }

      const message: Message = {
        role: mainContext.role,
        content: Handlebars.compile(prompt.content || '', { noEscape: true })(contextTemplateData),
      };

      // Apply ST macro substitution with placeholder protection
      message.content = message.content.replaceAll('{{user}}', '[[[crec_veryUniqueUserPlaceHolder]]]');
      message.content = message.content.replaceAll('{{char}}', '[[[crec_veryUniqueCharPlaceHolder]]]');
      message.content = globalContext.substituteParams(message.content);
      message.content = message.content.replaceAll('[[[crec_veryUniqueUserPlaceHolder]]]', '{{user}}');
      message.content = message.content.replaceAll('[[[crec_veryUniqueCharPlaceHolder]]]', '{{char}}');
      
      if (message.content) {
        messages.push(message);
      }
    }

    // Add additional content parts if provided (e.g., inline images)
    if (additionalContentPartsForCurrentUserMessage && additionalContentPartsForCurrentUserMessage.length > 0) {
      messages.push({
        role: 'user',
        content: additionalContentPartsForCurrentUserMessage as any, // SillyTavern providers accept content arrays
      } as Message);
    }

    // Add continuation prefill if provided
    if (continueFrom) {
      const outputFormat = settings.outputFormat;
      messages.push({
        role: 'assistant',
        content: getPrefilled(continueFrom, outputFormat),
      });
    }

    return messages;
  }

  /**
   * Build template data for Handlebars compilation
   */
  private buildTemplateData(options: {
    targetField: string;
    userPrompt: string;
    session: Session;
    allCharacters: Character[];
    entriesGroupByWorldName: Record<string, WIEntry[]>;
    formatDescription: { content: string };
    includeUserMacro: boolean;
  }): Record<string, any> {
    const { targetField, userPrompt, session, allCharacters, entriesGroupByWorldName, formatDescription, includeUserMacro } = options;
    
    const templateData: Record<string, any> = {};

    // Basic template variables
    templateData['char'] = session.fields.name?.value ?? '{{char}}';
    templateData['user'] = includeUserMacro && name1 ? name1 : '{{user}}';
    templateData['persona'] = '{{persona}}'; // ST will replace this
    templateData['targetField'] = targetField;
    
    // Compile user instructions
    templateData['userInstructions'] = Handlebars.compile(userPrompt.trim(), { noEscape: true })(templateData);
    
    // Get field-specific instructions
    const fieldPrompt = session.draftFields[targetField]?.prompt ?? session.fields[targetField as CharacterFieldName]?.prompt ?? '';
    templateData['fieldSpecificInstructions'] = Handlebars.compile(fieldPrompt, { noEscape: true })({
      ...templateData,
      char: targetField === 'mes_example' ? '{{char}}' : templateData.char,
      user: targetField === 'mes_example' ? '{{user}}' : templateData.user,
    });
    
    // Active format instructions
    templateData['activeFormatInstructions'] = Handlebars.compile(formatDescription.content || '', { noEscape: true })(templateData);

    // Add selected characters
    const charactersData: Character[] = [];
    session.selectedCharacterIndexes.forEach((charIndex) => {
      const charIndexNumber = parseInt(charIndex);
      const char = allCharacters[charIndexNumber];
      if (char) {
        charactersData.push(char);
      }
    });
    templateData['characters'] = charactersData;

    // Add creator chat history
    if (!session.creatorChatHistory) {
      session.creatorChatHistory = { messages: [] };
    }
    if (!Array.isArray(session.creatorChatHistory.messages)) {
      session.creatorChatHistory.messages = [];
    }
    templateData['creatorChatHistory'] = session.creatorChatHistory.messages;

    // Add selected lorebooks
    const lorebooksData: Record<string, WIEntry[]> = {};
    Object.entries(entriesGroupByWorldName)
      .filter(([worldName, entries]) =>
        entries.length > 0 &&
        session.selectedWorldNames.includes(worldName) &&
        entries.some((entry) => !entry.disable),
      )
      .forEach(([worldName, entries]) => {
        lorebooksData[worldName] = entries.filter((entry) => !entry.disable);
      });
    templateData['lorebooks'] = lorebooksData;

    // Add current field values with "don't send other greetings" logic
    templateData['fields'] = this.buildFieldsContext(session, targetField);

    return templateData;
  }

  /**
   * Build fields context with proper greeting handling
   */
  private buildFieldsContext(session: Session, targetField: string): Record<string, any> {
    const settings = settingsManager.getSettings();
    const coreFields: Record<string, string> = {};
    const alternateGreetingsFields: Record<string, string> = {};
    const draftFields: Record<string, string> = {};

    const isTargetAlternateGreeting = targetField.startsWith('alternate_greetings_');
    const dontSendOtherGreetings = settings.contextToSend.dontSendOtherGreetings;

    Object.entries(session.fields).forEach(([fieldName, field]) => {
      let shouldSkip = false;
      if (dontSendOtherGreetings) {
        const isAlternateGreeting = fieldName.startsWith('alternate_greetings_');
        if (isTargetAlternateGreeting) {
          // If target is alternate greeting, skip other alternate greetings and first message
          shouldSkip = (isAlternateGreeting && fieldName !== targetField) || fieldName === 'first_mes';
        } else {
          // If target is not alternate greeting, skip all alternate greetings
          shouldSkip = isAlternateGreeting;
        }
      }

      if (!shouldSkip) {
        const compiledValue = Handlebars.compile(field.value || '', { noEscape: true })({
          char: fieldName === 'mes_example' ? '{{char}}' : session.fields.name?.value ?? '{{char}}',
          user: fieldName === 'mes_example' ? '{{user}}' : '{{user}}',
          persona: '{{persona}}',
          targetField,
        });

        if (CHARACTER_FIELDS.includes(fieldName as CharacterFieldName)) {
          const labelToUse = field.label || CHARACTER_LABELS[fieldName as CharacterFieldName] || fieldName;
          coreFields[labelToUse] = compiledValue;
        } else if (fieldName.startsWith('alternate_greetings_')) {
          alternateGreetingsFields[fieldName] = compiledValue;
        }
      }
    });

    Object.entries(session.draftFields || {}).forEach(([_fieldName, field]) => {
      draftFields[field.label] = Handlebars.compile(field.value || '', { noEscape: true })({
        char: session.fields.name?.value ?? '{{char}}',
        user: '{{user}}',
        persona: '{{persona}}',
        targetField,
      });
    });

    return {
      core: coreFields,
      alternate_greetings: alternateGreetingsFields,
      draft: draftFields,
    };
  }

  /**
   * Get filtered prompt settings based on context toggles
   */
  private getFilteredPromptSettings(settings: ExtensionSettings, session: Session): typeof settings.prompts {
    const promptSettings = structuredClone(settings.prompts);
    
    if (!settings.contextToSend.stDescription) {
      // @ts-ignore
      delete promptSettings.stDescription;
    }
    if (!settings.contextToSend.charCard || session.selectedCharacterIndexes.length === 0) {
      // @ts-ignore
      delete promptSettings.charDefinitions;
    }
    if (!settings.contextToSend.worldInfo || session.selectedWorldNames.length === 0) {
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

    return promptSettings;
  }

  /**
   * Get the selected API from build prompt options
   */
  private getSelectedApi(buildPromptOptions: BuildPromptOptions): any {
    // We need to find the profile based on the preset name used in buildPromptOptions
    const profile = globalContext.extensionSettings.connectionManager?.profiles?.find(
      (p: any) => p.preset === buildPromptOptions.presetName
    );
    if (!profile) {
      throw new Error('Connection profile not found for preset: ' + buildPromptOptions.presetName);
    }
    const selectedApi = profile.api ? globalContext.CONNECT_API_MAP[profile.api].selected : undefined;
    if (!selectedApi) {
      throw new Error(`Could not determine API for profile "${profile.name}".`);
    }
    return selectedApi;
  }
}
