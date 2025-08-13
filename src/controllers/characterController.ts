import { buildPrompt, BuildPromptOptions, applyWorldInfoEntry, createCharacter, saveCharacter } from 'sillytavern-utils-lib';
import { Character, FullExportData } from 'sillytavern-utils-lib/types';
import { WIEntry } from 'sillytavern-utils-lib/types/world-info';
import { selected_group, this_chid, world_names, st_echo } from 'sillytavern-utils-lib/config';

import { runCharacterFieldGeneration, globalContext, CharacterFieldName, CHARACTER_LABELS } from '../generate.js';
import { SessionService } from '../services/sessionService.js';
import { ImageService } from '../services/imageService.js';
import { settingsManager, ExtensionSettings } from '../settings.js';
import { Session, CharacterField } from '../types.js';

import * as Handlebars from 'handlebars';

export interface GenerateFieldOptions {
  targetField: string;
  userPrompt: string;
  continueFrom?: string;
  isDraft?: boolean;
  imageUrl?: string;
}

export interface CompareFieldOptions {
  targetField: string;
  currentValue: string;
  characterValue: string;
}

export interface SaveCharacterOptions {
  asNew: boolean;
  selectedCharacterId?: string;
}

export interface SaveAsWorldInfoOptions {
  selectedWorldName: string;
}

export class CharacterController {
  private static instance: CharacterController;
  private sessionService: SessionService;
  private imageService: ImageService;

  static getInstance(): CharacterController {
    if (!CharacterController.instance) {
      CharacterController.instance = new CharacterController();
    }
    return CharacterController.instance;
  }

  private constructor() {
    this.sessionService = SessionService.getInstance();
    this.imageService = ImageService.getInstance();
  }

  /**
   * Generate content for a specific field
   */
  async generateField(options: GenerateFieldOptions): Promise<string> {
    const { targetField, userPrompt, continueFrom, isDraft = false, imageUrl } = options;
    const settings = settingsManager.getSettings();
    const session = this.sessionService.getSession();

    if (!settings.profileId) {
      throw new Error('Please select a connection profile.');
    }

    const profile = globalContext.extensionSettings.connectionManager?.profiles?.find(
      (p: any) => p.id === settings.profileId,
    );
    if (!profile) {
      throw new Error('Connection profile not found.');
    }

    // Build prompt options
    const buildPromptOptions: BuildPromptOptions = {
      presetName: profile?.preset,
      contextName: profile?.context,
      instructName: profile?.instruct,
      targetCharacterId: this_chid,
      ignoreCharacterFields: true,
      ignoreWorldInfo: true,
      ignoreAuthorNote: true,
      maxContext: this.getMaxContext(settings),
      includeNames: !!selected_group,
    };

    // Add message range options
    this.applyMessageRangeOptions(buildPromptOptions, settings);

    // Get format description
    const formatDescription = this.getFormatDescription(settings);

    // Load world info entries
    const entriesGroupByWorldName = await this.loadWorldInfoEntries(session);

    // Generate content
    const generatedContent = await runCharacterFieldGeneration({
      profileId: settings.profileId,
      userPrompt,
      buildPromptOptions,
      continueFrom,
      session,
      allCharacters: globalContext.characters,
      entriesGroupByWorldName,
      formatDescription: { content: formatDescription },
      includeUserMacro: settings.contextToSend.persona,
      maxResponseToken: settings.maxResponseToken,
      targetField,
      outputFormat: settings.outputFormat,
      additionalContentPartsForCurrentUserMessage: imageUrl
        ? [this.imageService.createImageContentPart(imageUrl)]
        : undefined,
    });

    // Update the field in session
    if (isDraft) {
      this.sessionService.updateDraftField(targetField, { value: generatedContent });
    } else {
      this.sessionService.updateField(targetField, { value: generatedContent });
    }

    return generatedContent;
  }

