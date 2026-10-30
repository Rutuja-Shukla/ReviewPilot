import { SupportedLanguage } from '../../../src/types/review.js';
import { LanguageAdapter } from './types.js';
import { TypeScriptAdapter } from './typescriptAdapter.js';
import { JavaScriptAdapter } from './javascriptAdapter.js';
import { PythonAdapter } from './pythonAdapter.js';
import { JavaAdapter } from './javaAdapter.js';
import { CSharpAdapter } from './csharpAdapter.js';

export class LanguageAdapterRegistry {
  private adapters = new Map<SupportedLanguage, LanguageAdapter>();

  constructor() {
    this.registerDefaultAdapters();
  }

  private registerDefaultAdapters(): void {
    this.register(new TypeScriptAdapter());
    this.register(new JavaScriptAdapter());
    this.register(new PythonAdapter());
    this.register(new JavaAdapter());
    this.register(new CSharpAdapter());
  }

  public register(adapter: LanguageAdapter): void {
    this.adapters.set(adapter.language, adapter);
  }

  public getAdapter(language: SupportedLanguage): LanguageAdapter {
    const adapter = this.adapters.get(language);
    if (!adapter) {
      throw new Error(`No language adapter registered for language: "${language}"`);
    }
    return adapter;
  }

  public getAdapterOrNull(language: string): LanguageAdapter | null {
    return this.adapters.get(language as SupportedLanguage) || null;
  }

  public hasAdapter(language: string): boolean {
    return this.adapters.has(language as SupportedLanguage);
  }

  public getSupportedLanguages(): SupportedLanguage[] {
    return Array.from(this.adapters.keys());
  }

  public getAllAdapters(): LanguageAdapter[] {
    return Array.from(this.adapters.values());
  }
}

export const languageAdapterRegistry = new LanguageAdapterRegistry();
