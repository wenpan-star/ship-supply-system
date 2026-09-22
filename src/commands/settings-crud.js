// filename: src/commands/settings-crud.js
// 船舶物料申请系统 · 设置项命令
// 全部为纯函数，输入旧 Vault，输出新 Vault，绝不修改入参
//
// 【设计说明】
//   当前程序暂无用户偏好设置项。
//   本模块保留作为扩展点：未来若增加"主题选择"、"首字母搜索"等偏好，
//   只需在此模块实现对应的 setXxx 命令，并在 registry.js 注册。
//
// 【命名约定】
//   setSetting(vault, {key, value}) 是通用设置入口，
//   key 必须在 SETTINGS_SCHEMA 中声明，避免写入未定义字段。
//
// 【防御性说明】
//   当 key 不在 SETTINGS_SCHEMA 中时，setSetting 拒绝写入并返回原 vault，
//   避免 settings 对象被未声明字段污染。

// 允许的设置项白名单（当前为空）
// 示例：未来若要支持 enableInitialsSearch，则加：
//   enableInitialsSearch: { type: 'boolean', default: false }
const SETTINGS_SCHEMA = Object.freeze({});

/**
 * 设置单个偏好项
 * @param {Object} vault
 * @param {{key: string, value: *}} payload
 * @returns {Object}
 */
export function setSetting(vault, payload) {
    const key = String(payload.key || '');
    if (!key) return vault;
    if (!Object.prototype.hasOwnProperty.call(SETTINGS_SCHEMA, key)) {
        console.warn('[settings-crud] 未知设置项: ' + key);
        return vault;
    }
    const schema = SETTINGS_SCHEMA[key];
    const value = payload.value;

    // 类型校验
    if (schema.type === 'boolean' && typeof value !== 'boolean') {
        console.warn('[settings-crud] 设置项 ' + key + ' 需要 boolean 类型');
        return vault;
    }
    if (schema.type === 'string' && typeof value !== 'string') {
        console.warn('[settings-crud] 设置项 ' + key + ' 需要 string 类型');
        return vault;
    }

    if (vault.settings[key] === value) return vault;

    const nextSettings = Object.assign({}, vault.settings);
    nextSettings[key] = value;

    return {
        materialsEn: vault.materialsEn,
        materialsZh: vault.materialsZh,
        currentApplication: vault.currentApplication,
        recycleBin: vault.recycleBin,
        ui: vault.ui,
        settings: nextSettings,
        meta: vault.meta,
    };
}

/**
 * 获取设置项的默认值
 * @param {string} key
 * @returns {*}
 */
export function getSettingDefault(key) {
    if (!Object.prototype.hasOwnProperty.call(SETTINGS_SCHEMA, key)) return undefined;
    return SETTINGS_SCHEMA[key].default;
}

/**
 * 获取全部设置项的默认值表
 * @returns {Object}
 */
export function getAllSettingsDefaults() {
    const result = {};
    const keys = Object.keys(SETTINGS_SCHEMA);
    for (let index = 0; index < keys.length; index++) {
        result[keys[index]] = SETTINGS_SCHEMA[keys[index]].default;
    }
    return result;
}