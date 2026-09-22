// filename: src/commands/registry.js
// 船舶物料申请系统 · 命令注册表
// 集中声明每个命令的名称、run 函数与影响的切片
//
// 【与 facade.js 的契约】
//   - 每个命令的 run 必须是纯函数：输入旧 Vault，输出新 Vault
//   - affects 声明本命令可能变更的切片，用于精确持久化与通知
//   - persistMode 控制持久化时机（immediate / debounced / skip）
//
// 【m-41 说明】
//   markCorrupted / clearCorruptedFlag 命令保留契约但当前未被视图调用。
//   权威损坏状态由 core/corruption.js 的模块级状态 + localStorage 维护。

import { registerCommands } from '../core/facade.js';
import * as materialCrud from './material-crud.js';
import * as materialBatch from './material-batch.js';
import * as applicationCrud from './application-crud.js';
import * as applicationItems from './application-items.js';
import * as uiState from './ui-state.js';
import * as settingsCrud from './settings-crud.js';
import * as recycleBin from './recycle-bin.js';

export function registerAllCommands() {
    registerCommands({
        // ================================================================
        // 物料库 CRUD
        // ================================================================

        'addMaterial': {
            run: materialCrud.addMaterial,
            affects: ['materials'],
        },

        'editMaterial': {
            run: materialCrud.editMaterial,
            affects: ['materials'],
        },

        'deleteMaterial': {
            run: materialCrud.deleteMaterial,
            affects: ['materials', 'recycleBin'],
        },

        'clearAllMaterials': {
            run: materialCrud.clearAllMaterials,
            affects: ['materials'],
        },

        // ================================================================
        // 物料批量操作
        // ================================================================

        'addMaterialsBatch': {
            run: materialBatch.addMaterialsBatch,
            affects: ['materials'],
        },

        'replaceMaterials': {
            run: materialBatch.replaceMaterials,
            affects: ['materials'],
        },

        'applyImport': {
            run: materialBatch.applyImport,
            affects: ['materials'],
        },

        // ================================================================
        // 申请单头信息
        // ================================================================

        'setReqNo': {
            run: applicationCrud.setReqNo,
            affects: ['application'],
        },

        'setApplicant': {
            run: applicationCrud.setApplicant,
            affects: ['application'],
        },

        'setApplyTime': {
            run: applicationCrud.setApplyTime,
            affects: ['application'],
        },

        'loadApplication': {
            run: applicationCrud.loadApplication,
            affects: ['application'],
        },

        'newApplication': {
            run: applicationCrud.newApplication,
            affects: ['application'],
        },

        // ================================================================
        // 申请单物料项
        // ================================================================

        'addItemToApplication': {
            run: applicationItems.addItemToApplication,
            affects: ['application'],
        },

        'removeItemFromApplication': {
            run: applicationItems.removeItemFromApplication,
            affects: ['application'],
        },

        'batchRemoveItemsFromApplication': {
            run: applicationItems.batchRemoveItemsFromApplication,
            affects: ['application'],
        },

        'updateItemQuantity': {
            run: applicationItems.updateItemQuantity,
            affects: ['application'],
            persistMode: 'debounced',
        },

        'updateItemStock': {
            run: applicationItems.updateItemStock,
            affects: ['application'],
            persistMode: 'debounced',
        },

        'updateItemRemark': {
            run: applicationItems.updateItemRemark,
            affects: ['application'],
            persistMode: 'debounced',
        },

        'replaceApplicationItems': {
            run: applicationItems.replaceApplicationItemsFromPayload,
            affects: ['application'],
        },

        // ================================================================
        // 回收站
        // ================================================================

        'restoreMaterialFromRecycleBin': {
            run: recycleBin.restoreMaterialFromRecycleBin,
            affects: ['materials', 'recycleBin'],
        },

        'restoreMaterialsFromRecycleBin': {
            run: recycleBin.restoreMaterialsFromRecycleBin,
            affects: ['materials', 'recycleBin'],
        },

        'purgeMaterialFromRecycleBin': {
            run: recycleBin.purgeMaterialFromRecycleBin,
            affects: ['recycleBin'],
        },

        'purgeMaterialsFromRecycleBin': {
            run: recycleBin.purgeMaterialsFromRecycleBin,
            affects: ['recycleBin'],
        },

        'clearRecycleBin': {
            run: recycleBin.clearRecycleBin,
            affects: ['recycleBin'],
        },

        'cleanupExpiredRecycleBinItems': {
            run: recycleBin.cleanupExpiredRecycleBinItems,
            affects: ['recycleBin'],
        },

        // ================================================================
        // UI 状态
        // ================================================================

        'setActiveTab': {
            run: uiState.setActiveTab,
            affects: ['ui'],
        },

        'setCurrentLang': {
            run: uiState.setCurrentLang,
            affects: ['ui'],
        },

        'setReqFilterKeyword': {
            run: uiState.setReqFilterKeyword,
            affects: ['ui'],
            persistMode: 'debounced',
        },

        'setReqSearchField': {
            run: uiState.setReqSearchField,
            affects: ['ui'],
        },

        'setReqSort': {
            run: uiState.setReqSort,
            affects: ['ui'],
        },

        'resetReqSort': {
            run: uiState.resetReqSort,
            affects: ['ui'],
        },

        'setMaterialSearchKeyword': {
            run: uiState.setMaterialSearchKeyword,
            affects: ['ui'],
            persistMode: 'debounced',
        },

        'setMaterialSearchField': {
            run: uiState.setMaterialSearchField,
            affects: ['ui'],
        },

        'setMaterialPage': {
            run: uiState.setMaterialPage,
            affects: ['ui'],
        },

        'setMaterialPageSize': {
            run: uiState.setMaterialPageSize,
            affects: ['ui'],
        },

        'setQuickSearchKeyword': {
            run: uiState.setQuickSearchKeyword,
            affects: ['ui'],
            persistMode: 'debounced',
        },

        'setQuickSearchField': {
            run: uiState.setQuickSearchField,
            affects: ['ui'],
        },

        'setReqColumnWidths': {
            run: uiState.setReqColumnWidths,
            affects: ['ui'],
            persistMode: 'debounced',
        },

        'setMaterialColumnWidths': {
            run: uiState.setMaterialColumnWidths,
            affects: ['ui'],
            persistMode: 'debounced',
        },

        // ================================================================
        // 设置项
        // ================================================================

        'setSetting': {
            run: settingsCrud.setSetting,
            affects: ['settings'],
        },

        // ================================================================
        // 元信息
        //
        // m-41 说明：以下两个命令当前未被视图层调用。
        //   - 权威的损坏状态由 core/corruption.js 的 isCorrupted() 提供
        //   - vault.meta.dataCorruptionDetected 是纯数据快照，
        //     用于单元测试与未来的视图层纯函数渲染
        //   - 保留它们是 facade 已注册 API 的契约
        // ================================================================

        'markCorrupted': {
            run: function (vault) {
                if (vault.meta.dataCorruptionDetected === true) return vault;
                return {
                    materialsEn: vault.materialsEn,
                    materialsZh: vault.materialsZh,
                    currentApplication: vault.currentApplication,
                    recycleBin: vault.recycleBin,
                    ui: vault.ui,
                    settings: vault.settings,
                    meta: { dataCorruptionDetected: true },
                };
            },
            affects: ['meta'],
        },

        'clearCorruptedFlag': {
            run: function (vault) {
                if (vault.meta.dataCorruptionDetected === false) return vault;
                return {
                    materialsEn: vault.materialsEn,
                    materialsZh: vault.materialsZh,
                    currentApplication: vault.currentApplication,
                    recycleBin: vault.recycleBin,
                    ui: vault.ui,
                    settings: vault.settings,
                    meta: { dataCorruptionDetected: false },
                };
            },
            affects: ['meta'],
        },
    });
}