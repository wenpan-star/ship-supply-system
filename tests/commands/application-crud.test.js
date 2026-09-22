// filename: tests/commands/application-crud.test.js
// 船舶物料申请系统 · 申请单命令层测试
//
// 【M-9 修复】分离深度比较与引用比较。
// 【Bug-4 联动】新增 setReqNo('') 拒绝测试。

import {
    setReqNo,
    setApplicant,
    setApplyTime,
    loadApplication,
    newApplication,
} from '../../src/commands/application-crud.js';
import {
    createEmptyVault,
} from '../../src/core/vault.js';

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

function testSetReqNo() {
    const vault = createEmptyVault();
    const nextVault = setReqNo(vault, { reqNo: 'REQ-NEW' });
    assertDifferentReference(nextVault, vault, '应返回新引用');
    assertEqual(nextVault.currentApplication.reqNo, 'REQ-NEW', '次序号应更新');
}

function testSetReqNoSameValue() {
    const vault = createEmptyVault();
    vault.currentApplication.reqNo = 'REQ-X';
    const nextVault = setReqNo(vault, { reqNo: 'REQ-X' });
    assertSameReference(nextVault, vault, '相同值应返回原引用');
}

function testSetReqNoEmptyIsRejected() {
    // Bug-4：空 reqNo 必须被拒绝，否则会触发"删旧键不写新键"的数据丢失
    const vault = createEmptyVault();
    vault.currentApplication.reqNo = 'REQ-OLD';
    const nextVault = setReqNo(vault, { reqNo: '' });
    assertSameReference(nextVault, vault, '空 reqNo 应返回原引用');
    assertEqual(nextVault.currentApplication.reqNo, 'REQ-OLD', 'reqNo 不应被改为空');
}

function testSetApplicant() {
    const vault = createEmptyVault();
    const nextVault = setApplicant(vault, { applicant: 'C/O' });
    assertEqual(nextVault.currentApplication.applicant, 'C/O', '申请人应更新');
}

function testSetApplyTime() {
    const vault = createEmptyVault();
    const nextVault = setApplyTime(vault, { applyTime: '2026-01-01T12:00' });
    assertEqual(nextVault.currentApplication.applyTime, '2026-01-01T12:00', '时间应更新');
}

function testLoadApplication() {
    const vault = createEmptyVault();
    const nextVault = loadApplication(vault, {
        application: {
            reqNo: 'REQ-L',
            applicant: '2/E',
            applyTime: '2026-02-02T00:00',
            items: [{ impa: '1', description: 'A', quantity: 5, manualStock: 0, remark: '' }],
        },
    });
    assertEqual(nextVault.currentApplication.reqNo, 'REQ-L', '次序号应加载');
    assertEqual(nextVault.currentApplication.items.length, 1, '物料项应加载');
}

function testLoadApplicationInvalidPayload() {
    const vault = createEmptyVault();
    const nextVault = loadApplication(vault, { application: null });
    assertSameReference(nextVault, vault, 'null 应返回原引用');
}

function testNewApplication() {
    const vault = createEmptyVault();
    const nextVault = newApplication(vault, {
        reqNo: 'REQ-NEW',
        applicant: 'C/E',
        applyTime: '2026-03-03T10:00',
    });
    assertEqual(nextVault.currentApplication.reqNo, 'REQ-NEW', '次序号应设置');
    assertEqual(nextVault.currentApplication.items.length, 0, 'items 应为空');
}

function testNewApplicationEmptyReqNo() {
    const vault = createEmptyVault();
    const nextVault = newApplication(vault, { reqNo: '' });
    assertSameReference(nextVault, vault, '空次序号应返回原引用');
}

function runAllTests() {
    const testFunctions = [
        testSetReqNo,
        testSetReqNoSameValue,
        testSetReqNoEmptyIsRejected,
        testSetApplicant,
        testSetApplyTime,
        testLoadApplication,
        testLoadApplicationInvalidPayload,
        testNewApplication,
        testNewApplicationEmptyReqNo,
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