// filename: src/core/auth.js
// 船舶物料申请系统 · 认证与密码管理
// 负责：主密码设置、验证、登录锁定、二次授权、修改密码、系统重置
//
// 【Bug-2 修复保持】changePassword 显式重加密回收站 (__recycleBin__)。
// 【S5 修复保持】备份/恢复逻辑统一到 persist.js。
// 【S8 修复保持】changePassword 对单条申请单读取失败时不阻塞整体流程。
// 【readMeta 加固】schema 校验防止元数据损坏被误判为"首次使用"。
// 【writeMeta】使用 META_VERSION 常量替代硬编码 7。
//
// 【与 persist.js 的契约】
//   本模块依赖 persist.js 的以下导出：
//     saveChunkedData / loadChunkedData / secureSetItem / secureGetItem /
//     clearChunkCache / backupStore / restoreStore / cleanupBackupKeys
//   persist.js 恢复完整实现后，所有契约自动满足。

import {
    STORAGE_KEY_META,
    STORAGE_KEY_FAILED_ATTEMPTS,
    STORAGE_KEY_LOGIN_LOCKOUT_UNTIL,
    MAX_LOGIN_ATTEMPTS,
    LOGIN_LOCKOUT_DURATION_MS,
    MIN_PASSWORD_LENGTH,
    META_VERSION,
} from '../constants.js';
import {
    deriveKeyFromPassword,
    computeAuthHash,
    generateSalt,
    clearCachedKey,
} from './crypto.js';
import {
    saveChunkedData,
    loadChunkedData,
    secureSetItem,
    secureGetItem,
    clearChunkCache,
    backupStore,
    restoreStore,
    cleanupBackupKeys,
} from './persist.js';
import {
    addLog,
    loadLogsFromIndexedDB,
    saveLogsToIndexedDB,
    getOperationLogs,
} from './audit-log.js';
import {
    resetAllData,
} from './corruption.js';
import {
    getKeys,
} from './repository.js';
import {
    bytesToBase64,
    base64ToBytes,
} from './crypto.js';

// ==================== 模块级状态 ====================
let isAuthenticated = false;
let failedLoginAttempts = parseInt(localStorage.getItem(STORAGE_KEY_FAILED_ATTEMPTS) || '0', 10);
let loginLockoutUntil = parseInt(localStorage.getItem(STORAGE_KEY_LOGIN_LOCKOUT_UNTIL) || '0', 10);
let authModalOpen = false;

// ==================== 元数据读写 ====================

/**
 * 读取元数据（salt + authHash）
 *
 * 返回 null 的场景：
 *   1. localStorage 中不存在元数据键（首次使用）
 *   2. JSON 解析失败（数据损坏）
 *   3. 关键字段类型不合法（数据损坏）
 *
 * 调用方需注意：返回 null 不代表"一定是首次使用"。
 * 主流程中若存储层存在数据但元数据缺失，应引导用户恢复。
 *
 * @returns {Object|null}
 */
export function readMeta() {
    const metaRaw = localStorage.getItem(STORAGE_KEY_META);
    if (!metaRaw) return null;
    try {
        const parsed = JSON.parse(metaRaw);
        if (!parsed || typeof parsed !== 'object') {
            console.error('[auth] 元数据格式无效：不是对象');
            return null;
        }
        if (typeof parsed.salt !== 'string' || parsed.salt.length === 0) {
            console.error('[auth] 元数据字段 salt 无效');
            return null;
        }
        if (typeof parsed.authHash !== 'string' || parsed.authHash.length === 0) {
            console.error('[auth] 元数据字段 authHash 无效');
            return null;
        }
        return parsed;
    } catch (parseError) {
        console.error('[auth] 元数据解析失败:', parseError);
        return null;
    }
}

/**
 * 写入元数据
 * @param {Uint8Array} salt
 * @param {string} authHash
 */
