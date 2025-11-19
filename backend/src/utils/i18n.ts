/**
 * Internationalization (i18n) Utility
 *
 * Multi-language support for global clinical trials
 * Vendor parity: All vendors (global trial support)
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

interface Translation {
  [key: string]: string | Translation;
}

interface Translations {
  [locale: string]: Translation;
}

class I18nService {
  private translations: Translations = {};
  private defaultLocale = 'en';
  private supportedLocales = [
    'en',    // English
    'es',    // Spanish
    'fr',    // French
    'de',    // German
    'it',    // Italian
    'pt',    // Portuguese
    'ja',    // Japanese
    'zh',    // Chinese
    'ko',    // Korean
    'ar',    // Arabic
    'ru',    // Russian
    'pl',    // Polish
    'nl',    // Dutch
    'sv',    // Swedish
    'da',    // Danish
    'no',    // Norwegian
    'fi',    // Finnish
  ];

  constructor() {
    this.loadTranslations();
  }

  /**
   * Load translation files
   */
  private loadTranslations(): void {
    const localesDir = path.join(__dirname, '../../locales');

    if (!fs.existsSync(localesDir)) {
      logger.warn('Locales directory not found, creating with defaults');
      this.createDefaultTranslations();
      return;
    }

    this.supportedLocales.forEach(locale => {
      try {
        const filePath = path.join(localesDir, `${locale}.json`);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          this.translations[locale] = JSON.parse(content);
        }
      } catch (error) {
        logger.error(`Failed to load translations for ${locale}:`, error);
      }
    });

    logger.info(`Loaded translations for ${Object.keys(this.translations).length} locales`);
  }

  /**
   * Create default translation files
   */
  private createDefaultTranslations(): void {
    const defaultTranslations = {
      common: {
        yes: 'Yes',
        no: 'No',
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        edit: 'Edit',
        search: 'Search',
        loading: 'Loading...',
        error: 'Error',
        success: 'Success',
      },
      auth: {
        login: 'Login',
        logout: 'Logout',
        email: 'Email',
        password: 'Password',
        forgotPassword: 'Forgot Password?',
        invalidCredentials: 'Invalid email or password',
      },
      study: {
        study: 'Study',
        studies: 'Studies',
        protocol: 'Protocol',
        phase: 'Phase',
        status: 'Status',
        enrollment: 'Enrollment',
      },
      patient: {
        patient: 'Patient',
        patients: 'Patients',
        screening: 'Screening',
        enrollment: 'Enrollment',
        randomization: 'Randomization',
        withdrawal: 'Withdrawal',
      },
      randomization: {
        randomize: 'Randomize',
        randomized: 'Randomized',
        treatmentArm: 'Treatment Arm',
        randomizationNumber: 'Randomization Number',
      },
      supply: {
        supply: 'Supply',
        inventory: 'Inventory',
        shipment: 'Shipment',
        kit: 'Kit',
        available: 'Available',
        allocated: 'Allocated',
        dispensed: 'Dispensed',
      },
      notifications: {
        lowStock: 'Low stock alert',
        criticalStock: 'Critical stock alert',
        patientEnrolled: 'Patient enrolled',
        randomizationComplete: 'Randomization complete',
      },
      validation: {
        required: 'This field is required',
        invalidEmail: 'Invalid email address',
        invalidPhone: 'Invalid phone number',
        invalidDate: 'Invalid date',
        minLength: 'Minimum length is {min}',
        maxLength: 'Maximum length is {max}',
      },
    };

    this.translations['en'] = defaultTranslations;
  }

  /**
   * Translate a key
   */
  t(key: string, locale?: string, params?: Record<string, any>): string {
    const lang = locale || this.defaultLocale;

    // Get translation
    let translation = this.getNestedTranslation(this.translations[lang], key);

    // Fallback to default locale
    if (!translation && lang !== this.defaultLocale) {
      translation = this.getNestedTranslation(this.translations[this.defaultLocale], key);
    }

    // Fallback to key if no translation found
    if (!translation) {
      logger.warn(`Translation not found for key: ${key} (locale: ${lang})`);
      return key;
    }

    // Replace parameters
    if (params) {
      Object.keys(params).forEach(param => {
        translation = translation.replace(`{${param}}`, params[param]);
      });
    }

    return translation;
  }

  /**
   * Get nested translation
   */
  private getNestedTranslation(obj: Translation | undefined, key: string): string {
    if (!obj) return '';

    const keys = key.split('.');
    let current: any = obj;

    for (const k of keys) {
      if (current[k] === undefined) {
        return '';
      }
      current = current[k];
    }

    return typeof current === 'string' ? current : '';
  }

  /**
   * Get supported locales
   */
  getSupportedLocales(): string[] {
    return this.supportedLocales;
  }

  /**
   * Detect user locale from browser/system
   */
  detectLocale(acceptLanguage?: string): string {
    if (!acceptLanguage) {
      return this.defaultLocale;
    }

    // Parse Accept-Language header
    const languages = acceptLanguage.split(',').map(lang => {
      const parts = lang.trim().split(';');
      return parts[0].split('-')[0]; // Extract primary language code
    });

    // Find first supported language
    for (const lang of languages) {
      if (this.supportedLocales.includes(lang)) {
        return lang;
      }
    }

    return this.defaultLocale;
  }

  /**
   * Format date for locale
   */
  formatDate(date: Date, locale?: string, format?: 'short' | 'long' | 'full'): string {
    const lang = locale || this.defaultLocale;

    const options: Intl.DateTimeFormatOptions = format === 'full'
      ? { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
      : format === 'long'
      ? { year: 'numeric', month: 'long', day: 'numeric' }
      : { year: 'numeric', month: 'numeric', day: 'numeric' };

    return new Intl.DateTimeFormat(lang, options).format(date);
  }

  /**
   * Format number for locale
   */
  formatNumber(number: number, locale?: string, decimals?: number): string {
    const lang = locale || this.defaultLocale;

    return new Intl.NumberFormat(lang, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(number);
  }

  /**
   * Format currency for locale
   */
  formatCurrency(amount: number, currency: string, locale?: string): string {
    const lang = locale || this.defaultLocale;

    return new Intl.NumberFormat(lang, {
      style: 'currency',
      currency,
    }).format(amount);
  }

  /**
   * Get translation for email template
   */
  getEmailTemplate(templateName: string, locale: string): {
    subject: string;
    body: string;
  } {
    // In production, load from email templates directory
    return {
      subject: this.t(`email.${templateName}.subject`, locale),
      body: this.t(`email.${templateName}.body`, locale),
    };
  }

  /**
   * Translate informed consent
   */
  async translateConsent(consentId: string, targetLocale: string): Promise<any> {
    logger.info(`Translating consent ${consentId} to ${targetLocale}`);

    // In production, integrate with professional translation service
    // For clinical documents, certified translation is required

    return {
      consentId,
      locale: targetLocale,
      status: 'PENDING_TRANSLATION',
      translationService: 'Professional Medical Translation Service',
    };
  }
}

export const i18n = new I18nService();

/**
 * Express middleware for i18n
 */
export const i18nMiddleware = (req: any, res: any, next: any) => {
  // Detect locale from Accept-Language header or query param
  const locale = req.query.lang || i18n.detectLocale(req.headers['accept-language']);

  // Attach translation function to request
  req.t = (key: string, params?: Record<string, any>) => i18n.t(key, locale, params);
  req.locale = locale;

  next();
};

export default i18n;
