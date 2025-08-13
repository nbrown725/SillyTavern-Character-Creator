import { CharacterController } from '../controllers/characterController.js';
import { SessionService } from '../services/sessionService.js';
import { st_echo } from 'sillytavern-utils-lib/config';

export interface FieldElements {
  textarea: HTMLTextAreaElement;
  generateButton?: HTMLButtonElement;
  continueButton?: HTMLButtonElement;
  compareButton?: HTMLButtonElement;
  clearButton?: HTMLButtonElement;
  promptTextarea?: HTMLTextAreaElement;
}

export interface FieldBindingOptions {
  fieldName: string;
  isDraft?: boolean;
  getCharacterValue?: () => string;
}

/**
 * Utility class for common UI operations and bindings
 */
export class UIHelpers {
  private static characterController = CharacterController.getInstance();
  private static sessionService = SessionService.getInstance();

  /**
   * Bind all common field operations (generate, continue, compare, clear) to their respective buttons
   */
  static bindFieldOperations(elements: FieldElements, options: FieldBindingOptions): void {
    const { fieldName, isDraft = false, getCharacterValue } = options;
    const { textarea, generateButton, continueButton, compareButton, clearButton } = elements;

    // Generate button
    if (generateButton) {
      generateButton.addEventListener('click', () => {
        this.handleFieldGeneration({
          targetField: fieldName,
          button: generateButton,
          textarea,
          isDraft,
        });
      });
    }

    // Continue button
    if (continueButton) {
      continueButton.addEventListener('click', () => {
        if (!textarea.value.trim()) {
          st_echo('warning', 'No content to continue from');
          return;
        }
        this.handleFieldGeneration({
          targetField: fieldName,
          button: continueButton,
          textarea,
          isDraft,
          continueFrom: textarea.value,
        });
      });
    }

    // Compare button
    if (compareButton && getCharacterValue) {
      compareButton.addEventListener('click', () => {
        this.handleFieldComparison(fieldName, textarea.value, getCharacterValue());
      });
    }

    // Clear button
    if (clearButton) {
      clearButton.addEventListener('click', () => {
        textarea.value = '';
        textarea.dispatchEvent(new Event('change'));
      });
    }
  }

