export type SupportedLanguage = 'en' | 'ur' | 'es' | 'ar';

export interface LanguagePack {
  code: SupportedLanguage;
  label: string;
  nativeLabel: string;
  rtl: boolean;
  strings: {
    dashboard: string;
    focusMode: string;
    dailyDigest: string;
    clients: string;
    projects: string;
    tasks: string;
    invoices: string;
    vault: string;
    portal: string;
    security: string;
    helpAndPlans: string;
    offlineLocalDb: string;
  };
}

export const LANGUAGE_PACKS: Record<SupportedLanguage, LanguagePack> = {
  en: {
    code: 'en',
    label: 'English',
    nativeLabel: 'English',
    rtl: false,
    strings: {
      dashboard: 'Dashboard',
      focusMode: 'Focus Mode',
      dailyDigest: 'Daily Digest',
      clients: 'Clients',
      projects: 'Projects',
      tasks: 'Tasks',
      invoices: 'Invoices',
      vault: 'Document Vault',
      portal: 'Client Portal',
      security: 'Security Center',
      helpAndPlans: 'Help, Tour & Plans',
      offlineLocalDb: 'Offline · Local DB',
    },
  },
  ur: {
    code: 'ur',
    label: 'Urdu (RTL)',
    nativeLabel: 'اردو',
    rtl: true,
    strings: {
      dashboard: 'ڈیش بورڈ',
      focusMode: 'فوکس موڈ',
      dailyDigest: 'یومیہ خلاصہ',
      clients: 'کلائنٹس',
      projects: 'پروجیکٹس',
      tasks: 'کام',
      invoices: 'انوائسز',
      vault: 'دستاویز والٹ',
      portal: 'کلائنٹ پورٹل',
      security: 'سیکیورٹی سینٹر',
      helpAndPlans: 'مدد، ٹور اور پلانز',
      offlineLocalDb: 'آف لائن · لوکل ڈی بی',
    },
  },
  es: {
    code: 'es',
    label: 'Spanish',
    nativeLabel: 'Español',
    rtl: false,
    strings: {
      dashboard: 'Panel Principal',
      focusMode: 'Modo Enfoque',
      dailyDigest: 'Resumen Diario',
      clients: 'Clientes',
      projects: 'Proyectos',
      tasks: 'Tareas',
      invoices: 'Facturas',
      vault: 'Bóveda Documental',
      portal: 'Portal de Cliente',
      security: 'Centro de Seguridad',
      helpAndPlans: 'Ayuda, Tour y Planes',
      offlineLocalDb: 'Sin conexión · BD Local',
    },
  },
  ar: {
    code: 'ar',
    label: 'Arabic (RTL)',
    nativeLabel: 'العربية',
    rtl: true,
    strings: {
      dashboard: 'لوحة التحكم',
      focusMode: 'وضع التركيز',
      dailyDigest: 'الملخص اليومي',
      clients: 'العملاء',
      projects: 'المشاريع',
      tasks: 'المهام',
      invoices: 'الفواتير',
      vault: 'خزنة المستندات',
      portal: 'بوابة العميل',
      security: 'مركز الأمان',
      helpAndPlans: 'المساعدة والخطط',
      offlineLocalDb: 'غير متصل · قاعدة محلية',
    },
  },
};

export function getLanguagePack(code?: string): LanguagePack {
  if (code && code in LANGUAGE_PACKS) {
    return LANGUAGE_PACKS[code as SupportedLanguage];
  }
  return LANGUAGE_PACKS.en;
}
