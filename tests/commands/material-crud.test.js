// filename: tests/commands/material-crud.test.js
// 船舶物料申请系统 · 物料 CRUD 命令层测试
// 使用原生断言，不依赖测试框架
//
// 【M-9 修复保持】明确引用比较与深度比较的语义。
//
// 【本轮修改】
//   m-new-4 联动：新增 deleteMaterial 的回收站 ID 格式与唯一性测试。
//     验证命令层已正确使用 generateRecycleBinItemId，
//     而不是旧的手写拼接。

import {
    addMaterial,
    editMaterial,
    deleteMaterial,
    clearAllMaterials,
} from '../../src/commands/material-crud.js';
import {
    createEmptyVault,
} from '../../src/core/vault.js';

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(
            '断言失败（严格相等）：' + (message || '') + '\n' +
            '  期望: ' + JSON.stringify(expected) + '\n' +
            '  实际: ' + JSON.stringify(actual)
        );
    }
}

function assertDeepEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
            '断言失败（深度比较）：' + (message || '') + '\n' +
            '  期望: ' + JSON.stringify(expected) + '\n' +
            '  实际: ' + JSON.stringify(actual)
        );
    }
}

function assertSameReference(actual, expected, message) {
    if (actual !== expected) {
        throw new Error('断言失败（应为同一引用）：' + (message || ''));
    }
}

function assertDifferentReference(actual, expected, message) {
    if (actual === expected) {
        throw new Error('断言失败（不应为同一引用）：' + (message || ''));
    }
}

function assertTrue(condition, message) {
    if (!condition) {
        throw new Error('断言失败（应为 true）：' + (message || ''));
    }
}

function assertMatchPattern(text, pattern, message) {
    if (!pattern.test(text)) {
        throw new Error(
            '断言失败（正则不匹配）：' + (message || '') + '\n' +
            '  文本: ' + String(text) + '\n' +
            '  正则: ' + String(pattern)
        );
    }
}

function testAddMaterial() {
    const vault = createEmptyVault();
    const nextVault = addMaterial(vault, {
        language: 'zh',
        impa: '999999',
        description: '测试物料',
        specification: '规格A',
        unit: 'PCS',
        remark: '备注A',
        source: 'custom',
    });
    assertDifferentReference(nextVault, vault, 'addMaterial 应返回新引用');
    assertEqual(nextVault.materialsZh.length, 1, '中文库应有 1 条');
    assertEqual(nextVault.materialsZh[0].impa, '999999', 'IMPA 应正确');
    assertEqual(nextVault.materialsZh[0].description, '测试物料', '描述应正确');
    assertEqual(nextVault.materialsZh[0].source, 'custom', '来源应正确');
}

function testAddDuplicateImpa() {
    const vault = createEmptyVault();
    const vault1 = addMaterial(vault, {
        language: 'zh',
        impa: '999999',
        description: '测试物料',
    });
    const vault2 = addMaterial(vault1, {
        language: 'zh',
        impa: '999999',
        description: '重复物料',
    });
    assertSameReference(vault2, vault1, '重复 IMPA 应返回原引用');
    assertEqual(vault2.materialsZh.length, 1, '中文库应仍只有 1 条');
}

function testAddMaterialEmptyDescription() {
    const vault = createEmptyVault();
    const nextVault = addMaterial(vault, {
        language: 'zh',
        impa: '999999',
        description: '',
    });
    assertSameReference(nextVault, vault, '空描述应被拒绝');
}

function testEditMaterial() {
    const vault = createEmptyVault();
    const vault1 = addMaterial(vault, {
        language: 'zh',
        impa: '999999',
        description: '原描述',
        unit: 'PCS',
    });
    const vault2 = editMaterial(vault1, {
        language: 'zh',
        impa: '999999',
        description: '新描述',
    });
    assertEqual(vault2.materialsZh[0].description, '新描述', '描述应更新');
    assertEqual(vault2.materialsZh[0].unit, 'PCS', '未修改字段应保留');
}

function testEditMaterialNotFound() {
    const vault = createEmptyVault();
    const nextVault = editMaterial(vault, {
        language: 'zh',
        impa: '999999',
        description: '新描述',
    });
    assertSameReference(nextVault, vault, '未找到时应返回原引用');
}

