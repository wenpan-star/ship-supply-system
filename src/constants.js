// filename: src/constants.js
// 船舶物料申请系统 · 全局常量
// 所有"魔数"集中于此，任何模块不得内联硬编码
// 每个常量标注取值依据，便于长期维护与代码审查

// ==================== 存储键 ====================
export const STORAGE_KEY_META = 'ship_material_meta_v96';
export const STORAGE_KEY_AUDIT_LOGS = 'ship_material_audit_logs';
export const STORAGE_KEY_SETTINGS = 'ship_material_settings';
export const STORAGE_KEY_CORRUPTION_FLAG = 'ship_material_corruption_flag';

// UI 设置键
export const STORAGE_KEY_REQ_COLUMN_WIDTHS = 'reqColWidths';
export const STORAGE_KEY_MATERIAL_COLUMN_WIDTHS = 'materialColWidths';
export const STORAGE_KEY_ACTIVE_TAB = 'ui_activeTab';
export const STORAGE_KEY_CURRENT_LANG = 'ui_currentLang';
export const STORAGE_KEY_REQ_SORT_FIELD = 'ui_reqSortField';
export const STORAGE_KEY_REQ_SORT_ASC = 'ui_reqSortAsc';
export const STORAGE_KEY_REQ_DEFAULT_ORDER = 'ui_reqDefaultOrder';
export const STORAGE_KEY_REQ_SEARCH_KEYWORD = 'ui_reqSearchKeyword';
export const STORAGE_KEY_REQ_SEARCH_FIELD = 'ui_reqSearchField';
export const STORAGE_KEY_MATERIAL_SEARCH_KEYWORD = 'ui_materialSearchKeyword';
export const STORAGE_KEY_MATERIAL_SEARCH_FIELD = 'ui_materialSearchField';
export const STORAGE_KEY_MATERIAL_PAGE_SIZE = 'ui_materialPageSize';
export const STORAGE_KEY_MATERIAL_CURRENT_PAGE = 'ui_materialCurrentPage';
export const STORAGE_KEY_QUICK_SEARCH_KEYWORD = 'ui_quickSearchKeyword';
export const STORAGE_KEY_QUICK_SEARCH_FIELD = 'ui_quickSearchField';
// M-6 修复：记录"上次查看的申请单 reqNo"，启动时优先恢复
export const STORAGE_KEY_LAST_VIEWED_REQ_NO = 'ui_lastViewedReqNo';

// 预设物料库注入标记：
//   首次启动时若 IndexedDB 物料库为空，则从 src/preset.js 注入预设数据。
//   注入成功后置位此标记，避免用户主动清空物料库后重启又被自动填充。
//   系统重置（resetAllData）时会一并清除此键。
//   后缀 _v1：为未来预设数据结构变更预留，届时可改为 _v2 触发重新注入。
export const STORAGE_KEY_PRESET_INJECTED = 'ship_material_preset_injected_v1';

// 登录失败与锁定状态
export const STORAGE_KEY_FAILED_ATTEMPTS = 'impa_failed_attempts';
export const STORAGE_KEY_LOGIN_LOCKOUT_UNTIL = 'impa_login_lockout_until';

// ==================== 加密参数 ====================
export const PBKDF2_ITERATIONS = 210000;
export const SALT_LENGTH = 16;
export const AES_GCM_IV_LENGTH = 12;
// GCM AuthTag 固定 16 字节。用于校验密文包的最小长度。
export const GCM_AUTH_TAG_LENGTH = 16;
// 密文负载最小长度 = IV + AuthTag。低于此值说明密文必然损坏。
export const MIN_ENCRYPTED_PAYLOAD_LENGTH = AES_GCM_IV_LENGTH + GCM_AUTH_TAG_LENGTH;
export const ENCRYPTION_PREFIX = 'v3::';

// ==================== 元数据版本 ====================
// localStorage 中主密码元数据的 schema 版本号。
// 未来若元数据字段结构变化，可递增此版本以支持迁移。
export const META_VERSION = 7;

// ==================== 存储分块 ====================
export const CHUNK_SIZE = 5000;

