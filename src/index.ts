import {
  applyWorldInfoEntry,
  buildFancyDropdown,
  buildPresetSelect,
  BuildPromptOptions,
  createCharacter,
  DropdownItem,
} from 'sillytavern-utils-lib';
import { selected_group, st_echo, this_chid, world_names } from 'sillytavern-utils-lib/config';
import { POPUP_TYPE } from 'sillytavern-utils-lib/types/popup';

import {
  globalContext,
  runCharacterFieldGeneration,
  Session,
  ContextToSend,
  CharacterFieldName,
  CHARACTER_FIELDS,
  CharacterField,
  CHARACTER_LABELS,
} from './generate.js';

import {
  extensionName,
  settingsManager,
  OutputFormat,
  SYSTEM_PROMPT_KEYS,
  DEFAULT_PROMPT_CONTENTS,
  PromptSetting,
  convertToVariableName,
  VERSION,
} from './settings.js';
import { DEFAULT_MAIN_CONTEXT_TEMPLATE } from './constants.js';
import { Character, FullExportData } from 'sillytavern-utils-lib/types';
import { WIEntry } from 'sillytavern-utils-lib/types/world-info';

// @ts-ignore
import { Handlebars } from '../../../../../lib.js';
if (!Handlebars.helpers['join']) {
  Handlebars.registerHelper('join', function (array: any, separator: any) {
    if (Array.isArray(array)) {
      return array.join(typeof separator === 'string' ? separator : ', ');
    }
    return '';
  });
}

Handlebars.registerHelper('ifValue', function (this: any, conditional: any, options: any) {
  if (conditional && String(conditional).trim().length > 0) {
    return options.fn(this);
  } else {
    return options.inverse(this);
  }
});

async function handleSettingsUI() {
  const settingsHtml = await globalContext.renderExtensionTemplateAsync(
    `third-party/${extensionName}`,
    'templates/settings',
  );
  $('#extensions_settings').append(settingsHtml);

  const settingsContainer = document.querySelector('.charCreator_settings');
  if (!settingsContainer) return;

  const settings = settingsManager.getSettings();

  // --- Setup Main Context Template ---
  {
    const promptSelect = settingsContainer.querySelector('#charCreator_mainContextTemplatePreset') as HTMLSelectElement;
    const promptTextarea = settingsContainer.querySelector(
      '#charCreator_mainContextTemplateContent',
    ) as HTMLTextAreaElement;
    const restoreMainContextTemplateButton = settingsContainer.querySelector(
      '#charCreator_restoreMainContextTemplateDefault',
    ) as HTMLButtonElement;

    promptTextarea.value = settings.mainContextTemplatePresets[settings.mainContextTemplatePreset]?.content;
    buildPresetSelect('#charCreator_mainContextTemplatePreset', {
      initialList: Object.keys(settings.mainContextTemplatePresets),
      initialValue: settings.mainContextTemplatePreset,
      readOnlyValues: ['default'],
      onSelectChange(_, newValue) {
        const newPresetValue = newValue ?? 'default';
        promptTextarea.value = settings.mainContextTemplatePresets[newPresetValue].content;

        settings.mainContextTemplatePreset = newPresetValue;
        settingsManager.saveSettings();
      },
      create: {
        onAfterCreate(value) {
          let currentPreset = settings.mainContextTemplatePresets[settings.mainContextTemplatePreset];
          if (!currentPreset) {
            currentPreset = settings.mainContextTemplatePresets['default'];
          }
          settings.mainContextTemplatePresets[value] = structuredClone(currentPreset);
        },
      },
      rename: {
        onAfterRename(previousValue, newValue) {
          settings.mainContextTemplatePresets[newValue] = settings.mainContextTemplatePresets[previousValue];
          delete settings.mainContextTemplatePresets[previousValue];
        },
      },
      delete: {
        onAfterDelete(value) {
          delete settings.mainContextTemplatePresets[value];
        },
      },
    });

    promptTextarea.addEventListener('change', () => {
      const currentPreset = settings.mainContextTemplatePresets[settings.mainContextTemplatePreset];
      currentPreset.content = promptTextarea.value;
      settingsManager.saveSettings();
    });

    restoreMainContextTemplateButton.addEventListener('click', async () => {
      const confirm = await globalContext.Popup.show.confirm(
        'Restore default',
        'Are you sure you want to restore the default prompt?',
      );
      if (!confirm) {
        return;
      }

      settings.mainContextTemplatePresets['default'] = {
        content: DEFAULT_MAIN_CONTEXT_TEMPLATE,
      };
      if (promptSelect.value !== 'default') {
        promptSelect.value = 'default';
        promptSelect.dispatchEvent(new Event('change'));
      } else {
        promptTextarea.value = DEFAULT_MAIN_CONTEXT_TEMPLATE;
        settingsManager.saveSettings();
      }
    });
  }

  // --- Setup Consolidated System Prompts ---
  {
    const promptSelect = settingsContainer.querySelector('#charCreator_systemPromptPreset') as HTMLSelectElement;
    const promptTextarea = settingsContainer.querySelector('#charCreator_systemPromptContent') as HTMLTextAreaElement;
    const restoreSystemPromptButton = settingsContainer.querySelector(
      '#charCreator_restoreSystemPromptDefault',
    ) as HTMLButtonElement;

    buildPresetSelect('#charCreator_systemPromptPreset', {
      initialList: Object.keys(settings.prompts),
      readOnlyValues: SYSTEM_PROMPT_KEYS,
      initialValue: SYSTEM_PROMPT_KEYS[0],
      label(value) {
        if (value === '') {
          return 'prompt';
        }

        const promptSetting = settings.prompts[value];
        if (promptSetting) {
          return `${promptSetting.label} (${value})`;
        }
        return value;
      },
      create: {
        onBeforeCreate(value) {
          const variableName = convertToVariableName(value);
          if (!variableName) {
            st_echo('error', `Invalid prompt name: ${value}`);
            return false;
          }
          if (settings.prompts[variableName]) {
            st_echo('error', `Prompt name already exists: ${variableName}`);
            return false;
          }

          return true;
        },
        onAfterCreate(value) {
          const variableName = convertToVariableName(value);
          settings.prompts[variableName] = {
            content: promptTextarea.value,
            isDefault: false,
            label: value,
          };

          return variableName;
        },
      },
      rename: {
        onBeforeRename(_previousValue, newValue) {
          const variableName = convertToVariableName(newValue);
          if (!variableName) {
            st_echo('error', `Invalid prompt name: ${newValue}`);
            return false;
          }
          if (settings.prompts[variableName]) {
            st_echo('error', `Prompt name already exists: ${variableName}`);
            return false;
          }

          return true;
        },
        onAfterRename(previousValue, newValue) {
          const filteredValue = convertToVariableName(newValue);
          settings.prompts[filteredValue] = { ...settings.prompts[previousValue], label: newValue };
          delete settings.prompts[previousValue];
          return filteredValue;
        },
      },
      delete: {
        onAfterDelete(value) {
          delete settings.prompts[value];
        },
      },
      onSelectChange(_, newValue) {
        const newPresetValue = newValue ?? '';
        const promptSetting: PromptSetting | undefined = settings.prompts[newPresetValue];
        if (promptSetting) {
          promptTextarea.value = promptSetting.content ?? '';
          restoreSystemPromptButton.style.display = SYSTEM_PROMPT_KEYS.includes(newPresetValue) ? 'block' : 'none';
          settingsManager.saveSettings();
        }
      },
    });

    // Initial state
    const selectedKey = promptSelect.value;
    const prompSetting: PromptSetting | undefined = settings.prompts[selectedKey];
    if (prompSetting) {
      promptTextarea.value = prompSetting.content ?? '';
      restoreSystemPromptButton.style.display = SYSTEM_PROMPT_KEYS.includes(selectedKey) ? 'block' : 'none';
    }

    // Event listener for textarea change
    promptTextarea.addEventListener('change', () => {
      const selectedKey = promptSelect.value;
      const currentContent = promptTextarea.value;

      const prompSetting: PromptSetting | undefined = settings.prompts[selectedKey];
      if (prompSetting) {
        prompSetting.content = currentContent;
        prompSetting.isDefault = SYSTEM_PROMPT_KEYS.includes(selectedKey)
          ? DEFAULT_PROMPT_CONTENTS[selectedKey] === currentContent
          : false;
        restoreSystemPromptButton.style.display = SYSTEM_PROMPT_KEYS.includes(selectedKey) ? 'block' : 'none';
        settingsManager.saveSettings();
      }
    });

    restoreSystemPromptButton.addEventListener('click', async () => {
      const selectedKey = promptSelect.value;
      const defaultContent = DEFAULT_PROMPT_CONTENTS[selectedKey];
      const promptSetting: PromptSetting | undefined = settings.prompts[selectedKey];
      if (promptSetting) {
        const confirm = await globalContext.Popup.show.confirm(
          'Restore Default',
          `Are you sure you want to restore the default for "${promptSetting.label}"?`,
        );
        if (confirm) {
          promptTextarea.value = defaultContent;
          promptTextarea.dispatchEvent(new Event('change'));
        }
      } else {
        st_echo('warning', 'No prompt selected.');
      }
    });
  }

  const showSaveAsWorldInfoCheckbox = settingsContainer.querySelector(
    '#charCreator_showSaveAsWorldInfo',
  ) as HTMLInputElement;
  if (showSaveAsWorldInfoCheckbox) {
    showSaveAsWorldInfoCheckbox.checked = settings.showSaveAsWorldInfoEntry.show;
    showSaveAsWorldInfoCheckbox.addEventListener('change', () => {
      settings.showSaveAsWorldInfoEntry.show = showSaveAsWorldInfoCheckbox.checked;
      settingsManager.saveSettings();
    });
  }
}