  /**
   * Continue generation from existing content
   */
  async continueField(options: GenerateFieldOptions): Promise<string> {
    if (!options.continueFrom?.trim()) {
      throw new Error('No content to continue from');
    }
    return this.generateField(options);
  }

  /**
   * Compare field content with character data
   */
  getFieldComparison(options: CompareFieldOptions): { originalHtml: string; newHtml: string } {
    const { currentValue, characterValue } = options;
    
    // Use diffWords from the already imported diff library in index.ts
    // For now, return the raw values - the UI will handle the diff display
    return {
      originalHtml: characterValue,
      newHtml: currentValue,
    };
  }

  /**
   * Load character data into session
   */
  async loadCharacter(characterId: string): Promise<void> {
    const context = globalContext;
    const character = context.characters[parseInt(characterId)];
    if (!character) {
      throw new Error('Selected character not found.');
    }

    const session = this.sessionService.getSession();

    // Load core character fields
    this.sessionService.updateField('name', { value: character.name ?? '' });
    this.sessionService.updateField('description', { value: character.description ?? '' });
    this.sessionService.updateField('personality', { value: character.personality ?? '' });
    this.sessionService.updateField('scenario', { value: character.scenario ?? '' });
    this.sessionService.updateField('first_mes', { value: character.first_mes ?? '' });
    this.sessionService.updateField('mes_example', { value: character.mes_example ?? '' });

    // Clear existing alternate greetings fields
    const currentSession = this.sessionService.getSession();
    Object.keys(currentSession.fields)
      .filter(fieldName => fieldName.startsWith('alternate_greetings_'))
      .forEach(fieldName => {
        delete currentSession.fields[fieldName];
      });

    // Load alternate greetings from character data
    const greetingsData = character.data?.alternate_greetings ?? [];
    if (Array.isArray(greetingsData)) {
      greetingsData.forEach((greeting: string, index: number) => {
        const number = index + 1;
        const fieldName = `alternate_greetings_${number}`;
        this.sessionService.updateField(fieldName, {
          value: greeting,
          prompt: '',
          label: `Alternate Greeting ${number}`,
        });
      });
    }

    // Clear field-specific prompts when loading a character
    Object.keys(CHARACTER_LABELS).forEach(fieldName => {
      this.sessionService.updateField(fieldName, { prompt: '' });
    });

    // Store the selected character's avatar in session
    this.sessionService.updateSession({ lastLoadedCharacterId: character.avatar });
  }

  /**
   * Reset all fields to empty
   */
  async resetFields(): Promise<void> {
    const session = this.sessionService.getSession();

    // Reset core fields
    Object.keys(CHARACTER_LABELS).forEach(fieldName => {
      this.sessionService.updateField(fieldName, { value: '', prompt: '' });
    });

    // Remove all alternate greeting fields
    const updatedSession = this.sessionService.getSession();
    Object.keys(updatedSession.fields)
      .filter(fieldName => fieldName.startsWith('alternate_greetings_'))
      .forEach(fieldName => {
        delete updatedSession.fields[fieldName];
      });

    // Reset other session data
    this.sessionService.updateSession({
      fields: updatedSession.fields,
      draftFields: {},
      creatorChatHistory: { messages: [] }
    });
  }