function writeMeta(salt, authHash) {
    const saltString = bytesToBase64(salt);
    localStorage.setItem(
        STORAGE_KEY_META,
        JSON.stringify({ salt: saltString, authHash: authHash, version: META_VERSION })
    );
}

/**
 * 清除元数据
 */
function clearMeta() {
    localStorage.removeItem(STORAGE_KEY_META);
}

// ==================== 首次设置密码 ====================

/**
 * 首次设置主密码
 * 原子性保护：若存储初始化失败，回滚元数据与密钥缓存
 * @param {string} password
 * @returns {Promise<boolean>}
 */
export async function setupMasterPassword(password) {
    const salt = generateSalt();
    await deriveKeyFromPassword(password, salt);
    const authHash = await computeAuthHash(password, salt);

    // 先尝试初始化空物料库（在写元数据之前）
    // 这样若存储失败，元数据不会被写入，状态保持一致
    try {
        await saveChunkedData('en', []);
        await saveChunkedData('zh', []);
    } catch (storageError) {
        console.error('[auth] 初始化存储失败，回滚:', storageError);
        clearCachedKey();
        throw new Error('存储初始化失败：' + storageError.message);
    }

    // 存储成功后再写元数据
    writeMeta(salt, authHash);
    isAuthenticated = true;
    addLog('系统初始化', '首次设置主密码');
    return true;
}

// ==================== 密码验证 ====================

/**
 * 验证密码并派生密钥
 * @param {string} password
 * @param {boolean} [loadLogs=true]
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, loadLogs) {
    const shouldLoadLogs = loadLogs !== false;
    try {
        const meta = readMeta();
        if (!meta) return false;
        const salt = base64ToBytes(meta.salt);
        const computedHash = await computeAuthHash(password, salt);
        if (computedHash !== meta.authHash) return false;

        await deriveKeyFromPassword(password, salt);
        isAuthenticated = true;

        if (shouldLoadLogs) {
            await loadLogsFromIndexedDB();
        }
        return true;
    } catch (verifyError) {
        console.error('[auth] 密码验证异常:', verifyError);
        return false;
    }
}

// ==================== 登录失败计数与锁定 ====================

/**
 * 记录一次登录失败
 * @returns {{attemptsLeft: number, lockoutUntil: number}}
 */
export function recordFailedLogin() {
    failedLoginAttempts++;
    localStorage.setItem(STORAGE_KEY_FAILED_ATTEMPTS, String(failedLoginAttempts));
    if (failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
        loginLockoutUntil = Date.now() + LOGIN_LOCKOUT_DURATION_MS;
        localStorage.setItem(STORAGE_KEY_LOGIN_LOCKOUT_UNTIL, String(loginLockoutUntil));
    }
    return {
        attemptsLeft: Math.max(0, MAX_LOGIN_ATTEMPTS - failedLoginAttempts),
        lockoutUntil: loginLockoutUntil,
    };
}

/**
 * 重置失败计数（登录成功后调用）
 */
export function resetFailedLogin() {
    failedLoginAttempts = 0;
    loginLockoutUntil = 0;
    localStorage.removeItem(STORAGE_KEY_FAILED_ATTEMPTS);
    localStorage.removeItem(STORAGE_KEY_LOGIN_LOCKOUT_UNTIL);
}

/**
 * 查询当前登录锁定状态
 * @returns {{locked: boolean, remainingSeconds: number}}
 */
export function getLoginLockoutState() {
    if (Date.now() < loginLockoutUntil) {
        return {
            locked: true,
            remainingSeconds: Math.ceil((loginLockoutUntil - Date.now()) / 1000),
        };
    }
    return { locked: false, remainingSeconds: 0 };
}

/**
 * 同步外部（跨标签页）的失败计数与锁定状态
 */
export function syncLoginStateFromStorage() {
    failedLoginAttempts = parseInt(localStorage.getItem(STORAGE_KEY_FAILED_ATTEMPTS) || '0', 10);
    loginLockoutUntil = parseInt(localStorage.getItem(STORAGE_KEY_LOGIN_LOCKOUT_UNTIL) || '0', 10);
}

