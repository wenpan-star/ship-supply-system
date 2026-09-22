// filename: src/services/export-suite/json-export.js
// 船舶物料申请系统 · JSON 加密备份导出
//
// 【导出内容】
//   - en：英文物料库
//   - zh：中文物料库
//   - recycleBin：回收站
//   - apps：所有已保存的申请单（键为 reqNo）
// 整体用主密码派生的密钥加密后写入 JSON。

import {
    encryptData,
} from '../../core/crypto.js';
import {
    getVaultSnapshot,
} from '../../core/facade.js';
import {
    addLog,
} from '../../core/audit-log.js';
import {
    getFileTimestamp,
} from '../../utils/format.js';
import {
    getKeys,
} from '../../core/repository.js';
import {
    secureGetItem,
} from '../../core/persist.js';

/**
 * 导出 JSON 加密备份
 * @returns {Promise<void>}
 */
export async function exportBackupJSON() {
    const vault = getVaultSnapshot();
    if (!vault) {
        alert('Vault 未初始化');
        return;
    }

    const applicationsForBackup = {};
    try {
        const appKeys = await getKeys('app');
        for (let index = 0; index < appKeys.length; index++) {
            const key = appKeys[index];
            if (key === 'meta' || key.startsWith('chunk_') || key.startsWith('backup_') || key === '__recycleBin__') continue;
            const appData = await secureGetItem('app', key, null);
            if (appData) {
                applicationsForBackup[key] = appData;
            }
        }
    } catch (readError) {
        console.error('[json-export] 读取申请单失败:', readError);
    }

    const exportData = {
        en: vault.materialsEn.map(function (item) {
            return {
                impa: item.impa,
                description: item.description,
                specification: item.specification || '',
                unit: item.unit || '',
                remark: item.remark || '',
                source: item.source || 'import',
            };
        }),
        zh: vault.materialsZh.map(function (item) {
            return {
                impa: item.impa,
                description: item.description,
                specification: item.specification || '',
                unit: item.unit || '',
                remark: item.remark || '',
                source: item.source || 'import',
            };
        }),
        recycleBin: Array.isArray(vault.recycleBin) ? vault.recycleBin : [],
        apps: applicationsForBackup,
    };

    if (!exportData.en.length && !exportData.zh.length && !Object.keys(exportData.apps).length && !exportData.recycleBin.length) {
        alert('当前没有数据可备份');
        return;
    }

    const jsonString = JSON.stringify(exportData);
    let encryptedString;
    try {
        encryptedString = await encryptData(jsonString);
    } catch (encryptError) {
        alert('加密备份失败，请检查加密环境');
        return;
    }

    const backupObject = {
        encrypted: true,
        version: 1,
        data: encryptedString,
    };
    const finalString = JSON.stringify(backupObject, null, 2);
    const blob = new Blob([finalString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = '物料库备份_中英文_加密_' + getFileTimestamp() + '.json';
    anchor.click();
    URL.revokeObjectURL(url);

    addLog(
        '导出JSON备份(加密)',
        'EN:' + exportData.en.length +
        ' ZH:' + exportData.zh.length +
        ' 回收站:' + exportData.recycleBin.length +
        ' 申请单:' + Object.keys(exportData.apps).length
    );
    alert(
        '✅ 加密备份导出成功！\n' +
        '英文库 ' + exportData.en.length + ' 条，' +
        '中文库 ' + exportData.zh.length + ' 条，' +
        '回收站 ' + exportData.recycleBin.length + ' 条，' +
        '申请单 ' + Object.keys(exportData.apps).length + ' 个\n' +
        '备份文件已加密，导入时需要主密码解密。'
    );
}