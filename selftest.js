/**
 * 连接自检 UI
 *
 * 用途：任何一台设备（尤其是平板 / 微信内置浏览器）登录不上时，
 * 点一下就能看清是缓存旧代码、SDK 没加载、云端连不通，还是密码哈希有问题。
 *
 * 用法：在页面里放一个挂载点，再引入本文件即可
 *   <div id="selfTestMount"></div>
 *   <script src="selftest.js?v=..."></script>
 *
 * 本脚本只做只读检测，不会修改任何数据。
 */

(function () {
    'use strict';

    const MOUNT_ID = 'selfTestMount';

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    /**
     * 渲染检测结果
     */
    function renderResult(container, result) {
        container.innerHTML = '';

        const summary = el('div',
            'selftest-summary ' + (result.ok ? 'selftest-summary-ok' : 'selftest-summary-bad'),
            result.ok ? '✅ 全部检测项正常' : '❌ 有检测项异常，详见下方红色条目');
        container.appendChild(summary);

        const meta = el('div', 'selftest-meta',
            `检测时间 ${result.finishedAt}｜总耗时 ${result.durationMs} ms｜代码版本 ${result.appVersion}`);
        container.appendChild(meta);

        const list = el('ul', 'selftest-list');
        result.checks.forEach(function (check, index) {
            const item = el('li', 'selftest-item' + (check.ok ? '' : ' selftest-item-bad'));
            item.appendChild(el('span', 'selftest-flag', check.ok ? '✅' : '❌'));
            const body = el('div', 'selftest-body');
            body.appendChild(el('div', 'selftest-name', `${index + 1}. ${check.name}`));
            body.appendChild(el('div', 'selftest-detail', check.detail));
            item.appendChild(body);
            list.appendChild(item);
        });
        container.appendChild(list);

        // 纯文本报告：方便复制/截图发给主办方远程排障
        const report = (typeof storage !== 'undefined' && storage.formatSelfTestReport)
            ? storage.formatSelfTestReport(result)
            : '';
        if (report) {
            const textarea = el('textarea', 'selftest-report');
            textarea.readOnly = true;
            textarea.rows = Math.min(14, report.split('\n').length + 1);
            textarea.value = report;
            container.appendChild(textarea);

            const actions = el('div', 'selftest-actions');
            const copyBtn = el('button', 'selftest-btn', '复制报告');
            copyBtn.type = 'button';
            copyBtn.addEventListener('click', async function () {
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(report);
                        copyBtn.textContent = '已复制 ✅';
                    } else {
                        textarea.focus();
                        textarea.select();
                        document.execCommand('copy');
                        copyBtn.textContent = '已复制 ✅';
                    }
                } catch (err) {
                    textarea.focus();
                    textarea.select();
                    copyBtn.textContent = '请手动全选复制';
                }
                setTimeout(function () { copyBtn.textContent = '复制报告'; }, 2500);
            });
            actions.appendChild(copyBtn);

            const closeBtn = el('button', 'selftest-btn selftest-btn-ghost', '收起');
            closeBtn.type = 'button';
            closeBtn.addEventListener('click', function () { container.innerHTML = ''; });
            actions.appendChild(closeBtn);

            container.appendChild(actions);
        }
    }

    /**
     * 执行一次自检并把结果画到挂载点
     */
    async function runSelfTestUI() {
        const mount = document.getElementById(MOUNT_ID);
        if (!mount) return null;

        const resultBox = mount.querySelector('[data-role="result"]');
        const runBtn = mount.querySelector('[data-role="run"]');

        if (typeof storage === 'undefined' || typeof storage.runSelfTest !== 'function') {
            if (resultBox) {
                resultBox.innerHTML = '';
                resultBox.appendChild(el('div', 'selftest-summary selftest-summary-bad',
                    '❌ 自检脚本未能加载：storage-adapter.js 缺失或版本过旧。请清除浏览器缓存后重新打开页面'));
            }
            return null;
        }

        if (runBtn) { runBtn.disabled = true; runBtn.textContent = '检测中…'; }
        if (resultBox) {
            resultBox.innerHTML = '';
            resultBox.appendChild(el('div', 'selftest-meta', '正在检测 SDK、云端连通性、密码哈希…'));
        }

        try {
            const result = await storage.runSelfTest();
            if (resultBox) renderResult(resultBox, result);
            return result;
        } catch (error) {
            if (resultBox) {
                resultBox.innerHTML = '';
                resultBox.appendChild(el('div', 'selftest-summary selftest-summary-bad',
                    '❌ 自检过程出错：' + (error && error.message ? error.message : error)));
            }
            return null;
        } finally {
            if (runBtn) { runBtn.disabled = false; runBtn.textContent = '🔍 连接自检'; }
        }
    }

    /**
     * 初始化挂载点（页面上存在 #selfTestMount 时才渲染）
     */
    function init() {
        const mount = document.getElementById(MOUNT_ID);
        if (!mount || mount.dataset.initialized === 'true') return;
        mount.dataset.initialized = 'true';

        const trigger = el('button', 'selftest-trigger', '🔍 登录不上？点这里做连接自检');
        trigger.type = 'button';
        trigger.setAttribute('data-role', 'run');
        trigger.addEventListener('click', function () { runSelfTestUI(); });
        mount.appendChild(trigger);

        const resultBox = el('div', 'selftest-result');
        resultBox.setAttribute('data-role', 'result');
        mount.appendChild(resultBox);
    }

    // 暴露给控制台或其他脚本调用：await runConnectionSelfTest()
    window.runConnectionSelfTest = runSelfTestUI;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
