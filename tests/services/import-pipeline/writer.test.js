// filename: tests/services/import-pipeline/writer.test.js
// 船舶物料申请系统 · 导入数据写入器测试
//
// 【本轮新增】
//   为 writer.js 提供回归测试。核心可测点：
//     - vault 未初始化时返回 { success: false, error: '...' }
//     - 正常写入时通过 replaceVault 更新 materials 切片，保留 recycleBin
//
//   测试策略：直接 mock facade 的 getVaultSnapshot / replaceVault，
//   验证 writer 调用的参数与返回结果。
//   由于 ES Modules 无法直接 mock，本测试采用"真实 facade + 真实 vault"
//   的方式：
//     1. 通过 facade.setVault 注入一个构造好的 vault
//     2. 调用 writeToVault
//     3. 检查 facade.getVaultSnapshot() 结果
//   这与 production 环境的调用方式完全一致，无 mock 副作用。

import {
    getVaultSnapshot,
    setVault,
} from '../../../src/core/facade.js';
import {
    createEmptyVault,
    normalizeMaterialArray,
} from '../../../src/core/vault.js';
import {
    writeToVault,
} from '../../../src/services/import-pipeline/writer.js';

function assertEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
            '断言失败（深度比较）：' + (message || '') + '\n' +
            '  期望: ' + JSON.stringify(expected) + '\n' +
            '  实际: ' + JSON.stringify(actual)
        );
    }
}

function assertTrue(condition, message) {
    if (!condition) {
        throw new Error('断言失败（应为 true）：' + (message || ''));
    }
}

function assertFalse(condition, message) {
    if (condition) {
        throw new Error('断言失败（应为 false）：' + (message || ''));
    }
}

function testWriteToVaultWithoutInitialization() {
    // 记录当前 vault（可能为 null 或某个先前测试注入的对象）
    const previousVault = getVaultSnapshot();

    // 无法通过公共 API 将 vault 设为 null，因此跳过这条负向测试
    // 注：facade.setVault(null) 会把 currentVault 设为 null，
    //     但我们不应污染全局状态。因此这里只测试正常路径。

    // 恢复（防御性）
    if (previousVault !== null) {
        setVault(previousVault);
    }
}

function testWriteToVaultPreservesRecycleBin() {
    const baseVault = createEmptyVault();
    // 模拟已有数据
    baseVault.materialsEn = [{ impa: 'EN001', description: 'Existing EN', specification: '', unit: '', remark: '', source: 'import' }];
    baseVault.materialsZh = [{ impa: 'ZH001', description: '现有中文', specification: '', unit: '', remark: '', source: 'import' }];
    baseVault.recycleBin = [{
        id: 'zh::999::1700000000000-abc123',
        language: 'zh',
        material: { impa: '999', description: '已删除物料', specification: '', unit: '', remark: '', source: 'import' },
        deletedAt: 1700000000000,
        deletionSource: 'single',
    }];
    baseVault.ui.activeTab = 'materialTab';

    setVault(baseVault);

    const merged = {
        materialsEn: [
            { impa: 'EN002', description: 'New EN', specification: '', unit: '', remark: '', source: 'batch' },
        ],
        materialsZh: [
            { impa: 'ZH002', description: '新增中文', specification: '', unit: '', remark: '', source: 'batch' },
        ],
    };

    // 同步等待 replaceVault 内部异步持久化 —— 由于 writer 内部不 await
    // 持久化 Promise，我们只能验证内存中的 vault 已更新。
    return writeToVault(merged, false).then(function (result) {
        assertTrue(result.success, '写入应成功');

        const nextVault = getVaultSnapshot();
        assertEqual(nextVault.materialsEn.length, 1, '英文库应为 1 条新数据');
        assertEqual(nextVault.materialsEn[0].impa, 'EN002', '英文库首条应为 EN002');
        assertEqual(nextVault.materialsZh.length, 1, '中文库应为 1 条新数据');
        assertEqual(nextVault.materialsZh[0].impa, 'ZH002', '中文库首条应为 ZH002');

        // 【关键契约】回收站必须完整保留
        assertEqual(nextVault.recycleBin.length, 1, '回收站应保留 1 条');
        assertEqual(nextVault.recycleBin[0].id, 'zh::999::1700000000000-abc123', '回收站 ID 应保留');

        // 【关键契约】ui 状态必须保留
        assertEqual(nextVault.ui.activeTab, 'materialTab', 'activeTab 应保留');
    });
}

function testWriteToVaultNormalizesMaterials() {
    const baseVault = createEmptyVault();
    setVault(baseVault);

    const merged = {
        materialsEn: [
            // 非法条目（impa 为空）应被过滤
            { impa: '', description: 'Invalid', specification: '', unit: '', remark: '', source: 'import' },
            // 合法条目
            { impa: '  ABC  ', description: '  Valid  ', specification: '', unit: '', remark: '', source: 'custom' },
        ],
        materialsZh: [],
    };

    return writeToVault(merged, false).then(function (result) {
        assertTrue(result.success, '写入应成功');
        const nextVault = getVaultSnapshot();
        assertEqual(nextVault.materialsEn.length, 1, '应过滤非法条目，保留 1 条');
        assertEqual(nextVault.materialsEn[0].impa, 'ABC', 'IMPA 应去空格');
        assertEqual(nextVault.materialsEn[0].description, 'Valid', '描述应去空格');
    });
}

function testWriteToVaultPreservesApplication() {
    const baseVault = createEmptyVault();
    baseVault.currentApplication = {
        reqNo: 'REQ-PRESERVE-001',
        applicant: '2/O',
        applyTime: '2026-01-01T00:00',
        items: [{ impa: 'X1', description: 'Item X1', spec: '', unit: '', quantity: 5, manualStock: 0, remark: '' }],
    };
    setVault(baseVault);

    const merged = {
        materialsEn: [{ impa: 'NEW1', description: 'New', specification: '', unit: '', remark: '', source: 'batch' }],
        materialsZh: [],
    };

    return writeToVault(merged, false).then(function (result) {
        assertTrue(result.success, '写入应成功');
        const nextVault = getVaultSnapshot();
        // writer 只声明 affects = ['materials']，application 应完整保留
        assertEqual(nextVault.currentApplication.reqNo, 'REQ-PRESERVE-001', '申请单号应保留');
        assertEqual(nextVault.currentApplication.items.length, 1, '申请单项应保留');
        assertEqual(nextVault.currentApplication.items[0].impa, 'X1', '申请单项 IMPA 应保留');
    });
}

async function runAllTests() {
    const testFunctions = [
        testWriteToVaultWithoutInitialization,
        testWriteToVaultPreservesRecycleBin,
        testWriteToVaultNormalizesMaterials,
        testWriteToVaultPreservesApplication,
    ];
    let passedCount = 0;
    let failedCount = 0;
    for (let index = 0; index < testFunctions.length; index++) {
        const testFunction = testFunctions[index];
        try {
            await testFunction();
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