  /**
   * Handle field generation with consistent error handling and UI state management
   */
  static async handleFieldGeneration(options: {
    targetField: string;
    button: HTMLButtonElement;
    textarea: HTMLTextAreaElement;
    isDraft?: boolean;
    continueFrom?: string;
  }): Promise<void> {
    const { targetField, button, textarea, isDraft = false, continueFrom } = options;

    // Disable button and show loading state
    button.disabled = true;
    const originalIcon = button.innerHTML;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
      const userPrompt = (document.querySelector('#charCreator_prompt') as HTMLTextAreaElement)?.value || '';

      const generatedContent = continueFrom
        ? await this.characterController.continueField({
            targetField,
            userPrompt,
            continueFrom,
            isDraft,
          })
        : await this.characterController.generateField({
            targetField,
            userPrompt,
            isDraft,
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

  /**
   * Handle field comparison with diff display
   */
  static async handleFieldComparison(fieldName: string, currentValue: string, characterValue: string): Promise<void> {
    const { diffWords } = await import('diff');
    
    const mainDiv = document.createElement('div');
    mainDiv.classList.add('compare-popup');
    
    const title = document.createElement('h3');
    title.textContent = `Compare ${fieldName}`;
    mainDiv.appendChild(title);
    
    const diff = diffWords(characterValue, currentValue);
    
    const originalDiv = document.createElement('div');
    originalDiv.innerHTML = '<h4>Original (Character)</h4>';
    const originalContent = document.createElement('div');
    originalContent.classList.add('diff-content');
    
    const newDiv = document.createElement('div');
    newDiv.innerHTML = '<h4>New (Current)</h4>';
    const newContent = document.createElement('div');
    newContent.classList.add('diff-content');
    
    diff.forEach((part) => {
      const span = document.createElement('span');
      span.textContent = part.value;
      
      if (part.added) {
        span.style.backgroundColor = '#d4edda';
        span.style.color = '#155724';
        newContent.appendChild(span);
      } else if (part.removed) {
        span.style.backgroundColor = '#f8d7da';
        span.style.color = '#721c24';
        originalContent.appendChild(span);
      } else {
        const originalSpan = span.cloneNode(true);
        originalContent.appendChild(originalSpan);
        newContent.appendChild(span);
      }
    });
    
    originalDiv.appendChild(originalContent);
    newDiv.appendChild(newContent);
    mainDiv.appendChild(originalDiv);
    mainDiv.appendChild(newDiv);
    
    const { globalContext } = await import('../generate.js');
    const { POPUP_TYPE } = await import('sillytavern-utils-lib/types/popup');
    await globalContext.callGenericPopup(mainDiv, POPUP_TYPE.DISPLAY, undefined, {
      wide: true,
    });
  }

  /**
   * Create a consistent text change handler that updates session storage
   */
  static createTextChangeHandler(fieldName: string, isDraft: boolean = false): (event: Event) => void {
    return (event: Event) => {
      const textarea = event.target as HTMLTextAreaElement;
      const value = textarea.value;
      
      if (isDraft) {
        this.sessionService.updateDraftField(fieldName, { value });
      } else {
        this.sessionService.updateField(fieldName, { value });
      }
    };
  }

  /**
   * Create a consistent prompt change handler that updates session storage
   */
  static createPromptChangeHandler(fieldName: string, isDraft: boolean = false): (event: Event) => void {
    return (event: Event) => {
      const textarea = event.target as HTMLTextAreaElement;
      const prompt = textarea.value;
      
      if (isDraft) {
        this.sessionService.updateDraftField(fieldName, { prompt });
      } else {
        this.sessionService.updateField(fieldName, { prompt });
      }
    };
  }

  /**
   * Show a confirmation dialog with consistent styling
   */
  static async showConfirmation(title: string, message: string): Promise<boolean> {
    const { globalContext } = await import('../generate.js');
    return globalContext.Popup.show.confirm(title, message);
  }

  /**
   * Show an input dialog with consistent styling
   */
  static async showInput(title: string, defaultValue: string = ''): Promise<string | null> {
    const { globalContext } = await import('../generate.js');
    return globalContext.Popup.show.input(title, defaultValue);
  }

  /**
   * Disable/enable a button with loading state
   */
  static setButtonLoading(button: HTMLButtonElement, loading: boolean, originalContent?: string): void {
    if (loading) {
      button.disabled = true;
      if (!button.dataset.originalContent) {
        button.dataset.originalContent = button.innerHTML;
      }
      button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    } else {
      button.disabled = false;
      button.innerHTML = button.dataset.originalContent || originalContent || button.innerHTML;
      delete button.dataset.originalContent;
    }
  }

  /**
   * Get the current user prompt from the main prompt textarea
   */
  static getUserPrompt(): string {
    const promptTextarea = document.querySelector('#charCreator_prompt') as HTMLTextAreaElement;
    return promptTextarea?.value || '';
  }

  /**
   * Find field elements by fieldName with consistent selectors
   */
  static findFieldElements(fieldName: string, container?: Element): FieldElements | null {
    const baseSelector = container || document;
    
    const textarea = baseSelector.querySelector(`[data-field="${fieldName}"] textarea, .${fieldName}-textarea`) as HTMLTextAreaElement;
    if (!textarea) return null;

    return {
      textarea,
      generateButton: baseSelector.querySelector(`[data-field="${fieldName}"] .generate-button, .${fieldName}-generate`) as HTMLButtonElement,
      continueButton: baseSelector.querySelector(`[data-field="${fieldName}"] .continue-button, .${fieldName}-continue`) as HTMLButtonElement,
      compareButton: baseSelector.querySelector(`[data-field="${fieldName}"] .compare-button, .${fieldName}-compare`) as HTMLButtonElement,
      clearButton: baseSelector.querySelector(`[data-field="${fieldName}"] .clear-button, .${fieldName}-clear`) as HTMLButtonElement,
      promptTextarea: baseSelector.querySelector(`[data-field="${fieldName}"] .prompt-textarea, .${fieldName}-prompt`) as HTMLTextAreaElement,
    };
  }
}