  /**
   * Save character as new or override existing
   */
  async saveCharacter(options: SaveCharacterOptions): Promise<void> {
    const { asNew, selectedCharacterId } = options;
    const session = this.sessionService.getSession();

    if (!session.fields.name?.value) {
      throw new Error('Please enter a name for the character.');
    }

    // Gather alternate greetings
    const alternate_greetings = Object.keys(session.fields)
      .filter(fieldName => fieldName.startsWith('alternate_greetings_'))
      .sort((a, b) => {
        const indexA = parseInt(a.split('_')[2] || '1');
        const indexB = parseInt(b.split('_')[2] || '1');
        return indexA - indexB;
      })
      .map(fieldName => session.fields[fieldName]?.value ?? '')
      .filter(value => value.trim() !== '');

    if (asNew) {
      // Create new character
      const data: FullExportData = {
        name: session.fields.name.value,
        description: session.fields.description?.value ?? '',
        personality: session.fields.personality?.value ?? '',
        scenario: session.fields.scenario?.value ?? '',
        first_mes: session.fields.first_mes?.value ?? '',
        mes_example: session.fields.mes_example?.value ?? '',
        data: {
          name: session.fields.name.value,
          description: session.fields.description?.value ?? '',
          personality: session.fields.personality?.value ?? '',
          scenario: session.fields.scenario?.value ?? '',
          first_mes: session.fields.first_mes?.value ?? '',
          mes_example: session.fields.mes_example?.value ?? '',
          tags: [],
          avatar: 'none',
          alternate_greetings,
        },
        avatar: 'none',
        tags: [],
        spec: 'chara_card_v3',
        spec_version: '3.0',
      };

      await createCharacter(data, true);
      st_echo('success', `Character "${data.name}" created successfully!`);
    } else {
      // Override existing character
      if (!selectedCharacterId) {
        throw new Error('Please load a character first to override.');
      }

      const characterToOverride = globalContext.characters[parseInt(selectedCharacterId)];
      if (!characterToOverride) {
        throw new Error('Selected character not found for override.');
      }

      const data: Character = {
        ...characterToOverride,
        name: session.fields.name.value,
        description: session.fields.description?.value ?? '',
        personality: session.fields.personality?.value ?? '',
        scenario: session.fields.scenario?.value ?? '',
        first_mes: session.fields.first_mes?.value ?? '',
        mes_example: session.fields.mes_example?.value ?? '',
        data: {
          ...characterToOverride.data,
          name: session.fields.name.value,
          description: session.fields.description?.value ?? '',
          personality: session.fields.personality?.value ?? '',
          scenario: session.fields.scenario?.value ?? '',
          first_mes: session.fields.first_mes?.value ?? '',
          mes_example: session.fields.mes_example?.value ?? '',
          alternate_greetings,
        },
      };

      await saveCharacter(data, true);
      st_echo('success', `Character "${data.name}" overridden successfully!`);
    }
  }

  /**
   * Save character as world info entry
   */
  async saveAsWorldInfo(options: SaveAsWorldInfoOptions): Promise<void> {
    const { selectedWorldName } = options;
    const session = this.sessionService.getSession();
    const settings = settingsManager.getSettings();

    if (!session.fields.name?.value) {
      throw new Error('Please enter a name for the character.');
    }

    // Gather alternate greetings for the template
    const alternate_greetings_template = Object.keys(session.fields)
      .filter(fieldName => fieldName.startsWith('alternate_greetings_'))
      .sort((a, b) => {
        const indexA = parseInt(a.split('_')[2] || '1');
        const indexB = parseInt(b.split('_')[2] || '1');
        return indexA - indexB;
      })
      .map(fieldName => session.fields[fieldName]?.value ?? '')
      .filter(value => value.trim() !== '');

    // Construct character object for template
    const characterForTemplate = {
      name: session.fields.name.value,
      description: session.fields.description?.value ?? '',
      first_mes: session.fields.first_mes?.value ?? '',
      scenario: session.fields.scenario?.value ?? '',
      personality: session.fields.personality?.value ?? '',
      mes_example: session.fields.mes_example?.value ?? '',
      alternate_greetings: alternate_greetings_template,
    };

    let content: string = '';
    try {
      const template = Handlebars.compile(settings.prompts.charDefinitions.content, {
        noEscape: true,
      });
      content = template({ character: characterForTemplate });
    } catch (error: any) {
      throw new Error(`Failed to compile character definition prompt: ${error.message}`);
    }

    const wiEntry: WIEntry = {
      uid: -1, // not necessary
      key: [session.fields.name.value],
      content,
      comment: session.fields.name.value,
      disable: false,
      keysecondary: [],
    };

    await applyWorldInfoEntry({
      entry: wiEntry,
      selectedWorldName: selectedWorldName,
      operation: 'add',
    });

    st_echo('success', 'World info entry added successfully!');
  }

