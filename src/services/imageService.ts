import { ContentPart } from '../types.js';

export class ImageService {
  private static instance: ImageService;

  static getInstance(): ImageService {
    if (!ImageService.instance) {
      ImageService.instance = new ImageService();
    }
    return ImageService.instance;
  }

  private constructor() {}

  /**
   * Generate a unique ID for an image
   */
  generateImageId(): string {
    return `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create a compressed thumbnail for storage
   */
  async createThumbnail(imageDataUrl: string, maxWidth: number = 200, maxHeight: number = 200, quality: number = 0.7): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Calculate new dimensions maintaining aspect ratio
        let { width, height } = img;
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);
        const thumbnail = canvas.toDataURL('image/jpeg', quality);
        resolve(thumbnail);
      };
      img.onerror = () => reject(new Error('Failed to load image for thumbnail creation'));
      img.src = imageDataUrl;
    });
  }

  /**
   * Convert image data URL to content part format
   */
  createImageContentPart(imageUrl: string, detail: 'auto' | 'low' | 'high' = 'auto'): ContentPart {
    return {
      type: 'image_url',
      image_url: {
        url: imageUrl,
        detail,
      },
    };
  }

  /**
   * Create content parts array for a message with optional image
   */
  createMessageContentParts(text: string, imageUrl?: string): string | ContentPart[] {
    if (!imageUrl) {
      return text;
    }

    const parts: ContentPart[] = [];
    
    if (text.trim()) {
      parts.push({
        type: 'text',
        text: text.trim(),
      });
    }

    parts.push(this.createImageContentPart(imageUrl));

    return parts;
  }

  /**
   * Extract text content from content parts
   */
  extractTextFromContentParts(content: string | ContentPart[]): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('');
    }

    return '';
  }

  /**
   * Extract image URL from content parts
   */
  extractImageFromContentParts(content: string | ContentPart[]): string | undefined {
    if (typeof content === 'string') {
      return undefined;
    }

    if (Array.isArray(content)) {
      const imagePart = content.find(part => part.type === 'image_url');
      return imagePart?.image_url?.url;
    }

    return undefined;
  }

  /**
   * Validate image file and convert to data URL
   */
  async processImageFile(file: File): Promise<string> {
    if (!file.type.startsWith('image/')) {
      throw new Error('Please select an image file.');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.onerror = () => {
        reject(new Error('Failed to read image file.'));
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Create image preview HTML
   */
  createImagePreviewHtml(imageUrl: string, altText: string = 'inline image'): string {
    return `<div class="inline-image" style="margin-top:6px;">
      <img src="${imageUrl}" alt="${altText}" style="max-width: 200px; max-height: 200px; border:1px solid var(--SmartThemeBorderColor); border-radius:4px;"/>
    </div>`;
  }
}