// ==================== 认证状态查询 ====================

/**
 * 查询当前是否已认证
 * @returns {boolean}
 */
export function isAuthenticatedNow() {
    return isAuthenticated;
}

/**
 * 退出认证
 */
export function signOut() {
    isAuthenticated = false;
    clearCachedKey();
}

// ==================== 二次授权 ====================

/**
 * 弹出模态框要求输入密码
 * @param {string} operation
 * @returns {Promise<boolean>}
 */
export async function requirePasswordAuth(operation) {
    if (authModalOpen) {
        alert('已有授权操作正在进行，请先完成当前操作');
        return false;
    }
    authModalOpen = true;

    return new Promise(function (resolve) {
        const modal = document.createElement('div');
        modal.style.cssText = [
            'position: fixed; top: 0; left: 0; width: 100%; height: 100%;',
            'background: rgba(0,0,0,0.8); backdrop-filter: blur(8px);',
            'display: flex; align-items: center; justify-content: center;',
            'z-index: 20000; font-family: var(--font-stack);',
        ].join('');

        const card = document.createElement('div');
        card.style.cssText = [
            'background: #fff; border-radius: 28px; padding: 2rem;',
            'width: 90%; max-width: 400px; box-shadow: 0 20px 40px rgba(0,0,0,0.3);',
            'text-align: center;',
        ].join('');
        card.innerHTML =
            '<i class="fas fa-lock" style="font-size: 2.5rem; color: #1f6893;"></i>' +
            '<h3 style="margin: 0.5rem 0;">' + escapeHtmlText(operation) + '</h3>' +
            '<p style="color: #555; margin-bottom: 1.5rem;">请输入主密码</p>' +
            '<input type="password" id="pwdModalInput" style="width:100%; padding:12px; border-radius:40px; border:1px solid #ccc; margin-bottom:1rem;" autocomplete="off">' +
            '<div style="display: flex; gap: 12px; justify-content: center;">' +
            '<button id="pwdModalCancel" style="padding:8px 20px; border-radius:40px; border:1px solid #ccc; background:#fff;">取消</button>' +
            '<button id="pwdModalConfirm" style="padding:8px 20px; border-radius:40px; background:#1f6893; color:#fff; border:none;">确认</button>' +
            '</div>' +
            '<div id="pwdModalError" style="color:#9e2a2b; margin-top:12px; font-size:0.8rem;"></div>';

        modal.appendChild(card);
        document.body.appendChild(modal);

        const input = card.querySelector('#pwdModalInput');
        const confirmBtn = card.querySelector('#pwdModalConfirm');
        const cancelBtn = card.querySelector('#pwdModalCancel');
        const errorDiv = card.querySelector('#pwdModalError');

        input.focus();

        function cleanUp() {
            try {
                if (modal && modal.parentNode) {
                    modal.remove();
                }
            } catch (cleanupError) {
                console.warn('[auth] 清理授权模态框失败:', cleanupError);
            } finally {
                authModalOpen = false;
            }
        }

        async function checkPassword() {
            const lockState = getLoginLockoutState();
            if (lockState.locked) {
                errorDiv.innerText = '尝试次数过多，请等待 ' + lockState.remainingSeconds + ' 秒后重试';
                confirmBtn.disabled = true;
                setTimeout(function () {
                    confirmBtn.disabled = false;
                }, lockState.remainingSeconds * 1000);
                return;
            }
            const pwd = input.value;
            if (!pwd) {
                errorDiv.innerText = '请输入密码';
                return;
            }
            const ok = await verifyPassword(pwd, false);
            if (ok) {
                resetFailedLogin();
                addLog('授权操作', operation);
                cleanUp();
                resolve(true);
            } else {
                const failResult = recordFailedLogin();
                if (failResult.lockoutUntil > 0 && failResult.attemptsLeft === 0) {
                    errorDiv.innerText = '尝试次数过多，请等待30秒后重试';
                    confirmBtn.disabled = true;
                    setTimeout(function () {
                        confirmBtn.disabled = false;
                        errorDiv.innerText = '';
                        resetFailedLogin();
                    }, LOGIN_LOCKOUT_DURATION_MS);
                } else {
                    errorDiv.innerText = '密码错误，剩余尝试次数：' + failResult.attemptsLeft;
                }
                input.value = '';
                input.focus();
            }
        }

        confirmBtn.onclick = checkPassword;
        cancelBtn.onclick = function () {
            cleanUp();
            resolve(false);
        };
        input.onkeypress = function (event) {
            if (event.key === 'Enter') checkPassword();
        };
    });
}

