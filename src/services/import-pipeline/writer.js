// filename: src/services/import-pipeline/writer.js
// 船舶物料申请系统 · 导入数据写入器
// 职责：将合并后的数据通过 facade 层写入 Vault，带失败回滚
//
// 【nextVault 补全】
//   nextVault 显式包含 recycleBin 字段。此前该字段缺失会导致
//   replaceVault 后 vault.recycleBin 变为 undefined，
//   进而被 normalizeVault 归一化为 []，静默清空回收站。
//
// 【持久化策略】
//   仅声明 affects = ['materials']，因此只重写物料库切片，
//   不动 application / recycleBin / ui / settings。
//   facade.replaceVault 会尊重该参数。
//
// 【本轮修改】
//   无功能性改动，仅与 M-10 / M-new-1 / persist.js 恢复后的契约对齐确认。

import {
    getVaultSnapshot,
    replaceVault,
} from '../../core/facade.js';
import {
    normalizeMaterialArray,
} from '../../core/vault.js';

/**
 * 将合并后的数据写入 Vault
 *
 * @param {{materialsEn: Object[], materialsZh: Object[]}} merged
 * @param {boolean} overwriteMode
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function writeToVault(merged, overwriteMode) {
    const vault = getVaultSnapshot();
    if (!vault) {
        return { success: false, error: 'Vault 未初始化' };
    }

    try {
        const nextVault = {
            materialsEn: normalizeMaterialArray(merged.materialsEn),
            materialsZh: normalizeMaterialArray(merged.materialsZh),
            currentApplication: vault.currentApplication,
            recycleBin: vault.recycleBin,
            ui: vault.ui,
            settings: vault.settings,
            meta: vault.meta,
        };

        replaceVault(nextVault, ['materials']);
        return { success: true };
    } catch (writeError) {
        console.error('[writer] 写入失败:', writeError);
        return {
            success: false,
            error: writeError.message || '未知错误',
        };
    }
}