async function handlePopupUI() {
  const iconHtml = `<div class="menu_button fa-solid fa-user-astronaut interactable charCreator-icon" title="Character Creator"></div>`;

  $('.form_create_bottom_buttons_block').prepend(iconHtml);
  $('#GroupFavDelOkBack').prepend(iconHtml); // Add to group management too if needed
  $('#form_character_search_form').prepend(iconHtml);

  const popupIcons = document.querySelectorAll('.charCreator-icon');

  popupIcons.forEach((icon) => {
    icon.addEventListener('click', async () => {
      const popupHtml = await globalContext.renderExtensionTemplateAsync(
        `third-party/${extensionName}`,
        'templates/popup',
      );
      globalContext.callGenericPopup(popupHtml, POPUP_TYPE.DISPLAY, undefined, {
        large: true,
        wide: true,
      });

      const popupContainer = document.getElementById('charCreatorPopup');
      if (!popupContainer) return;

      const settings = settingsManager.getSettings();

      // --- Setup Left Column ---

      // Connection Profile Dropdown
      globalContext.ConnectionManagerRequestService.handleDropdown(
        '#charCreatorPopup #charCreator_connectionProfile',
        settings.profileId,
        (profile: any) => {
          settings.profileId = profile?.id ?? '';
          settingsManager.saveSettings();
        },
      );

      // Context Sending Options
      const stDescriptionCheckbox = popupContainer.querySelector('#charCreator_stDescription') as HTMLInputElement;
      const includeCharsCheckbox = popupContainer.querySelector('#charCreator_includeChars') as HTMLInputElement;
      const includeCharsContainer = popupContainer.querySelector('#charCreator_charIncludeContainer') as HTMLDivElement;
      const includeWorldInfoCheckbox = popupContainer.querySelector(
        '#charCreator_includeWorldInfo',
      ) as HTMLInputElement;
      const includeWorldInfoContainer = popupContainer.querySelector(
        '#charCreator_worldInfoIncludeContainer',
      ) as HTMLDivElement;
      const includeExistingFieldsCheckbox = popupContainer.querySelector(
        '#charCreator_includeExistingFields',
      ) as HTMLInputElement;

      stDescriptionCheckbox.checked = settings.contextToSend.stDescription;
      includeCharsCheckbox.checked = settings.contextToSend.charCard;
      includeExistingFieldsCheckbox.checked = settings.contextToSend.existingFields;
      includeWorldInfoCheckbox.checked = settings.contextToSend.worldInfo;

      includeCharsContainer.style.display = includeCharsCheckbox.checked ? 'block' : 'none';
      includeWorldInfoContainer.style.display = includeWorldInfoCheckbox.checked ? 'block' : 'none';

      stDescriptionCheckbox.addEventListener('change', () => {
        settings.contextToSend.stDescription = stDescriptionCheckbox.checked;
        settingsManager.saveSettings();
      });
      includeCharsCheckbox.addEventListener('change', () => {
        settings.contextToSend.charCard = includeCharsCheckbox.checked;
        includeCharsContainer.style.display = includeCharsCheckbox.checked ? 'block' : 'none';
        settingsManager.saveSettings();
      });
      includeWorldInfoCheckbox.addEventListener('change', () => {
        settings.contextToSend.worldInfo = includeWorldInfoCheckbox.checked;
        includeWorldInfoContainer.style.display = includeWorldInfoCheckbox.checked ? 'block' : 'none';
        settingsManager.saveSettings();
      });
      includeExistingFieldsCheckbox.addEventListener('change', () => {
        settings.contextToSend.existingFields = includeExistingFieldsCheckbox.checked;
        settingsManager.saveSettings();
      });

      // Message Options Setup
      const messageOptionsContainer = popupContainer.querySelector('.message-options') as HTMLDivElement;
      const messageTypeSelect = popupContainer.querySelector('#charCreator_messageType') as HTMLSelectElement;
      const firstXDiv = popupContainer.querySelector('#charCreator_firstX') as HTMLElement;
      const lastXDiv = popupContainer.querySelector('#charCreator_lastX') as HTMLElement;
      const rangeXDiv = popupContainer.querySelector('#charCreator_rangeX') as HTMLElement;
      const firstXInput = popupContainer.querySelector('#charCreator_firstXMessages') as HTMLInputElement;
      const lastXInput = popupContainer.querySelector('#charCreator_lastXMessages') as HTMLInputElement;
      const rangeStartInput = popupContainer.querySelector('#charCreator_rangeStart') as HTMLInputElement;
      const rangeEndInput = popupContainer.querySelector('#charCreator_rangeEnd') as HTMLInputElement;

      messageTypeSelect.value = settings.contextToSend.messages.type;
      firstXInput.value = String(settings.contextToSend.messages.first ?? 10);
      lastXInput.value = String(settings.contextToSend.messages.last ?? 10);
      rangeStartInput.value = String(settings.contextToSend.messages.range?.start ?? 0);
      rangeEndInput.value = String(settings.contextToSend.messages.range?.end ?? 10);

      const updateMessageInputVisibility = (type: string) => {
        firstXDiv.style.display = type === 'first' ? 'block' : 'none';
        lastXDiv.style.display = type === 'last' ? 'block' : 'none';
        rangeXDiv.style.display = type === 'range' ? 'block' : 'none';
      };
      updateMessageInputVisibility(messageTypeSelect.value);
      if (settings.contextToSend.messages.type === 'none' && this_chid === undefined && !selected_group) {
        messageOptionsContainer.style.display = 'none';
      }

      messageTypeSelect.addEventListener('change', () => {
        const type = messageTypeSelect.value as ContextToSend['messages']['type'];
        settings.contextToSend.messages.type = type;
        settingsManager.saveSettings();
        updateMessageInputVisibility(type);
      });
      firstXInput.addEventListener('change', () => {
        settings.contextToSend.messages.first = parseInt(firstXInput.value) || 10;
        settingsManager.saveSettings();
      });
      lastXInput.addEventListener('change', () => {
        settings.contextToSend.messages.last = parseInt(lastXInput.value) || 10;
        settingsManager.saveSettings();
      });
      rangeStartInput.addEventListener('change', () => {
        settings.contextToSend.messages.range = {
          start: parseInt(rangeStartInput.value) || 0,
          end: settings.contextToSend.messages.range?.end ?? 10,
        };
        settingsManager.saveSettings();
      });
      rangeEndInput.addEventListener('change', () => {
        settings.contextToSend.messages.range = {
          start: settings.contextToSend.messages.range?.start ?? 0,
          end: parseInt(rangeEndInput.value) || 10,
        };
        settingsManager.saveSettings();
      });

      // Max Context Options
      const maxContextTypeSelect = popupContainer.querySelector('#charCreator_maxContextType') as HTMLSelectElement;
      const maxTokensContainer = popupContainer.querySelector('#charCreator_maxTokens_container') as HTMLElement;
      const maxTokensInput = popupContainer.querySelector('#charCreator_maxTokens') as HTMLInputElement;

      maxContextTypeSelect.value = settings.maxContextType;
      maxTokensContainer.style.display = settings.maxContextType === 'custom' ? 'block' : 'none';
      maxTokensInput.value = String(settings.maxContextValue);

      maxContextTypeSelect.addEventListener('change', () => {
        const value = maxContextTypeSelect.value as 'profile' | 'sampler' | 'custom';
        settings.maxContextType = value;
        settingsManager.saveSettings();
        maxTokensContainer.style.display = value === 'custom' ? 'block' : 'none';
      });
      maxTokensInput.addEventListener('change', () => {
        settings.maxContextValue = Number(maxTokensInput.value) || 16384;
        settingsManager.saveSettings();
      });

      // Max Response Tokens
      const maxResponseTokensInput = popupContainer.querySelector('#charCreator_maxResponseTokens') as HTMLInputElement;
      maxResponseTokensInput.value = String(settings.maxResponseToken);
      maxResponseTokensInput.addEventListener('change', () => {
        settings.maxResponseToken = Number(maxResponseTokensInput.value) || 1024;
        settingsManager.saveSettings();
      });

      // Output Format Select
      const outputFormatSelect = popupContainer.querySelector('#charCreator_outputFormat') as HTMLSelectElement;
      outputFormatSelect.value = settings.outputFormat;
      outputFormatSelect.addEventListener('change', () => {
        settings.outputFormat = outputFormatSelect.value as OutputFormat;
        settingsManager.saveSettings();
      });

      // --- Setup Character Context ---
      const sessionKey = `charCreator`;
      const activeSession: Session = JSON.parse(localStorage.getItem(sessionKey) ?? '{}');
      if (!activeSession.selectedCharacterIndexes) {
        activeSession.selectedCharacterIndexes = this_chid ? [this_chid] : [];
      }
      if (!activeSession.selectedWorldNames) {
        activeSession.selectedWorldNames = [];
      }
      if (!activeSession.fields) {
        // @ts-ignore
        activeSession.fields = {};
      }
      if (!activeSession.draftFields) {
        activeSession.draftFields = {};
      }
      CHARACTER_FIELDS.forEach((field) => {
        if (!activeSession.fields[field]) {
          activeSession.fields[field] = {
            value: '',
            prompt: '',
            label: '',
          };
        }
      });
      const saveSession = () => {
        localStorage.setItem(sessionKey, JSON.stringify(activeSession));
      };

      const context = SillyTavern.getContext();

      activeSession.selectedCharacterIndexes = activeSession.selectedCharacterIndexes.filter(
        (chid) => context.characters[Number(chid)],
      );

      // "Characters to Include" Dropdown
      const charSelectorContainer = popupContainer.querySelector('#charCreator_characterSelector');
      if (charSelectorContainer) {
        const characterItems: DropdownItem[] = context.characters.map((char: Character) => ({
          value: context.characters.indexOf(char).toString(),
          label: char.name,
        }));

        buildFancyDropdown('#charCreator_characterSelector', {
          initialList: characterItems,
          initialValues: activeSession.selectedCharacterIndexes,
          placeholderText: 'Select characters...',
          enableSearch: characterItems.length > 10,
          onSelectChange: (_previousValues: string[], newValues: string[]) => {
            activeSession.selectedCharacterIndexes = newValues;
            saveSession();
          },
        });
      }

      // "Lorebooks to Include" Dropdown
      const worldInfoSelectorContainer = popupContainer.querySelector('#charCreator_worldInfoSelector');
      let allWorldNames: string[] = structuredClone(world_names);
      try {
        if (worldInfoSelectorContainer && allWorldNames.length > 0) {
          buildFancyDropdown('#charCreator_worldInfoSelector', {
            initialList: allWorldNames,
            initialValues: activeSession.selectedWorldNames,
            placeholderText: 'Select lorebooks...',
            enableSearch: allWorldNames.length > 10,
            onSelectChange: (_previousValues: string[], newValues: string[]) => {
              activeSession.selectedWorldNames = newValues;
              saveSession();
            },
          });
        } else if (worldInfoSelectorContainer) {
          worldInfoSelectorContainer.textContent = 'No active lorebooks found.';
        }
      } catch (error) {
        console.error('Failed to get active world info:', error);
        if (worldInfoSelectorContainer) {
          worldInfoSelectorContainer.textContent = 'Error loading lorebooks.';
        }
      }

      // Additional Instructions / Prompt Preset
      const promptTextarea = popupContainer.querySelector('#charCreator_prompt') as HTMLTextAreaElement;
      buildPresetSelect('#charCreatorPopup #charCreator_promptPreset', {
        initialValue: settings.promptPreset,
        initialList: Object.keys(settings.promptPresets),
        readOnlyValues: ['default'],
        onSelectChange: async (_previousValue, newValue) => {
          const newPresetValue = newValue ?? 'default';
          settings.promptPreset = newPresetValue;
          settingsManager.saveSettings();
          promptTextarea.value = settings.promptPresets[newPresetValue]?.content ?? '';
        },
        create: {
          onAfterCreate: (value) => {
            const currentPreset = settings.promptPresets[settings.promptPreset];
            settings.promptPresets[value] = {
              content: currentPreset?.content ?? '',
            };
          },
        },
        rename: {
          onAfterRename: (previousValue, newValue) => {
            settings.promptPresets[newValue] = settings.promptPresets[previousValue];
            delete settings.promptPresets[previousValue];
          },
        },
        delete: {
          onAfterDelete: (value) => {
            delete settings.promptPresets[value];
          },
        },
      });
      promptTextarea.value = settings.promptPresets[settings.promptPreset]?.content ?? '';
      promptTextarea.addEventListener('change', () => {
        if (settings.promptPresets[settings.promptPreset]) {
          settings.promptPresets[settings.promptPreset].content = promptTextarea.value;
          settingsManager.saveSettings();
        }
      });

      // --- Setup Right Column (Character Fields) ---

      // Define field configurations
      const fieldConfigs = {
        name: { label: CHARACTER_LABELS.name, rows: 1, large: false, promptEnabled: false },
        description: { label: CHARACTER_LABELS.description, rows: 5, large: true, promptEnabled: true },
        personality: { label: CHARACTER_LABELS.personality, rows: 4, large: true, promptEnabled: true },
        scenario: { label: CHARACTER_LABELS.scenario, rows: 3, large: true, promptEnabled: true },
        first_mes: { label: CHARACTER_LABELS.first_mes, rows: 3, large: true, promptEnabled: true },
        mes_example: { label: CHARACTER_LABELS.mes_example, rows: 6, large: true, promptEnabled: true },
      };

      // Get template and container
      const coreFieldTemplate = popupContainer.querySelector('#charCreator_coreFieldTemplate') as HTMLTemplateElement;
      const draftFieldTemplate = popupContainer.querySelector('#charCreator_draftFieldTemplate') as HTMLTemplateElement;
      const coreFieldsContainer = popupContainer.querySelector('#charCreator_coreFieldsContainer') as HTMLDivElement;
      const draftFieldsList = popupContainer.querySelector('#charCreator_draftFieldsList') as HTMLDivElement;
      const tabButtons = popupContainer.querySelectorAll('.tab-button');
      const tabContents = popupContainer.querySelectorAll('.tab-content');
      const addDraftFieldButton = popupContainer.querySelector('#charCreator_addDraftField') as HTMLButtonElement;
      const exportDraftFieldsButton = popupContainer.querySelector(
        '#charCreator_exportDraftFields',
      ) as HTMLButtonElement;
      const importDraftFieldsButton = popupContainer.querySelector(
        '#charCreator_importDraftFields',
      ) as HTMLButtonElement;

      // Initialize storage for field elements
      // @ts-ignore
      const coreFieldElements: Record<
        CharacterFieldName,
        {
          textarea: HTMLTextAreaElement;
          button: HTMLButtonElement;
          promptTextarea?: HTMLTextAreaElement;
        }
      > = {};

      // --- Tab Switching Logic ---
      const setActiveTab = (targetTabId: string) => {
        tabButtons.forEach((button) => {
          button.classList.toggle('active', button.getAttribute('data-tab') === targetTabId);
        });
        tabContents.forEach((content) => {
          content.classList.toggle('active', content.id === targetTabId);
        });
        const isDraft = targetTabId === 'charCreator_draftFieldsContainer';
        addDraftFieldButton.style.display = isDraft ? 'block' : 'none';
        exportDraftFieldsButton.style.display = isDraft ? 'block' : 'none';
        importDraftFieldsButton.style.display = isDraft ? 'block' : 'none';
      };

      tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
          const targetTabId = button.getAttribute('data-tab');
          if (targetTabId) {
            setActiveTab(targetTabId);
          }
        });
      });

      setActiveTab('charCreator_coreFieldsContainer');

      // Generate core fields from template
      CHARACTER_FIELDS.forEach((fieldName) => {
        const config = fieldConfigs[fieldName];
        const clone = coreFieldTemplate.content.cloneNode(true) as DocumentFragment;

        // Configure the cloned elements
        const fieldDiv = clone.querySelector('.character-field') as HTMLElement;
        const label = clone.querySelector('label') as HTMLLabelElement;
        const textarea = clone.querySelector('.field-value-textarea') as HTMLTextAreaElement; // Use specific class
        const button = clone.querySelector('.generate-field-button') as HTMLButtonElement;
        const promptTextarea = clone.querySelector('.field-prompt-textarea') as HTMLTextAreaElement; // Use specific class

        // Set IDs and attributes
        textarea.id = `charCreator_field_${fieldName}`;
        promptTextarea.id = `charCreator_prompt_${fieldName}`;
        label.textContent = config.label;
        label.htmlFor = textarea.id; // Set label 'for' attribute

        // Set content
        textarea.rows = config.rows;
        textarea.value = activeSession.fields[fieldName]?.value ?? '';
        button.dataset.field = fieldName;
        button.title = `Generate ${config.label}`;
        promptTextarea.placeholder = `Enter additional prompt for ${config.label.toLowerCase()}...`;
        promptTextarea.value = activeSession.fields[fieldName]?.prompt ?? '';

        if (!config.promptEnabled) {
          promptTextarea.closest('.field-prompt-container')?.remove();
        }

        if (config.large) {
          textarea.closest('.field-container')?.classList.add('large-field');
        }

        // Store references
        coreFieldElements[fieldName] = {
          textarea,
          button,
          promptTextarea,
        };

        coreFieldsContainer.appendChild(clone);
      });

      // --- Render Draft Fields ---
      const renderDraftField = (fieldName: string, fieldData: CharacterField) => {
        if (!draftFieldTemplate || !draftFieldsList) return;

        const clone = draftFieldTemplate.content.cloneNode(true) as DocumentFragment;
        const fieldDiv = clone.querySelector('.character-field') as HTMLElement;
        const label = clone.querySelector('label') as HTMLLabelElement;
        const textarea = clone.querySelector('.field-value-textarea') as HTMLTextAreaElement;
        const promptTextarea = clone.querySelector('.field-prompt-textarea') as HTMLTextAreaElement;
        const deleteButton = clone.querySelector('.delete-draft-field-button') as HTMLButtonElement;
        const generateButton = clone.querySelector('.generate-field-button') as HTMLButtonElement;

        fieldDiv.dataset.draftFieldName = fieldName;
        label.textContent = fieldData.label; // Use the key as the label for now
        label.htmlFor = `charCreator_draft_field_${fieldName}`;
        textarea.id = `charCreator_draft_field_${fieldName}`;
        textarea.value = fieldData.value ?? '';
        promptTextarea.value = fieldData.prompt ?? '';
        promptTextarea.id = `charCreator_draft_prompt_${fieldName}`;
        promptTextarea.placeholder = `Enter additional prompt for ${fieldData.label}...`;
        deleteButton.dataset.draftFieldName = fieldName;
        generateButton.dataset.field = fieldName;

        // Event listener for value change
        textarea.addEventListener('change', () => {
          if (activeSession.draftFields[fieldName]) {
            activeSession.draftFields[fieldName].value = textarea.value;
            saveSession();
          }
        });

        // Event listener for prompt change
        promptTextarea.addEventListener('change', () => {
          if (activeSession.draftFields[fieldName]) {
            activeSession.draftFields[fieldName].prompt = promptTextarea.value;
            saveSession();
          }
        });

        // Event listener for delete button
        deleteButton.addEventListener('click', async () => {
          const confirm = await globalContext.Popup.show.confirm(
            'Delete Draft Field',
            `Are you sure you want to delete the draft field "${fieldData.label}"? This cannot be undone.`,
          );
          if (confirm) {
            delete activeSession.draftFields[fieldName];
            fieldDiv.remove();
            saveSession();
          }
        });

        generateButton.addEventListener('click', () => {
          handleFieldGeneration({
            targetField: fieldName,
            button: generateButton,
            textarea,
            isDraft: true,
          });
        });

        draftFieldsList.appendChild(clone);
      };

      const renderAllDraftFields = () => {
        if (!draftFieldsList) return;
        draftFieldsList.innerHTML = ''; // Clear existing draft fields
        Object.entries(activeSession.draftFields || {}).forEach(([name, data]) => {
          renderDraftField(name, data);
        });
      };

      // Initial rendering of draft fields
      renderAllDraftFields();

      // --- Export/Import Draft Fields Logic ---
      exportDraftFieldsButton?.addEventListener('click', () => {
        const exportData = {
          draftFields: activeSession.draftFields,
          timestamp: new Date().toISOString(),
          version: VERSION,
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
      });

      importDraftFieldsButton?.addEventListener('click', async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.addEventListener('change', async () => {
          const file = input.files?.[0];
          if (!file) return;

          try {
            const text = await file.text();
            const importData = JSON.parse(text);

            if (!importData.draftFields || typeof importData.draftFields !== 'object') {
              throw new Error('Invalid draft fields data');
            }

            let confirm = true;
            if (Object.keys(activeSession.draftFields).length > 0) {
              confirm = await globalContext.Popup.show.confirm(
                'Import Draft Fields',
                'This will replace all existing draft fields. Continue?',
              );
            }

            if (confirm) {
              activeSession.draftFields = importData.draftFields;
              saveSession();
              renderAllDraftFields();
              st_echo('success', 'Draft fields imported successfully');
            }
          } catch (error: any) {
            st_echo('error', `Failed to import draft fields: ${error.message}`);
          }
        });

        input.click();
      });

      // --- Add Draft Field Button Logic ---
      if (addDraftFieldButton) {
        addDraftFieldButton.addEventListener('click', async () => {
          const fieldNameInput = await globalContext.Popup.show.input('Enter Draft Field Name', '');
          if (!fieldNameInput || !fieldNameInput.trim()) {
            return;
          }
          const fieldName = convertToVariableName(fieldNameInput.trim()); // Sanitize name
          if (!fieldName) {
            st_echo('error', 'Invalid field name provided.');
            return;
          }

          if (activeSession.draftFields[fieldName] || fieldConfigs[fieldName as CharacterFieldName]) {
            st_echo('warning', `Field name "${fieldName}" already exists.`);
            return;
          }

          // Add the new draft field
          activeSession.draftFields[fieldName] = { value: '', prompt: '', label: fieldNameInput };
          renderDraftField(fieldName, activeSession.draftFields[fieldName]);
          saveSession();
        });
      }

      // --- Button Actions ---
      // Setup Load Character Dropdown
      const loadCharSelectorContainer = popupContainer.querySelector('#charCreator_loadCharSelector');
      if (loadCharSelectorContainer) {
        const characterItems: DropdownItem[] = context.characters.map((char: Character) => ({
          value: context.characters.indexOf(char).toString(),
          label: char.name,
        }));

        buildFancyDropdown('#charCreator_loadCharSelector', {
          initialList: characterItems,
          initialValues: [],
          placeholderText: 'Load Character Data...',
          enableSearch: characterItems.length > 10,
          multiple: false,
          closeOnSelect: true,
          async onBeforeSelection(_currentValues, proposedValues) {
            if (proposedValues.length === 0) return false;
            const selectedId = proposedValues[0];
            if (selectedId.length === 0) return false;

            const allFieldEmpty = CHARACTER_FIELDS.every((fieldName) => {
              const textarea = coreFieldElements[fieldName]?.textarea;
              return textarea && textarea.value.trim() === '';
            });

            if (!allFieldEmpty) {
              const confirm = await globalContext.Popup.show.confirm(
                'Load Character Data',
                'Are you sure you want to overwrite existing data? This cannot be undone.',
              );
              if (!confirm) return false;
            }

            return true;
          },
          onSelectChange: async (_previousValues: string[], newValues: string[]) => {
            if (newValues.length === 0) return;
            const selectedId = newValues[0];
            if (selectedId.length === 0) return;

            const character = context.characters[parseInt(selectedId)];
            if (!character) {
              st_echo('warning', 'Selected character not found.');
              return;
            }

            // Load the character fields
            CHARACTER_FIELDS.forEach((fieldName) => {
              const textarea = coreFieldElements[fieldName]?.textarea;
              const promptTextarea = coreFieldElements[fieldName]?.promptTextarea;

              if (textarea) {
                // @ts-ignore
                textarea.value = character[fieldName] ?? '';
                textarea.dispatchEvent(new Event('change'));
              }
              if (promptTextarea && promptTextarea.value.trim() !== '') {
                promptTextarea.value = '';
                promptTextarea.dispatchEvent(new Event('change'));
              }
            });
          },
        });
      }

      const resetButton = popupContainer.querySelector('#charCreator_reset') as HTMLButtonElement;
      resetButton.addEventListener('click', async () => {
        const confirm = await globalContext.Popup.show.confirm(
          'Reset Fields',
          'Are you sure? This will reset core fields and remove draft fields. This cannot be undone.',
        );
        if (confirm) {
          CHARACTER_FIELDS.forEach((fieldName) => {
            if (coreFieldElements[fieldName]?.textarea) {
              coreFieldElements[fieldName].textarea.value = '';
              coreFieldElements[fieldName].textarea.dispatchEvent(new Event('change'));
            }
            if (coreFieldElements[fieldName]?.promptTextarea) {
              coreFieldElements[fieldName].promptTextarea.value = '';
              coreFieldElements[fieldName].promptTextarea.dispatchEvent(new Event('change'));
            }
          });

          activeSession.draftFields = {};
          saveSession();
          renderAllDraftFields();
        }
      });

      const saveAsNewCharacterButton = popupContainer.querySelector(
        '#charCreator_saveAsNewCharacter',
      ) as HTMLButtonElement;
      saveAsNewCharacterButton.addEventListener('click', async () => {
        if (!activeSession.fields.name.value) {
          st_echo('warning', 'Please enter a name for the new character.');
          return;
        }
        const confirm = await globalContext.Popup.show.confirm('Save as New Character', `Are you sure?`);
        if (!confirm) return;
        const data: FullExportData = {
          name: activeSession.fields.name.value,
          description: activeSession.fields.description.value,
          personality: activeSession.fields.personality.value,
          scenario: activeSession.fields.scenario.value,
          first_mes: activeSession.fields.first_mes.value,
          mes_example: activeSession.fields.mes_example.value,
          data: {
            name: activeSession.fields.name.value,
            description: activeSession.fields.description.value,
            personality: activeSession.fields.personality.value,
            scenario: activeSession.fields.scenario.value,
            first_mes: activeSession.fields.first_mes.value,
            mes_example: activeSession.fields.mes_example.value,
            tags: [],
            avatar: 'none',
          },
          avatar: 'none',
          tags: [],
          spec: 'chara_card_v3',
          spec_version: '3.0',
        };
        try {
          await createCharacter(data, true);
        } catch (error: any) {
          st_echo('error', `Failed to create character: ${error.message}`);
        }
      });

      const saveAsWorldInfoEntrySelector = popupContainer.querySelector(
        '#charCreator_saveAsWorldInfoSelector',
      ) as HTMLSelectElement;

      // Hide the selector if the feature is disabled in settings
      if (!settings.showSaveAsWorldInfoEntry.show) {
        saveAsWorldInfoEntrySelector.style.display = 'none';
      } else {
        const { close } = buildFancyDropdown(saveAsWorldInfoEntrySelector, {
          placeholderText: 'Save as World Info Entry',
          initialList: world_names,
          closeOnSelect: true,
          multiple: false,
          enableSearch: true,
          async onBeforeSelection(_currentValues, proposedValues) {
            if (proposedValues.length === 0) return false;

            const character: Character = {
              name: activeSession.fields.name.value,
              description: activeSession.fields.description.value,
              first_mes: activeSession.fields.first_mes.value,
              scenario: activeSession.fields.scenario.value,
              personality: activeSession.fields.personality.value,
              mes_example: activeSession.fields.mes_example.value,
              avatar: 'none',
            };
            if (!character.name) {
              st_echo('warning', 'Please enter a name for the character.');
              close();
              return false;
            }

            let content: string = '';
            try {
              const template = Handlebars.compile(settings.prompts.charDefinition.content, {
                noEscape: true,
              });
              content = template({ character });
            } catch (error: any) {
              console.error(`Failed to compile character definition prompt: ${error.message}`);
              st_echo('error', `Failed to compile character definition prompt: ${error.message}`);
              close();
              return false;
            }

            const selectedWorldName = proposedValues[0];
            const wiEntry: WIEntry = {
              uid: -1, // not necessary
              key: [activeSession.fields.name.value],
              content,
              comment: activeSession.fields.name.value,
              disable: false,
            };
            try {
              await applyWorldInfoEntry({
                entry: wiEntry,
                selectedWorldName: selectedWorldName,
                operation: 'add',
              });
              st_echo('success', 'Entry added');
            } catch (error: any) {
              st_echo('error', `Failed to create world info entry: ${error.message}`);
            }

            close();
            return false;
          },
        });
      }

      // --- Generation Logic ---
      // Shared function to handle field generation
      async function handleFieldGeneration(options: {
        targetField: string;
        button: HTMLButtonElement;
        textarea: HTMLTextAreaElement;
        isDraft?: boolean;
      }) {
        const { targetField, button, textarea, isDraft = false } = options;

        // Disable button and show loading state
        button.disabled = true;
        const originalIcon = button.innerHTML;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        try {
          // @ts-ignore
          const userPrompt = (popupContainer.querySelector('#charCreator_prompt') as HTMLTextAreaElement).value;

          if (!settings.profileId) {
            st_echo('warning', 'Please select a connection profile.');
            return;
          }

          const profile = context.extensionSettings.connectionManager?.profiles?.find(
            (p: any) => p.id === settings.profileId,
          );
          if (!profile) {
            st_echo('warning', 'Connection profile not found.');
            return;
          }

          const buildPromptOptions: BuildPromptOptions = {
            presetName: profile?.preset,
            contextName: profile?.context,
            instructName: profile?.instruct,
            targetCharacterId: this_chid,
            ignoreCharacterFields: true,
            ignoreWorldInfo: true,
            ignoreAuthorNote: true,
            maxContext:
              settings.maxContextType === 'custom'
                ? settings.maxContextValue
                : settings.maxContextType === 'profile'
                  ? 'preset'
                  : 'active',
            includeNames: !!selected_group,
          };

          // Add message range options
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

          const entriesGroupByWorldName: Record<string, WIEntry[]> = {};
          // Use Promise.all for parallel loading
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

          // For draft fields, prepare session with specific prompt
          let sessionForGeneration: Session;

          // Create a new fields object with proper typing
          // @ts-ignore
          const typedFields: Record<CharacterFieldName, CharacterField> = {};
          for (const field of CHARACTER_FIELDS) {
            typedFields[field] = {
              prompt: activeSession.fields[field].prompt,
              value: activeSession.fields[field].value,
              label: CHARACTER_LABELS[field],
            };
          }

          sessionForGeneration = {
            ...activeSession,
            fields: typedFields,
          };

          const generatedContent = await runCharacterFieldGeneration({
            profileId: settings.profileId,
            userPrompt: userPrompt,
            buildPromptOptions: buildPromptOptions,
            contextToSend: settings.contextToSend,
            session: sessionForGeneration,
            allCharacters: context.characters,
            entriesGroupByWorldName: entriesGroupByWorldName,
            promptSettings: settings.prompts,
            formatDescription: {
              content: formatDescription,
            },
            mainContextTemplate: settings.mainContextTemplatePresets[settings.mainContextTemplatePreset].content,
            maxResponseToken: settings.maxResponseToken,
            targetField: targetField,
            outputFormat: settings.outputFormat,
          });

          textarea.value = generatedContent;
          textarea.dispatchEvent(new Event('change'));
        } catch (error: any) {
          console.error(`Error generating field ${targetField}:`, error);
          st_echo('error', `Failed to generate ${targetField}: ${error.message || error}`);
        } finally {
          button.disabled = false;
          button.innerHTML = originalIcon;
        }
      }

      // Setup core field event listeners
      Object.entries(coreFieldElements).forEach(([fieldName, { textarea, button, promptTextarea }]) => {
        if (button) {
          button.addEventListener('click', () => {
            handleFieldGeneration({
              targetField: fieldName as CharacterFieldName,
              button,
              textarea,
            });
          });

          textarea.addEventListener('change', () => {
            const field = fieldName as CharacterFieldName;
            activeSession.fields[field] = {
              ...activeSession.fields[field],
              value: textarea.value,
            };
            saveSession();
          });

          promptTextarea?.addEventListener('change', () => {
            const field = fieldName as CharacterFieldName;
            activeSession.fields[field] = {
              ...activeSession.fields[field],
              prompt: promptTextarea.value,
            };
            saveSession();
          });
        }
      });
    });
  });
}