/**
 * 内部 HTML 转义
 * @param {string} text
 * @returns {string}
 */
function escapeHtmlText(text) {
    return String(text).replace(/[&<>"']/g, function (character) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        };
        return map[character];
    });
}

// ==================== 修改密码 ====================

/**
 * 修改主密码
 *
 * 流程：
 *   1. 校验新密码格式与原密码正确性
 *   2. 加载所有明文数据（物料库、申请单、回收站、日志）到内存
 *   3. 对所有相关存储做密文备份（backup_ 前缀）
 *   4. 用新密码派生新密钥
 *   5. 用新密钥重加密所有数据写回
 *   6. 若任一步骤失败，用密文备份原子回滚
 *
 * 【S8 修复】读取申请单时单条失败不阻塞：
 *   直接跳过并记录日志，避免"一条损坏导致永远无法改密"。
 *
 * 【Bug-2 修复】回收站 __recycleBin__ 参与重加密：
 *   旧实现将其 continue 跳过，导致改密后回收站永久无法解密。
 *   现在单独读取/写回，与其他申请单同样处理。
 *
 * @param {string} oldPassword
 * @param {string} newPassword
 * @param {string} newPasswordConfirm
 * @returns {Promise<boolean>}
 */
export async function changePassword(oldPassword, newPassword, newPasswordConfirm) {
    if (newPassword !== newPasswordConfirm) {
        throw new Error('两次新密码不一致');
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
        throw new Error('新密码至少 ' + MIN_PASSWORD_LENGTH + ' 位');
    }
    if (!(await verifyPassword(oldPassword, false))) {
        throw new Error('原密码错误');
    }

    const oldMetaBackup = localStorage.getItem(STORAGE_KEY_META);
    if (!oldMetaBackup) {
        throw new Error('元数据缺失，无法修改密码');
    }
    const oldMetaObject = JSON.parse(oldMetaBackup);
    const oldSalt = base64ToBytes(oldMetaObject.salt);

    // ---------- 第一步：把明文数据加载到内存 ----------
    const materialsEn = await loadChunkedData('en');
    const materialsZh = await loadChunkedData('zh');

    const applicationsBackup = {};
    let recycleBinBackup = null;
    const appKeys = await getKeys('app');
    let skippedAppCount = 0;
    for (let index = 0; index < appKeys.length; index++) {
        const key = appKeys[index];
        if (key === 'meta' || key.startsWith('chunk_') || key.startsWith('backup_')) {
            continue;
        }
        // Bug-2 修复：回收站单独处理，纳入重加密清单
        if (key === '__recycleBin__') {
            try {
                const recycleBinData = await secureGetItem('app', '__recycleBin__', null);
                if (Array.isArray(recycleBinData)) {
                    recycleBinBackup = recycleBinData;
                }
            } catch (recycleReadError) {
                console.warn('[auth] 读取回收站失败，跳过: ', recycleReadError);
            }
            continue;
        }
        try {
            const appData = await secureGetItem('app', key, null);
            if (appData) {
                applicationsBackup[key] = appData;
            }
        } catch (readError) {
            // S8 修复：单条失败不阻塞
            skippedAppCount++;
            console.warn('[auth] 读取申请单失败，跳过: ' + key, readError);
        }
    }
    if (skippedAppCount > 0) {
        console.warn('[auth] 有 ' + skippedAppCount + ' 个申请单读取失败，已跳过。');
    }

    const oldLogs = getOperationLogs();

    // ---------- 第二步：对相关存储做密文备份 ----------
    await cleanupBackupKeys('en');
    await cleanupBackupKeys('zh');
    await cleanupBackupKeys('app');
    await cleanupBackupKeys('logs');

    await backupStore('en');
    await backupStore('zh');
    await backupStore('app');
    await backupStore('logs');

    // ---------- 第三步：用新密码重加密 ----------
    try {
        const newSalt = generateSalt();
        clearCachedKey();
        await deriveKeyFromPassword(newPassword, newSalt);
        const newAuthHash = await computeAuthHash(newPassword, newSalt);
        writeMeta(newSalt, newAuthHash);

        clearChunkCache();
        await saveChunkedData('en', materialsEn, true);
        await saveChunkedData('zh', materialsZh, true);

        const appEntries = Object.keys(applicationsBackup);
        for (let index = 0; index < appEntries.length; index++) {
            const key = appEntries[index];
            await secureSetItem('app', key, applicationsBackup[key]);
        }

        // Bug-2 修复：重加密写回回收站
        if (recycleBinBackup) {
            await secureSetItem('app', '__recycleBin__', recycleBinBackup);
        }

        await saveLogsToIndexedDB();

        await cleanupBackupKeys('en');
        await cleanupBackupKeys('zh');
        await cleanupBackupKeys('app');
        await cleanupBackupKeys('logs');

        addLog('密码修改', '已完成（含日志迁移）');
        return true;
    } catch (reencryptError) {
        console.error('[auth] 重加密失败，开始回滚:', reencryptError);

        // ---------- 回滚 ----------
        localStorage.setItem(STORAGE_KEY_META, oldMetaBackup);
        clearCachedKey();
        try {
            await deriveKeyFromPassword(oldPassword, oldSalt);
        } catch (rekeyError) {
            console.error('[auth] 回滚时重新派生旧密钥失败:', rekeyError);
        }

        const restoreErrors = [];
        const storeNames = ['en', 'zh', 'app', 'logs'];
        for (let index = 0; index < storeNames.length; index++) {
            const storeName = storeNames[index];
            try {
                const result = await restoreStore(storeName);
                if (result.failedKeys.length > 0) {
                    restoreErrors.push(
                        storeName + ' 恢复存在失败键: ' + result.failedKeys.join(', ')
                    );
                }
            } catch (restoreError) {
                restoreErrors.push(storeName + ' 恢复异常: ' + restoreError.message);
            }
        }

        if (restoreErrors.length > 0) {
            throw new Error(
                '密码修改失败，数据恢复过程中出现部分错误，请立即导出备份并检查数据完整性。\n' +
                restoreErrors.join('\n')
            );
        }
        throw new Error('密码修改失败，数据已成功恢复，请重新尝试');
    }
}

// ==================== 系统重置 ====================

/**
 * 系统重置
 * @returns {Promise<void>}
 */
export async function resetSystemAfterCorruption() {
    try {
        await resetAllData();
        alert('系统已重置，请重新设置主密码。');
        location.reload();
    } catch (resetError) {
        console.error('[auth] 重置系统失败:', resetError);
        alert('重置系统失败：' + resetError.message + '\n请手动清除浏览器数据后重试。');
    }
}

// ==================== 密码强度评估 ====================

/**
 * 评估密码强度
 * @param {string} password
 * @returns {number}  0-4
 */
export function evaluatePasswordStrength(password) {
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return Math.min(score, 4);
}

/**
 * 获取密码强度文案与颜色
 * @param {number} strength
 * @returns {{text: string, color: string}}
 */
export function getPasswordStrengthInfo(strength) {
    const colors = ['#ccc', '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71'];
    const labels = ['无', '弱', '一般', '良好', '极强'];
    return {
        text: '强度：' + labels[strength],
        color: colors[strength],
    };
}