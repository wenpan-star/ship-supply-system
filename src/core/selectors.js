// filename: src/core/selectors.js
// 船舶物料申请系统 · 派生状态（Selector）
// 从 vault 派生出视图真正需要的值，并缓存结果
//
// 【m-41 说明】selectDataCorruptionDetected 读取的是
//   vault.meta.dataCorruptionDetected（纯内存快照）。
//   权威的损坏状态由 core/corruption.js 的 isCorrupted() 提供。

/**
 * 创建一个带缓存的 selector
 * 只有当输入 selector 的结果引用发生变化时，才重新计算
 *
 * 注意：这里使用"引用相等"而非"结构相等"作为缓存失效条件。
 * 命令层保证每次返回新引用（不修改入参），因此引用相等判断足够。
 *
 * 重要：如果 computeFunction 返回引用型结果（对象、数组），
 * 调用方不得修改该结果，否则会污染缓存。
 *
 * @param {Function[]} inputSelectors  输入 selector 数组
 * @param {Function} computeFunction   依赖输入计算派生值的纯函数
 * @returns {Function}
 */
export function createSelector(inputSelectors, computeFunction) {
    let lastInputs = null;
    let lastResult = null;

    return function (state) {
        const currentInputs = new Array(inputSelectors.length);
        for (let index = 0; index < inputSelectors.length; index++) {
            currentInputs[index] = inputSelectors[index](state);
        }

        if (lastInputs !== null) {
            let isEqual = true;
            for (let index = 0; index < currentInputs.length; index++) {
                if (currentInputs[index] !== lastInputs[index]) {
                    isEqual = false;
                    break;
                }
            }
            if (isEqual) {
                return lastResult;
            }
        }

        lastResult = computeFunction.apply(null, currentInputs);
        lastInputs = currentInputs;
        return lastResult;
    };
}

// ==================== 输入 selector（细粒度取值） ====================

/**
 * 选择当前语言的物料数组
 * @param {Object} vault
 * @returns {Object[]}
 */
export function selectCurrentMaterials(vault) {
    return vault.ui.currentLang === 'en' ? vault.materialsEn : vault.materialsZh;
}

/**
 * 选择物料库总条数（当前语言）
 * @param {Object} vault
 * @returns {number}
 */
export function selectMaterialCount(vault) {
    return vault.ui.currentLang === 'en'
        ? vault.materialsEn.length
        : vault.materialsZh.length;
}

/**
 * 选择申请单物料项数
 * @param {Object} vault
 * @returns {number}
 */
export function selectApplicationItemCount(vault) {
    return vault.currentApplication.items.length;
}

/**
 * 选择损坏标志（vault 快照）
 * 【m-41 说明】权威状态在 corruption.isCorrupted()
 * @param {Object} vault
 * @returns {boolean}
 */
export function selectDataCorruptionDetected(vault) {
    return vault.meta.dataCorruptionDetected === true;
}

/**
 * 选择当前激活的 tab
 * @param {Object} vault
 * @returns {string}
 */
export function selectActiveTab(vault) {
    return vault.ui.activeTab;
}

/**
 * 选择申请单表格的过滤关键词
 * @param {Object} vault
 * @returns {string}
 */
export function selectReqFilterKeyword(vault) {
    return vault.ui.reqFilterKeyword;
}

/**
 * 选择申请单表格的搜索字段
 * @param {Object} vault
 * @returns {string}
 */
export function selectReqSearchField(vault) {
    return vault.ui.reqSearchField;
}

/**
 * 选择申请单表格的排序字段
 * @param {Object} vault
 * @returns {string|null}
 */
export function selectReqSortField(vault) {
    return vault.ui.reqSortField;
}

/**
 * 选择申请单表格的排序方向
 * @param {Object} vault
 * @returns {boolean}
 */
export function selectReqSortAsc(vault) {
    return vault.ui.reqSortAsc;
}

/**
 * 选择申请单表格的默认排列方向
 * @param {Object} vault
 * @returns {string}  'reverse' | 'normal'
 */
export function selectReqDefaultOrder(vault) {
    return vault.ui.reqDefaultOrder;
}

/**
 * 选择物料库当前页码
 * @param {Object} vault
 * @returns {number}
 */
export function selectMaterialCurrentPage(vault) {
    return vault.ui.materialCurrentPage;
}

/**
 * 选择物料库分页大小
 * @param {Object} vault
 * @returns {number}
 */
export function selectMaterialPageSize(vault) {
    return vault.ui.materialPageSize;
}