function stagingCheck(): boolean {
  if (!globalContext.ConnectionManagerRequestService) return false;
  return true;
}

function main() {
  handleSettingsUI();
  handlePopupUI();
}

if (!stagingCheck()) {
  st_echo('error', `[${extensionName}] Make sure you are on staging branch and staging is updated.`);
} else {
  settingsManager
    .initializeSettings()
    .then((result) => {
      const settings = settingsManager.getSettings();
      let settingsChanged = false;

      if (result.formatVersion.changed) {
        // Perform migration only if old settings exist and format version has changed
        if (result.oldSettings && result.formatVersion.changed) {
          console.log(
            `[${extensionName}] Migrating settings from format ${result.formatVersion.old} to ${result.formatVersion.new}`,
          );
          settingsChanged = true; // Assume change if migration logic runs

          // Helper to migrate a single prompt
          const migratePrompt = (
            newKey: keyof typeof settings.prompts,
            oldContentKey: string,
            oldDefaultFlagKey: string,
          ) => {
            if (result.oldSettings[oldContentKey] !== undefined) {
              settings.prompts[newKey].content = result.oldSettings[oldContentKey];
              // Determine isDefault based on the old flag OR by comparing content if flag is missing
              if (result.oldSettings[oldDefaultFlagKey] !== undefined) {
                settings.prompts[newKey].isDefault = result.oldSettings[oldDefaultFlagKey];
              } else {
                // Fallback: compare content if the old flag doesn't exist
                settings.prompts[newKey].isDefault =
                  result.oldSettings[oldContentKey] === DEFAULT_PROMPT_CONTENTS[newKey];
              }
              // Delete the old keys from the potentially merged settings object
              delete (settings as any)[oldContentKey];
              delete (settings as any)[oldDefaultFlagKey];
            } else if ((settings as any)[oldContentKey] !== undefined) {
              // Cleanup merged keys even if not in oldSettings explicitly
              delete (settings as any)[oldContentKey];
              delete (settings as any)[oldDefaultFlagKey];
            }
          };

          // Migrate all prompts using the helper
          migratePrompt('stCharCard', 'stCharCardPrompt', 'usingDefaultStCharCardPrompt');
          migratePrompt('charDefinition', 'charCardDefinitionPrompt', 'usingDefaultCharCardDefinitionPrompt');
          migratePrompt('lorebookDefinition', 'lorebookDefinitionPrompt', 'usingDefaultLorebookDefinitionPrompt');
          migratePrompt('xmlFormat', 'xmlFormatDesc', 'usingDefaultXmlFormatDesc');
          migratePrompt('jsonFormat', 'jsonFormatDesc', 'usingDefaultJsonFormatDesc');
          migratePrompt('noneFormat', 'noneFormatDesc', 'usingDefaultNoneFormatDesc');

          // Migrate worldInfoCharDefinition
          const oldWIEntry = result.oldSettings.showSaveAsWorldInfoEntry;
          const oldWIContentKey = 'characterDefinitionPrompt';
          const oldWIDefaultKey = 'usingDefaultCharacterDefinitionPrompt';
          if (oldWIEntry && oldWIEntry[oldWIContentKey] !== undefined) {
            settings.prompts.worldInfoCharDefinition.content = oldWIEntry[oldWIContentKey];
            if (oldWIEntry[oldWIDefaultKey] !== undefined) {
              settings.prompts.worldInfoCharDefinition.isDefault = oldWIEntry[oldWIDefaultKey];
            } else {
              settings.prompts.worldInfoCharDefinition.isDefault =
                oldWIEntry[oldWIContentKey] === DEFAULT_PROMPT_CONTENTS.worldInfoCharDefinition;
            }
          }
          // Clean up old nested keys from the current settings object regardless
          if (settings.showSaveAsWorldInfoEntry) {
            if ((settings.showSaveAsWorldInfoEntry as any)[oldWIContentKey] !== undefined) {
              delete (settings.showSaveAsWorldInfoEntry as any)[oldWIContentKey];
            }
            if ((settings.showSaveAsWorldInfoEntry as any)[oldWIDefaultKey] !== undefined) {
              delete (settings.showSaveAsWorldInfoEntry as any)[oldWIDefaultKey];
            }
          }
        }
      }
      if (result.version.changed) {
        Object.entries(DEFAULT_PROMPT_CONTENTS).forEach(([key, defaultContent]) => {
          const promptKey = key as keyof typeof DEFAULT_PROMPT_CONTENTS;
          const currentSetting = settings.prompts[promptKey];

          if (currentSetting && currentSetting.isDefault && currentSetting.content !== defaultContent) {
            console.log(`[${extensionName}] Updating default for prompt: ${promptKey}`);
            settings.prompts[promptKey].content = defaultContent;
            settingsChanged = true;
          }
        });
      }

      if (settingsChanged) {
        console.log(`[${extensionName}] Data migration complete. Saving settings...`);
        settingsManager.saveSettings();
      }
      main();
    })
    .catch((error) => {
      console.error(`[${extensionName}] Error initializing settings:`, error);
      st_echo('error', `[${extensionName}] Failed to initialize settings: ${error.message}`);
      globalContext.Popup.show
        .confirm(
          `[${extensionName}] Failed to load settings. This might be due to an update. Reset settings to default?`,
          'Extension Error',
        )
        .then((result: boolean) => {
          if (result) {
            settingsManager.resetSettings();
            st_echo('success', `[${extensionName}] Settings reset. Reloading may be required.`);
            main();
          }
        });
    });
}