  /**
   * Export draft fields to JSON
   */
  exportDraftFields(): void {
    const session = this.sessionService.getSession();
    const exportData = {
      draftFields: session.draftFields,
      timestamp: new Date().toISOString(),
      version: settingsManager.getSettings().version,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `draft-fields-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Import draft fields from JSON
   */
  async importDraftFields(file: File): Promise<void> {
    const session = this.sessionService.getSession();
    
    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      if (!importData.draftFields || typeof importData.draftFields !== 'object') {
        throw new Error('Invalid draft fields data');
      }

      let confirm = true;
      if (Object.keys(session.draftFields).length > 0) {
        confirm = await globalContext.Popup.show.confirm(
          'Import Draft Fields',
          'This will replace all existing draft fields. Continue?',
        );
      }

      if (confirm) {
        this.sessionService.updateSession({ draftFields: importData.draftFields });
        st_echo('success', 'Draft fields imported successfully');
      }
    } catch (error: any) {
      throw new Error(`Failed to import draft fields: ${error.message}`);
    }
  }

  /**
   * Process image file for field generation (consistent with chat)
   */
  async processImageFile(file: File): Promise<string> {
    return this.imageService.processImageFile(file);
  }

  /**
   * Create image preview HTML (consistent with chat)
   */
  createImagePreviewHtml(imageUrl: string): string {
    return this.imageService.createImagePreviewHtml(imageUrl);
  }

  // Private helper methods

  private getMaxContext(settings: ExtensionSettings): number | 'preset' | 'active' {
    switch (settings.maxContextType) {
      case 'custom':
        return Number(settings.maxContextValue);
      case 'profile':
        return 'preset';
      case 'sampler':
        return 'active';
      default:
        return 'preset';
    }
  }

  private applyMessageRangeOptions(buildPromptOptions: BuildPromptOptions, settings: ExtensionSettings): void {
    const msgContext = settings.contextToSend.messages;
    
    switch (msgContext.type) {
      case 'none':
        buildPromptOptions.messageIndexesBetween = { start: -1, end: -1 };
        break;
      case 'first':
        buildPromptOptions.messageIndexesBetween = { start: 0, end: msgContext.first ?? 10 };
        break;
      case 'last':
        const chatLength = globalContext.chat?.length ?? 0;
        const lastCount = msgContext.last ?? 10;
        buildPromptOptions.messageIndexesBetween = {
          end: Math.max(0, chatLength - 1),
          start: Math.max(0, chatLength - lastCount),
        };
        break;
      case 'range':
        buildPromptOptions.messageIndexesBetween = {
          start: msgContext.range?.start ?? 0,
          end: msgContext.range?.end ?? 10,
        };
        break;
      case 'all':
      default:
        break;
    }

    if (this_chid === undefined && !selected_group) {
      buildPromptOptions.messageIndexesBetween = { start: -1, end: -1 };
    }
  }

  private getFormatDescription(settings: ExtensionSettings): string {
    switch (settings.outputFormat) {
      case 'xml':
        return settings.prompts.xmlFormat.content;
      case 'json':
        return settings.prompts.jsonFormat.content;
      case 'none':
        return settings.prompts.noneFormat.content;
      default:
        return '';
    }
  }

  private async loadWorldInfoEntries(session: Session): Promise<Record<string, WIEntry[]>> {
    const entriesGroupByWorldName: Record<string, WIEntry[]> = {};
    
    await Promise.all(
      world_names
        .filter((name: string) => session.selectedWorldNames.includes(name))
        .map(async (name: string) => {
          const worldInfo = await globalContext.loadWorldInfo(name);
          if (worldInfo) {
            entriesGroupByWorldName[name] = Object.values(worldInfo.entries);
          }
        }),
    );

    return entriesGroupByWorldName;
  }
}