function testDeleteMaterial() {
    const vault = createEmptyVault();
    const vault1 = addMaterial(vault, {
        language: 'zh',
        impa: '999999',
        description: '测试物料',
    });
    const vault2 = deleteMaterial(vault1, {
        language: 'zh',
        impa: '999999',
    });
    assertEqual(vault2.materialsZh.length, 0, '删除后应为空');
    assertEqual(vault2.recycleBin.length, 1, '回收站应有 1 条');
}

/**
 * m-new-4 联动测试：deleteMaterial 生成的回收站条目 ID 格式正确。
 */
function testDeleteMaterialRecycleBinIdFormat() {
    const vault = createEmptyVault();
    const vault1 = addMaterial(vault, {
        language: 'zh',
        impa: '999999',
        description: '测试物料',
    });
    const vault2 = deleteMaterial(vault1, {
        language: 'zh',
        impa: '999999',
    });
    const recycleBinItem = vault2.recycleBin[0];
    assertMatchPattern(
        recycleBinItem.id,
        /^zh::999999::\d+-[a-z0-9]+$/,
        '回收站条目 ID 应符合 <language>::<impa>::<时间戳>-<随机串> 格式'
    );
}

/**
 * m-new-4 联动测试：连续删除同 IMPA（先删后加再删）得到不同 ID。
 *
 * 场景：
 *   1. 添加 999999 → 删除 → 回收站 ID = A
 *   2. 重新添加 999999 → 再次删除 → 回收站 ID = B
 *   3. A !== B（因为新实现带随机串）
 */
function testDeleteMaterialRecycleBinIdUniqueAcrossDeletes() {
    const vault = createEmptyVault();
    const vault1 = addMaterial(vault, {
        language: 'zh',
        impa: '999999',
        description: '测试物料',
    });
    const vault2 = deleteMaterial(vault1, {
        language: 'zh',
        impa: '999999',
    });
    const firstId = vault2.recycleBin[0].id;

    // 重新添加并再次删除
    const vault3 = addMaterial(vault2, {
        language: 'zh',
        impa: '999999',
        description: '测试物料',
    });
    const vault4 = deleteMaterial(vault3, {
        language: 'zh',
        impa: '999999',
    });

    assertEqual(vault4.recycleBin.length, 2, '回收站应有 2 条');
    const secondId = vault4.recycleBin[0].id;
    assertTrue(firstId !== secondId, '两次删除应得到不同 ID（实际：' + firstId + ' / ' + secondId + '）');
}

function testDeleteMaterialNotFound() {
    const vault = createEmptyVault();
    const nextVault = deleteMaterial(vault, {
        language: 'zh',
        impa: '999999',
    });
    assertSameReference(nextVault, vault, '未找到时应返回原引用');
}

function testClearAllMaterials() {
    const vault = createEmptyVault();
    const vault1 = addMaterial(vault, {
        language: 'zh',
        impa: '999999',
        description: '测试物料',
    });
    const vault2 = addMaterial(vault1, {
        language: 'en',
        impa: '999998',
        description: 'Test material',
    });
    const vault3 = clearAllMaterials(vault2);
    assertEqual(vault3.materialsZh.length, 0, '清空后中文库应为空');
    assertEqual(vault3.materialsEn.length, 0, '清空后英文库应为空');
}

function runAllTests() {
    const testFunctions = [
        testAddMaterial,
        testAddDuplicateImpa,
        testAddMaterialEmptyDescription,
        testEditMaterial,
        testEditMaterialNotFound,
        testDeleteMaterial,
        testDeleteMaterialRecycleBinIdFormat,
        testDeleteMaterialRecycleBinIdUniqueAcrossDeletes,
        testDeleteMaterialNotFound,
        testClearAllMaterials,
    ];
    let passedCount = 0;
    let failedCount = 0;
    for (let index = 0; index < testFunctions.length; index++) {
        const testFunction = testFunctions[index];
        try {
            testFunction();
            console.log('✅ ' + testFunction.name);
            passedCount++;
        } catch (testError) {
            console.error('❌ ' + testFunction.name + ': ' + testError.message);
            failedCount++;
        }
    }
    console.log('');
    console.log('通过：' + passedCount + ' / ' + testFunctions.length);
    if (failedCount > 0) {
        console.error('失败：' + failedCount);
    }
}

runAllTests();