// ==================== 备份键前缀 ====================
// persist.js 的密文备份前缀，用于密码变更前的原子性保护。
// auth.js 与未来的回滚逻辑都基于此前缀。
export const BACKUP_KEY_PREFIX = 'backup_';

// ==================== 日志上限 ====================
export const MAX_AUDIT_LOG_COUNT = 5000;
export const LOCALSTORAGE_LOG_COUNT = 300;
export const LOG_SAVE_DEBOUNCE_MS = 2000;

// ==================== 登录安全 ====================
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_DURATION_MS = 30000;

// ==================== 默认值 ====================
export const DEFAULT_REQ_PREFIX = 'REQ-AC OREN-';
export const DEFAULT_APPLICANT = '2/O';
export const DEFAULT_LANG = 'zh';

// ==================== 字段长度限制 ====================
export const MAX_IMPA_LENGTH = 30;
export const MAX_DESCRIPTION_LENGTH = 200;
export const MAX_SPECIFICATION_LENGTH = 100;
export const MAX_UNIT_LENGTH = 20;
export const MAX_REMARK_LENGTH = 200;

// ==================== 物料来源标记 ====================
export const MATERIAL_SOURCES = Object.freeze({
    IMPORT: 'import',
    CUSTOM: 'custom',
    BATCH: 'batch',
});

export const MATERIAL_SOURCE_FILTER_OPTIONS = Object.freeze({
    ALL: 'all',
    CUSTOM_BATCH: 'custom_batch',
    CUSTOM: 'custom',
    BATCH: 'batch',
    IMPORT: 'import',
});

// ==================== 回收站参数 ====================
// 回收站容量上限
// 取值依据：
//   - 单条物料平均 200 字节，100 条 ≈ 20KB
//   - 加密后仍远小于 localStorage 上限
//   - 100 条足够覆盖"几天内误删多条目"的场景
export const MAX_RECYCLE_BIN_SIZE = 100;

// 回收站保留天数
// 取值依据：
//   - 30 天与主流邮箱"垃圾箱保留 30 天"惯例一致
//   - 足够用户在发现问题后想起来恢复
export const RECYCLE_BIN_RETENTION_DAYS = 30;

// 回收站条目的删除来源标记
export const DELETION_SOURCES = Object.freeze({
    SINGLE: 'single',
    BATCH: 'batch',
});

// ==================== UI 参数 ====================
export const DEFAULT_MATERIAL_PAGE_SIZE = 100;
export const QUICK_SEARCH_MAX_RESULTS = 20;
export const SEARCH_DEBOUNCE_MS = 300;
export const REQ_SEARCH_DEBOUNCE_MS = 300;
export const QUICK_SEARCH_DEBOUNCE_MS = 300;
export const AUTO_SAVE_DEBOUNCE_MS = 500;

// ==================== CDN 列表 ====================
export const XLSX_CDN_URLS = Object.freeze([
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js',
]);

export const LOCALFORAGE_CDN_URLS = Object.freeze([
    'https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js',
    'https://unpkg.com/localforage@1.10.0/dist/localforage.min.js',
]);

// ==================== 默认列宽 ====================
export const DEFAULT_REQ_COLUMN_WIDTHS = Object.freeze([32, 40, 100, 180, 150, 80, 100, 100, 120, 60]);
export const DEFAULT_MATERIAL_COLUMN_WIDTHS = Object.freeze([50, 120, 200, 180, 80, 150, 60]);
export const MIN_COLUMN_WIDTH = 40;

// ==================== 导出文件名前缀 ====================
export const EXPORT_REQUEST_PREFIX = '物料申请单_';
export const EXPORT_BACKUP_PREFIX = '船舶物料备份_';
export const EXPORT_AUDIT_PREFIX = '审计日志_加密_';
export const EXPORT_FAILED_ITEMS_PREFIX = '申请单导入失败项_';

// ==================== 其他 ====================
// 导入文件大小上限。由 parser.js 在上传前/解析前校验，避免大文件导致内存崩溃。
export const MAX_IMPORT_FILE_SIZE_BYTES = 20 * 1024 * 1024;
export const MIN_PASSWORD_LENGTH = 6;
export const TOAST_DURATION_MS = 3000;
export const MAX_HEADER_PROBE_ROWS = 10;