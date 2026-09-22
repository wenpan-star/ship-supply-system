// filename: src/utils/dom.js
// 船舶物料申请系统 · DOM 工具
// 提供最基础的 DOM 查询与文本转义

/**
 * querySelector 简写
 * @param {string} selector
 * @returns {Element|null}
 */
export function $(selector) {
    return document.querySelector(selector);
}

/**
 * querySelectorAll 简写（返回真数组，便于 forEach/filter/map）
 * @param {string} selector
 * @returns {Element[]}
 */
export function $$(selector) {
    return Array.from(document.querySelectorAll(selector));
}

/**
 * HTML 文本转义
 * 覆盖 & < > " '，确保放入属性或文本节点都安全
 * @param {string} inputString
 * @returns {string}
 */
export function escapeHtml(inputString) {
    return String(inputString).replace(/[&<>"']/g, function (matchCharacter) {
        const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        };
        return escapeMap[matchCharacter];
    });
}

/**
 * 创建元素（可选设置属性与子节点）
 * @param {string} tagName
 * @param {Object} [options]
 * @param {Object} [options.attributes]  属性键值对
 * @param {string} [options.textContent] 文本内容（自动转义）
 * @param {string} [options.innerHTML]   HTML 内容（调用方负责转义）
 * @param {Node[]} [options.children]    子节点数组
 * @returns {HTMLElement}
 */
export function createElement(tagName, options) {
    const element = document.createElement(tagName);
    const effectiveOptions = options || {};

    if (effectiveOptions.attributes) {
        const attributeNames = Object.keys(effectiveOptions.attributes);
        for (let index = 0; index < attributeNames.length; index++) {
            const attributeName = attributeNames[index];
            element.setAttribute(attributeName, effectiveOptions.attributes[attributeName]);
        }
    }
    if (typeof effectiveOptions.textContent === 'string') {
        element.textContent = effectiveOptions.textContent;
    }
    if (typeof effectiveOptions.innerHTML === 'string') {
        element.innerHTML = effectiveOptions.innerHTML;
    }
    if (Array.isArray(effectiveOptions.children)) {
        for (let index = 0; index < effectiveOptions.children.length; index++) {
            const child = effectiveOptions.children[index];
            if (child) element.appendChild(child);
        }
    }
    return element;
}

/**
 * 添加事件监听（自动返回清理函数）
 * @param {EventTarget} target
 * @param {string} eventType
 * @param {Function} handler
 * @param {Object} [options]
 * @returns {Function} 移除监听的函数
 */
export function addEventListenerWithCleanup(target, eventType, handler, options) {
    target.addEventListener(eventType, handler, options);
    return function () {
        target.removeEventListener(eventType, handler, options);
    };
}