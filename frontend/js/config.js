/**
 * Super Dashboard Configuration
 * Environment-aware settings for staging and production
 */

const CONFIG = {
    // API Configuration
    API: {
        // Cloudflare Worker Backend
        BASE_URL: 'https://super-dashboard-api.jalen1wa.workers.dev',

        // Endpoints
        ENDPOINTS: {
            // CRM
            CUSTOMERS: '/api/customers',

            // Invoices
            INVOICES: '/api/invoices',

            // Calendar/Events
            EVENTS: '/api/events',

            // Tasks
            TASKS: '/api/tasks',

            // Bookmarks
            BOOKMARKS: '/api/bookmarks',

            // Notes/Wiki
            NOTES: '/api/notes',

            // Files (R2)
            FILES: '/api/files',
            UPLOAD: '/api/files/upload',

            // WebRTC Signaling
            WEBRTC_ROOMS: '/api/webrtc/rooms',

            // Analytics
            ANALYTICS: '/api/analytics',

            // System
            HEALTH: '/api/health',
            STATUS: '/api/status'
        },

        // Request Options
        DEFAULT_HEADERS: {
            'Content-Type': 'application/json'
        },

        // Timeout in milliseconds
        TIMEOUT: 30000
    },

    // AI Configuration
    AI: {
        // OpenRouter API
        OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',

        // Default settings
        DEFAULT_TEMPERATURE: 0.7,
        DEFAULT_MAX_TOKENS: 4096,

        // Available models - Updated for OpenRouter 2026
        MODELS: {
            CLAUDE_SONNET: 'anthropic/claude-sonnet-4.6',
            CLAUDE_OPUS: 'anthropic/claude-opus-4.6',
            GPT5: 'openai/gpt-5.2',
            GPT5_FAST: 'openai/gpt-5.1',
            GEMINI_PRO: 'google/gemini-3-pro-preview',
            GEMINI_FLASH: 'google/gemini-3-flash-preview',
            LLAMA_70B: 'meta-llama/llama-3.1-70b-instruct',
            MISTRAL_LARGE: 'mistralai/mistral-large-2512',
            DEEPSEEK: 'deepseek/deepseek-v3.2',
            PERPLEXITY: 'perplexity/sonar-pro-search'
        }
    },

    // Media Server Configuration
    MEDIA: {
        EMBY_SERVER: 'https://media.allstarmediapro.com',
        EMBY_API_KEY: '8cf23d5e47174b8bae3b58e5eb3e6718'
    },

    // MCP Server Defaults
    MCP: {
        DEFAULT_SERVERS: [
            { id: 'mcp-filesystem', name: 'Filesystem', url: 'mcp://localhost:3100', type: 'local', tools: ['file_read', 'file_write', 'file_list', 'file_search'] },
            { id: 'mcp-shell', name: 'Shell/Terminal', url: 'mcp://localhost:3101', type: 'local', tools: ['shell_exec', 'process_list', 'env_vars'] },
            { id: 'mcp-database', name: 'Database', url: 'mcp://localhost:3102', type: 'local', tools: ['db_query', 'db_schema', 'db_tables'] },
            { id: 'mcp-web', name: 'Web Fetch', url: 'mcp://localhost:3103', type: 'local', tools: ['web_fetch', 'web_search', 'screenshot'] },
            { id: 'mcp-github', name: 'GitHub', url: 'mcp://api.github.com', type: 'remote', tools: ['repo_read', 'issue_create', 'pr_create', 'code_search'] },
            { id: 'mcp-memory', name: 'Memory/Knowledge', url: 'mcp://localhost:3104', type: 'local', tools: ['memory_store', 'memory_recall', 'knowledge_graph'] }
        ]
    },

    // Feature Flags
    FEATURES: {
        MULTI_CHAT: true,
        IMAGE_GENERATION: true,
        STREAMING: true,
        MCP_INTEGRATION: true,
        WEBRTC: true,
        MEDIA_SERVER: true
    },

    // Environment
    ENV: {
        IS_STAGING: window.location.hostname.includes('stg') || window.location.hostname.includes('staging'),
        IS_PRODUCTION: window.location.hostname === 'super-dashboard.pages.dev' || window.location.hostname.includes('prod'),
        IS_LOCAL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    },

    // Version
    VERSION: '2.0.0-stg',
    BUILD_DATE: new Date().toISOString()
};

// Freeze config to prevent modifications
Object.freeze(CONFIG);
Object.freeze(CONFIG.API);
Object.freeze(CONFIG.API.ENDPOINTS);
Object.freeze(CONFIG.AI);
Object.freeze(CONFIG.AI.MODELS);
Object.freeze(CONFIG.MEDIA);
Object.freeze(CONFIG.MCP);
Object.freeze(CONFIG.FEATURES);
Object.freeze(CONFIG.ENV);

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}

console.log(`[Config] Super Dashboard v${CONFIG.VERSION} loaded`);
console.log(`[Config] Environment: ${CONFIG.ENV.IS_STAGING ? 'Staging' : CONFIG.ENV.IS_PRODUCTION ? 'Production' : 'Local'}`);
console.log(`[Config] API: ${CONFIG.API.BASE_URL}`);
