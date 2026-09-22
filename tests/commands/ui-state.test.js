// filename: tests/commands/ui-state.test.js
// 船舶物料申请系统 · UI 状态命令层测试
//
// 【M-9 修复】分离深度比较与引用比较。
// 【M-3 联动】新增 setMaterialPageSize 在非法输入且现状已一致时
//   返回原引用的测试。

import {
    setActiveTab,
    setCurrentLang,
    setReqFilterKeyword,
    setReqSearchField,
    setReqSort,
    resetReqSort,
    setMaterialSearchKeyword,
    setMaterialSearchField,
    setMaterialPage,
    setMaterialPageSize,
    setQuickSearchKeyword,
    setQuickSearchField,
    setReqColumnWidths,
    setMaterialColumnWidths,
} from '../../src/commands/ui-state.js';
import {
    createEmptyVault,
} from '../../src/core/vault.js';
import {
    DEFAULT_MATERIAL_PAGE_SIZE,
} from '../../src/constants.js';

function assertEqual(actual, expected, message) {
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

function testSetActiveTab() {
    const vault = createEmptyVault();
    const nextVault = setActiveTab(vault, { activeTab: 'materialTab' });
    assertEqual(nextVault.ui.activeTab, 'materialTab', 'tab 应更新');
}

function testSetActiveTabInvalid() {
    const vault = createEmptyVault();
    const nextVault = setActiveTab(vault, { activeTab: 'invalid' });
    assertEqual(nextVault.ui.activeTab, 'reqTab', '非法值应回退 reqTab');
}

function testSetCurrentLang() {
    const vault = createEmptyVault();
    const nextVault = setCurrentLang(vault, { currentLang: 'en' });
    assertEqual(nextVault.ui.currentLang, 'en', '语言应更新');
}

function testSetReqFilterKeyword() {
    const vault = createEmptyVault();
    const nextVault = setReqFilterKeyword(vault, { keyword: 'bolt' });
    assertEqual(nextVault.ui.reqFilterKeyword, 'bolt', '关键词应更新');
}

function testSetReqSearchField() {
    const vault = createEmptyVault();
    const nextVault = setReqSearchField(vault, { field: 'impa' });
    assertEqual(nextVault.ui.reqSearchField, 'impa', '字段应更新');
}

function testSetReqSort() {
    const vault = createEmptyVault();
    const nextVault = setReqSort(vault, { field: 'impa', asc: true });
    assertEqual(nextVault.ui.reqSortField, 'impa', '排序字段应更新');
    assertEqual(nextVault.ui.reqSortAsc, true, '排序方向应更新');
}

function testResetReqSort() {
    const vault = createEmptyVault();
    vault.ui.reqSortField = 'impa';
    const nextVault = resetReqSort(vault);
    assertEqual(nextVault.ui.reqSortField, null, '排序字段应重置');
    assertEqual(nextVault.ui.reqDefaultOrder, 'reverse', '默认顺序应重置');
}

function testSetMaterialSearchKeyword() {
    const vault = createEmptyVault();
    const nextVault = setMaterialSearchKeyword(vault, { keyword: 'pump' });
    assertEqual(nextVault.ui.materialSearchKeyword, 'pump', '物料搜索关键词应更新');
}

function testSetMaterialSearchField() {
    const vault = createEmptyVault();
    const nextVault = setMaterialSearchField(vault, { field: 'description' });
    assertEqual(nextVault.ui.materialSearchField, 'description', '物料搜索字段应更新');
}

function testSetMaterialPage() {
    const vault = createEmptyVault();
    const nextVault = setMaterialPage(vault, { page: 3 });
    assertEqual(nextVault.ui.materialCurrentPage, 3, '页码应更新');
}

function testSetMaterialPageInvalid() {
    const vault = createEmptyVault();
    const nextVault = setMaterialPage(vault, { page: -1 });
    assertSameReference(nextVault, vault, '非法页码应返回原引用');
}

function testSetMaterialPageSize() {
    const vault = createEmptyVault();
    const nextVault = setMaterialPageSize(vault, { pageSize: 200 });
    assertEqual(nextVault.ui.materialPageSize, 200, '分页大小应更新');
    assertEqual(nextVault.ui.materialCurrentPage, 1, '页码应重置为 1');
}

/**
 * M-3 联动测试：非法输入且现状已一致时应返回原引用。
 * 初始 vault 的 pageSize 已是 DEFAULT_MATERIAL_PAGE_SIZE，page 已是 1。
 */
function testSetMaterialPageSizeInvalidSameAsCurrent() {
    const vault = createEmptyVault();
    // 预置校验：确认当前状态与默认一致
    assertEqual(vault.ui.materialPageSize, DEFAULT_MATERIAL_PAGE_SIZE, '前置条件：默认页大小');
    assertEqual(vault.ui.materialCurrentPage, 1, '前置条件：默认页码为 1');
    const nextVault = setMaterialPageSize(vault, { pageSize: NaN });
    assertSameReference(nextVault, vault, '非法输入且现状一致时应返回原引用');
}

function testSetQuickSearchKeyword() {
    const vault = createEmptyVault();
    const nextVault = setQuickSearchKeyword(vault, { keyword: 'abc' });
    assertEqual(nextVault.ui.quickSearchKeyword, 'abc', '闪电关键词应更新');
}

function testSetQuickSearchField() {
    const vault = createEmptyVault();
    const nextVault = setQuickSearchField(vault, { field: 'impa' });
    assertEqual(nextVault.ui.quickSearchField, 'impa', '闪电字段应更新');
}

function testSetReqColumnWidths() {
    const vault = createEmptyVault();
    const newWidths = vault.ui.reqColumnWidths.slice();
    newWidths[0] = 80;
    const nextVault = setReqColumnWidths(vault, { widths: newWidths });
    assertEqual(nextVault.ui.reqColumnWidths[0], 80, '第一列宽度应更新');
}

function testSetReqColumnWidthsInvalidLength() {
    const vault = createEmptyVault();
    const nextVault = setReqColumnWidths(vault, { widths: [1, 2, 3] });
    assertSameReference(nextVault, vault, '长度不匹配应返回原引用');
}

function testSetMaterialColumnWidths() {
    const vault = createEmptyVault();
    const newWidths = vault.ui.materialColumnWidths.slice();
    newWidths[0] = 80;
    const nextVault = setMaterialColumnWidths(vault, { widths: newWidths });
    assertEqual(nextVault.ui.materialColumnWidths[0], 80, '第一列宽度应更新');
}

function runAllTests() {
    const testFunctions = [
        testSetActiveTab,
        testSetActiveTabInvalid,
        testSetCurrentLang,
        testSetReqFilterKeyword,
        testSetReqSearchField,
        testSetReqSort,
        testResetReqSort,
        testSetMaterialSearchKeyword,
        testSetMaterialSearchField,
        testSetMaterialPage,
        testSetMaterialPageInvalid,
        testSetMaterialPageSize,
        testSetMaterialPageSizeInvalidSameAsCurrent,
        testSetQuickSearchKeyword,
        testSetQuickSearchField,
        testSetReqColumnWidths,
        testSetReqColumnWidthsInvalidLength,
        testSetMaterialColumnWidths,
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