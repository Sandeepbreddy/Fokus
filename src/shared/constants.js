// src/shared/constants.js - Application constants
export const APP_CONFIG = {
    name: 'Fokus',
    version: '1.0.0',
    description: 'Content blocking extension with cloud sync'
};

export const STORAGE_KEYS = {
    PIN: 'pin',
    BLOCKED_KEYWORDS: 'blockedKeywords',
    CUSTOM_DOMAINS: 'customDomains',
    BLOCKED_DOMAINS: 'blockedDomains',
    IS_ACTIVE: 'isActive',
    BLOCKS_TODAY: 'blocksToday',
    FOCUS_STREAK: 'focusStreak',
    TOTAL_BLOCKS: 'totalBlocks',
    LAST_BLOCK_DATE: 'lastBlockDate',
    LAST_GITHUB_UPDATE: 'lastGithubUpdate',
    BLOCKLIST_SOURCES: 'blocklistSources',
    BLOCKLIST_RESULTS: 'blocklistResults',
    ERROR_LOG: 'errorLog',
    SUPABASE_SESSION: 'supabaseSession',
    OFFLINE_MODE: 'offlineMode',
    OFFLINE_EXPIRY: 'offlineExpiry',
    OFFLINE_EMAIL: 'offlineEmail',
    LAST_CLOUD_SYNC: 'lastCloudSync'
};

export const MESSAGE_TYPES = {
    GET_AUTH_STATUS: 'getAuthStatus',
    SIGN_IN: 'signIn',
    SIGN_UP: 'signUp',
    SIGN_OUT: 'signOut',
    SYNC_TO_CLOUD: 'syncToCloud',
    SYNC_FROM_CLOUD: 'syncFromCloud',
    FETCH_BLOCKLIST: 'fetchBlocklist',
    ADD_CUSTOM_DOMAIN: 'addCustomDomain',
    REMOVE_CUSTOM_DOMAIN: 'removeCustomDomain',
    ADD_DOMAIN_FROM_TAB: 'addDomainFromTab',
    ADD_KEYWORD: 'addKeyword',
    REMOVE_KEYWORD: 'removeKeyword',
    SET_ACTIVE: 'setActive',
    GET_CURRENT_TAB: 'getCurrentTab',
    GET_BLOCKED_PAGE_URL: 'getBlockedPageUrl'
};

export const DEFAULT_KEYWORDS = [
    'adult', 'porn', 'xxx', 'sex', 'nude', 'naked', 'nsfw',
    'explicit', 'mature', 'erotic', 'hardcore', 'softcore',
    'fuck', 'fucking', 'fucked', 'anal', 'oral', 'blowjob',
    'handjob', 'masturbat', 'orgasm', 'climax', 'cumshot',
    'penis', 'vagina', 'breast', 'boob', 'tit', 'ass', 'butt',
    'cock', 'dick', 'pussy', 'clit', 'nipple',
    'bdsm', 'bondage', 'fetish', 'kink', 'domination', 'submission',
    'slave', 'master', 'mistress', 'torture', 'whip',
    'lesbian', 'gay', 'homo', 'bisexual', 'trans', 'shemale',
    'milf', 'teen', 'young', 'old', 'mature',
    'escort', 'prostitut', 'hooker', 'stripper', 'webcam',
    'camgirl', 'camboy', 'livecam', 'chaturbate'
];

export const DEFAULT_BLOCKLISTS = [
    {
        id: 'stevenblack-porn',
        name: 'StevenBlack Adult Content',
        url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts',
        description: 'Community-maintained adult content blocklist (12,000+ domains)',
        enabled: true,
        isDefault: true
    },
    {
        id: 'stevenblack-gambling',
        name: 'StevenBlack Gambling',
        url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/gambling-only/hosts',
        description: 'Community-maintained gambling sites blocklist',
        enabled: false,
        isDefault: true
    },
    {
        id: 'stevenblack-social',
        name: 'StevenBlack Social Media',
        url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/social-only/hosts',
        description: 'Community-maintained social media blocklist',
        enabled: false,
        isDefault: true
    }
];

export const TIMEOUTS = {
    FETCH_TIMEOUT: 10000,
    CACHE_TIMEOUT: 10000,
    BATCH_WRITE_INTERVAL: 500,
    TAB_CACHE_TIMEOUT: 30000,
    SYNC_DEBOUNCE: 2000
};

export const LIMITS = {
    MAX_RETRIES: 3,
    MAX_ERRORS_STORED: 50,
    MAX_BACKUPS: 50,
    TAB_CACHE_SIZE: 100,
    BLOCKLIST_CACHE_EXPIRY: 3600000 // 1 hour
};

export const WHITELIST_DOMAINS = [
    'chrome.google.com',
    'addons.mozilla.org',
    'microsoftedge.microsoft.com',
    'chrome-extension',
    'moz-extension',
    'edge-extension'
];

export const SEARCH_ENGINES = [
    'google.com',
    'bing.com',
    'duckduckgo.com',
    'yahoo.com',
    'baidu.com',
    'yandex'
];

export const BLOCKED_REASONS = {
    DOMAIN: 'domain',
    KEYWORD: 'keyword',
    SEARCH: 'search'
};

export const RESPONSE_STATUS = {
    SUCCESS: 'success',
    ERROR: 'error',
    INFO: 'info'
};