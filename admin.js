// 管理员登录
let currentAdmin = null;

document.getElementById('adminLoginForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;
    const submitBtn = this.querySelector('button[type="submit"]');

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '登录中...'; }

    try {
        // 先拉取云端配置，确保校验的是最新的管理员账号，而不是本机旧缓存
        await storage.refreshCloudConfig();

        const result = await storage.loginAdmin(username, password);

        if (result) {
            currentAdmin = result;
            document.getElementById('adminName').innerHTML = `管理员：<span class="admin-name-display">${username}</span>`;
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('dashboardSection').style.display = 'block';

            loadSpecsForm();
            loadJudgesTable();
            loadWorksTable();
            initAdminRealtime();  // 开启评分/作品实时推送 + 轮询兜底
        } else {
            alert('账号或密码错误！');
        }
    } catch (error) {
        console.error('❌ 管理员登录失败:', error);
        alert('登录失败：' + error.message);
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '登录'; }
    }
});

// Tab切换
function switchTab(tabName, event) {
    // 更新按钮状态
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (event && event.target) {
        event.target.classList.add('active');
    } else {
        // 如果没有 event，根据 tabName 找到对应的按钮
        const tabMap = {
            'works': 0, 'specs': 1, 'judges': 2, 'scores': 3,
            'ranking': 4, 'analytics': 5, 'admin': 6
        };
        const buttons = document.querySelectorAll('.tab-btn');
        if (buttons[tabMap[tabName]]) {
            buttons[tabMap[tabName]].classList.add('active');
        }
    }
    
    // 更新内容显示
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    if (tabName === 'works') {
        document.getElementById('worksTab').classList.add('active');
        loadWorksTable();
    } else if (tabName === 'specs') {
        document.getElementById('specsTab').classList.add('active');
        loadSpecsForm();  // 每次进入都用最新缓存（可能已被其他设备更新）重绘表单
    } else if (tabName === 'judges') {
        document.getElementById('judgesTab').classList.add('active');
    } else if (tabName === 'scores') {
        document.getElementById('scoresTab').classList.add('active');
        loadScoresData();  // 切换页签静默加载，不弹窗
    } else if (tabName === 'ranking') {
        document.getElementById('rankingTab').classList.add('active');
    } else if (tabName === 'analytics') {
        document.getElementById('analyticsTab').classList.add('active');
        refreshAnalytics();
    } else if (tabName === 'admin') {
        document.getElementById('adminTab').classList.add('active');
    }
}

// 加载作品规格配置
function loadSpecsForm() {
    // 与出厂默认值合并，保证全新设备上表单也是完整的当前标准
    const specs = storage.getSubmissionSpecs();
    
    // 视频配置
    if (specs.video) {
        document.getElementById('enableVideo').checked = specs.video.enabled !== false;
        document.getElementById('videoFormats').value = (specs.video.formats || ['MP4']).join(', ');
        document.getElementById('videoMinWidth').value = specs.video.minWidth || 1920;
        document.getElementById('videoMinHeight').value = specs.video.minHeight || 1080;
        document.getElementById('videoMaxDuration').value = specs.video.maxDuration || 180;
        document.getElementById('videoMaxSize').value = specs.video.maxSize || 100;
        document.getElementById('videoSubtitleRequired').checked = specs.video.subtitleRequired !== false;
    }
    
    // 图像配置
    if (specs.image) {
        document.getElementById('enableImage').checked = specs.image.enabled !== false;
        document.getElementById('imageFormats').value = (specs.image.formats || ['JPG', 'PNG', 'JPEG']).join(', ');
        document.getElementById('imageMinDPI').value = specs.image.minDPI || 300;
        document.getElementById('imageMinWidth').value = specs.image.minWidth || 2400;
        document.getElementById('imageMinHeight').value = specs.image.minHeight || 1800;
        document.getElementById('imageMinSize').value = specs.image.minSize || 0.1;
        document.getElementById('imageMaxFiles').value = specs.image.maxFiles || 5;
    }
    
    // 通用配置
    if (specs.deadline) {
        document.getElementById('deadline').value = specs.deadline.replace(' ', 'T');
    }
    if (specs.maxSubmissionsPerCategory) {
        document.getElementById('maxSubmissionsPerCategory').value = specs.maxSubmissionsPerCategory;
    }
    if (specs.descriptionMinLength) {
        document.getElementById('descriptionMinLength').value = specs.descriptionMinLength;
    }
    
    // 更新显示状态
    toggleCategory('video');
    toggleCategory('image');
    updateSpecsSyncBanner();
}

// 规格配置的云端同步状态提示
function updateSpecsSyncBanner() {
    const banner = document.getElementById('specsSyncBanner');
    if (!banner) return;

    const state = storage.getCloudConfigState('submissionSpecs');

    if (state === 'cloud') {
        banner.style.display = 'none';
        return;
    }

    banner.style.display = 'block';

    if (state === 'legacy') {
        banner.className = 'sync-banner sync-banner-warn';
        banner.innerHTML = 'ℹ️ 云端保存的是系统初始化时的旧规格（与当前要求不一致），已自动忽略。<br>'
            + '下方显示的是本机正在使用的规格。<button class="btn-primary btn-sm" style="margin-left:0.75rem;" '
            + 'onclick="uploadLocalSpecsToCloud()">把本机规格设为全站标准</button>';
        return;
    }

    if (state === 'missing') {
        banner.className = 'sync-banner sync-banner-warn';
        banner.innerHTML = '⚠️ 云端还没有保存投稿规格，当前配置只对本设备生效，选手端看到的是各自设备的默认值。'
            + '<button class="btn-primary btn-sm" style="margin-left:0.75rem;" '
            + 'onclick="uploadLocalSpecsToCloud()">上传本机规格到云端</button>';
        return;
    }

    banner.className = 'sync-banner sync-banner-error';
    banner.innerHTML = '⚠️ 无法读取云端配置，当前显示的是本机缓存。<br>'
        + '请先在 Supabase SQL Editor 执行 migration_cloud_accounts_and_config.sql，然后刷新页面。';
}

// 把本机规格上传为全站标准
async function uploadLocalSpecsToCloud() {
    const specs = storage.getCachedConfig('submissionSpecs');
    if (!specs) {
        alert('本机没有可上传的规格配置，请先在下方填写并保存。');
        return;
    }

    if (!confirm('将把当前这台设备上的投稿规格设为全站标准？\n\n上传后所有设备的管理端与选手端都会使用这份规格。')) {
        return;
    }

    const result = await storage.saveConfig('submissionSpecs', specs);

    if (result.syncedToCloud) {
        alert('✅ 已上传到云端，成为全站标准配置！');
    } else {
        alert(`❌ 上传失败：${result.cloudError || '未知原因'}`);
    }

    updateSpecsSyncBanner();
}

// 切换类别显示
function toggleCategory(category) {
    if (category === 'video') {
        const enabled = document.getElementById('enableVideo').checked;
        document.getElementById('videoConfigSection').style.display = enabled ? 'block' : 'none';
    } else if (category === 'image') {
        const enabled = document.getElementById('enableImage').checked;
        document.getElementById('imageConfigSection').style.display = enabled ? 'block' : 'none';
    }
}

// 保存作品规格配置（写入云端 configs 表，所有设备与选手端同步生效）
document.getElementById('specsForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const specs = {
        video: {
            enabled: document.getElementById('enableVideo').checked,
            formats: document.getElementById('videoFormats').value.split(',').map(s => s.trim()),
            minWidth: parseInt(document.getElementById('videoMinWidth').value),
            minHeight: parseInt(document.getElementById('videoMinHeight').value),
            maxDuration: parseInt(document.getElementById('videoMaxDuration').value),
            maxSize: parseInt(document.getElementById('videoMaxSize').value),
            subtitleRequired: document.getElementById('videoSubtitleRequired').checked
        },
        image: {
            enabled: document.getElementById('enableImage').checked,
            formats: document.getElementById('imageFormats').value.split(',').map(s => s.trim()),
            minDPI: parseInt(document.getElementById('imageMinDPI').value),
            minWidth: parseInt(document.getElementById('imageMinWidth').value),
            minHeight: parseInt(document.getElementById('imageMinHeight').value),
            minSize: parseFloat(document.getElementById('imageMinSize').value),
            maxFiles: parseInt(document.getElementById('imageMaxFiles').value)
        },
        deadline: document.getElementById('deadline').value.replace('T', ' '),
        maxSubmissionsPerCategory: parseInt(document.getElementById('maxSubmissionsPerCategory').value),
        descriptionMinLength: parseInt(document.getElementById('descriptionMinLength').value)
    };
    
    const submitBtn = this.querySelector('button[type="submit"]');
    const originalLabel = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '保存中...'; }

    let result;
    try {
        result = await storage.saveConfig('submissionSpecs', specs);
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalLabel; }
    }

    // 触发自定义事件通知本页面其他模块
    window.dispatchEvent(new CustomEvent('specsUpdated'));

    if (result.syncedToCloud) {
        alert('✅ 配置已保存到云端！\n\n所有设备的选手端刷新后即可看到最新要求：\n• 作品分类显示\n• 上传规则提示\n• 文件校验标准');
    } else {
        alert(`⚠️ 配置只保存在当前设备！\n\n原因：${result.cloudError || '云端写入失败'}\n\n其他设备与选手端不会看到本次修改，请先在 Supabase 执行 migration_cloud_accounts_and_config.sql，然后重新保存。`);
    }

    updateSpecsSyncBanner();
});

// 恢复默认配置
async function resetToDefaults() {
    if (!confirm('确认恢复所有配置为默认值？\n\n此操作会同时清除云端保存的配置，所有设备都会恢复默认。')) return;

    const result = await storage.deleteConfig('submissionSpecs');
    loadSpecsForm();

    if (result.syncedToCloud) {
        alert('✅ 已恢复默认配置（云端 + 本机）！');
    } else {
        alert(`⚠️ 本机配置已清除，但云端清除失败：\n${result.cloudError || '未知原因'}`);
    }
}

// 加载评委列表（云端优先 + 本机缓存兜底）
async function loadJudgesTable() {
    const tbody = document.getElementById('judgesTable');
    if (!tbody) {
        console.error('找不到judgesTable元素');
        return;
    }

    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">加载中...</td></tr>';

    let judges = [];
    let cloudError = null;
    try {
        judges = await storage.listJudges();
        cloudError = judges.cloudError || null;
    } catch (error) {
        console.error('❌ 加载评委列表失败:', error);
        judges = [];
        cloudError = error.message;
    }

    if (cloudError) {
        console.warn('⚠️ 云端评委读取异常:', cloudError);
    }

    // 过滤无效数据
    judges = judges.filter(j => j && j.account && j.name);

    // 只存在于本机的账号数量（用于提示同步）
    let localOnly = judges.filter(j => j.source === 'local');

    // 首次加载时，自动把历史遗留在本机的账号补传到云端（仅尝试一次）
    if (!cloudError && localOnly.length > 0 && !window.__judgesAutoSyncTried) {
        window.__judgesAutoSyncTried = true;
        try {
            const result = await storage.syncLocalJudgesToCloud();
            if (result.synced > 0) {
                console.log(`✅ 已自动将 ${result.synced} 个本机评委账号同步到云端`);
                judges = await storage.listJudges();
                cloudError = judges.cloudError || null;
                judges = judges.filter(j => j && j.account && j.name);
                localOnly = judges.filter(j => j.source === 'local');
            } else if (result.failed > 0) {
                console.warn('⚠️ 自动同步评委账号失败:', result.errors);
            }
        } catch (error) {
            console.warn('⚠️ 自动同步评委账号异常:', error);
        }
    }

    updateJudgesSyncBanner(localOnly.length, cloudError);

    if (judges.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">暂无评委账号</td></tr>';
        return;
    }

    // 从 Supabase 获取每个评委的已评分作品数
    let scoredCountMap = {};
    try {
        if (storage.useSupabase && storage.supabase) {
            const { data: allScores, error } = await storage.supabase
                .from('scores')
                .select('judge_account, work_id')
                .eq('is_submitted', true);

            if (error) throw error;

            (allScores || []).forEach(score => {
                if (!scoredCountMap[score.judge_account]) {
                    scoredCountMap[score.judge_account] = new Set();
                }
                scoredCountMap[score.judge_account].add(score.work_id);
            });
        }
    } catch (error) {
        console.warn('⚠️ 读取评分统计失败:', error);
    }

    tbody.innerHTML = judges.map(judge => {
        const scoredCount = scoredCountMap[judge.account]?.size || 0;
        const sourceTag = judge.source === 'local'
            ? '<span class="work-status status-pending" title="该账号只保存在当前设备，其他设备无法登录，请点击上方“同步到云端”">仅本机</span>'
            : '<span class="work-status status-scored">云端</span>';

        return `
            <tr>
                <td>${escapeHtml(judge.account)}</td>
                <td>${escapeHtml(judge.name)}</td>
                <td>${sourceTag}</td>
                <td>${scoredCount}</td>
                <td><span class="work-status status-scored">正常</span></td>
                <td>
                    <button class="btn-warning btn-sm" onclick="resetJudgePassword('${escapeAttr(judge.account)}')">重置密码</button>
                    <button class="btn-danger btn-sm" onclick="deleteJudge('${escapeAttr(judge.account)}')" style="margin-left: 0.5rem;">删除</button>
                </td>
            </tr>
        `;
    }).join('');

    console.log(`加载评委列表：共${judges.length}个评委（云端 ${judges.length - localOnly.length} / 仅本机 ${localOnly.length}）`);
}

// HTML 转义，避免账号或姓名中的特殊字符破坏表格
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, '&#39;');
}

// 顶部同步提示条
function updateJudgesSyncBanner(localOnlyCount, cloudError) {
    const banner = document.getElementById('judgesSyncBanner');
    if (!banner) return;

    if (cloudError) {
        banner.style.display = 'block';
        banner.className = 'sync-banner sync-banner-error';
        banner.innerHTML = `⚠️ 云端评委表不可用：${escapeHtml(cloudError)}<br>
            目前新增的账号只会保存在当前设备，其他设备无法登录。`;
        return;
    }

    if (localOnlyCount > 0) {
        banner.style.display = 'block';
        banner.className = 'sync-banner sync-banner-warn';
        banner.innerHTML = `有 <b>${localOnlyCount}</b> 个账号只保存在当前设备（其他设备无法登录）。
            <button class="btn-primary btn-sm" style="margin-left:0.75rem;" onclick="syncJudgesToCloud()">同步到云端</button>`;
        return;
    }

    banner.style.display = 'none';
}

// 把仅本机的账号同步到云端
async function syncJudgesToCloud() {
    try {
        const result = await storage.syncLocalJudgesToCloud();

        if (!result.cloudAvailable) {
            alert('❌ 无法连接云端评委表：\n' + (result.error || '请确认已执行 migration_cloud_accounts_and_config.sql'));
            return;
        }

        let msg = `✅ 同步完成：成功上传 ${result.synced} 个账号`;
        if (result.failed > 0) {
            msg += `，失败 ${result.failed} 个`;
            if (result.errors && result.errors.length) {
                msg += '\n\n失败详情：\n' + result.errors.join('\n');
            }
        }
        if (result.synced === 0 && result.failed === 0) {
            msg = '云端已是最新，没有需要同步的账号。';
        }
        alert(msg);
    } catch (error) {
        console.error('❌ 同步评委失败:', error);
        alert('同步失败：' + error.message);
    } finally {
        loadJudgesTable();
    }
}

// 显示添加评委模态框
function showAddJudgeModal() {
    document.getElementById('addJudgeModal').style.display = 'flex';
}

// 关闭添加评委模态框
function closeAddJudgeModal() {
    document.getElementById('addJudgeModal').style.display = 'none';
    document.getElementById('addJudgeForm').reset();
}

// 添加评委（写入云端，所有设备均可登录）
document.getElementById('addJudgeForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const submitBtn = this.querySelector('button[type="submit"]');
    const originalLabel = submitBtn ? submitBtn.textContent : '';
    const account = document.getElementById('judgeAccount').value.trim();
    const name = document.getElementById('judgeNameInput').value.trim();
    const password = document.getElementById('judgePasswordInput').value;

    if (!account || !name || !password) {
        alert('请填写完整的账号、姓名和密码');
        return;
    }

    // 先用当前已知列表做一次重复校验（云端 + 本机）
    try {
        const existing = await storage.listJudges();
        if (existing.some(j => j.account === account)) {
            alert('该账号已存在！');
            return;
        }
    } catch (err) {
        console.warn('⚠️ 重复校验失败，继续创建:', err);
    }

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '创建中...'; }

    try {
        const result = await storage.createJudge(account, password, name);

        if (result.syncedToCloud) {
            alert(`✅ 评委账号「${name}（${account}）」创建成功！\n\n已保存到云端，评委可在任意设备登录。`);
        } else {
            alert(`⚠️ 评委账号「${name}（${account}）」已创建，但目前只保存在当前设备！\n\n原因：${result.cloudError || '云端写入失败'}\n\n该账号在其他设备上无法登录，请先解决云端问题，再点击列表上方的“同步到云端”。`);
        }

        closeAddJudgeModal();
        await loadJudgesTable();
    } catch (error) {
        console.error('❌ 创建评委失败:', error);
        alert('创建失败：' + error.message);
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalLabel; }
    }
});

// 重置评委密码（同步到云端）
async function resetJudgePassword(account) {
    const newPassword = prompt(`请输入评委 ${account} 的新密码：`);
    if (!newPassword) return;

    try {
        const result = await storage.updateJudge(account, { password: newPassword });

        if (result.syncedToCloud) {
            alert('✅ 密码已重置（已同步到云端，评委可在任意设备用新密码登录）');
        } else {
            alert(`⚠️ 密码已在当前设备重置，但云端同步失败：\n${result.cloudError || '未知原因'}\n\n其他设备仍需使用旧密码。`);
        }
    } catch (error) {
        console.error('❌ 重置密码失败:', error);
        alert('重置失败：' + error.message);
    }

    loadJudgesTable();
}

// 删除评委（云端 + 本机一并删除）
async function deleteJudge(account) {
    console.log('开始删除评委:', account);

    let judges = [];
    try {
        judges = (await storage.listJudges()).filter(j => j && j.account && j.name);
    } catch (e) {
        console.error('读取评委列表失败:', e);
        alert('数据读取失败，请刷新页面后重试');
        return;
    }

    // 检查是否只剩最后一个评委
    if (judges.length <= 1) {
        alert('⚠️ 至少需要保留一个评委账号！\n\n如需删除所有评委，请先添加新评委后再操作。');
        return;
    }

    const judgeToDelete = judges.find(j => j.account === account);
    if (!judgeToDelete) {
        alert('找不到该评委账号，可能已被删除');
        loadJudgesTable();
        return;
    }

    if (!confirm(`确认删除评委 ${account}（${judgeToDelete.name}）？\n\n此操作将：\n• 删除评委登录账号（所有设备）\n• 清除该评委的所有评分记录\n\n此操作不可恢复！`)) {
        return;
    }

    const result = await storage.deleteJudgeByAccount(account);

    if (!result.syncedToCloud && judgeToDelete.source === 'cloud') {
        alert(`❌ 云端删除失败：${result.cloudError || '未知原因'}\n\n账号未被删除。`);
        loadJudgesTable();
        return;
    }

    // 清除该评委的本机评分缓存
    let judgeScores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
    const beforeScores = judgeScores.length;
    judgeScores = judgeScores.filter(s => s.judgeAccount !== account);
    localStorage.setItem('judgeScores', JSON.stringify(judgeScores));

    // 清除云端评分记录
    let cloudScoresRemoved = 0;
    try {
        if (storage.useSupabase && storage.supabase) {
            const { data: removed, error } = await storage.supabase
                .from('scores')
                .delete()
                .eq('judge_account', account)
                .select('id');
            if (error) throw error;
            cloudScoresRemoved = (removed || []).length;
        }
    } catch (error) {
        console.warn('⚠️ 清除云端评分记录失败:', error);
    }

    // 清除历史遗留的本机分配记录
    let assignments = JSON.parse(localStorage.getItem('assignments') || '[]');
    assignments = assignments.filter(a => a.judgeAccount !== account);
    localStorage.setItem('assignments', JSON.stringify(assignments));

    alert(`✅ 评委 ${account}（${judgeToDelete.name}）已删除！\n\n同时已清理评分记录：云端 ${cloudScoresRemoved} 条 / 本机 ${beforeScores - judgeScores.length} 条`);

    setTimeout(() => {
        loadJudgesTable();
        if (typeof scheduleLiveRefresh === 'function') scheduleLiveRefresh('judge-deleted');
    }, 100);
}

// 清空所有评委（云端 + 本机）
async function clearAllJudges() {
    let judges = [];
    try {
        judges = (await storage.listJudges()).filter(j => j && j.account && j.name);
    } catch (e) {
        judges = [];
    }

    if (judges.length === 0) {
        alert('当前没有评委账号');
        return;
    }

    if (!confirm(`⚠️ 警告：即将清空所有评委账号（共${judges.length}个，含云端）！\n\n此操作将：\n• 删除所有评委登录账号\n• 清除所有评分记录\n\n此操作不可恢复！确认继续吗？`)) {
        return;
    }

    const confirmText = prompt(`请输入 "DELETE" 确认清空所有评委：`);
    if (confirmText !== 'DELETE') {
        alert('已取消操作');
        return;
    }

    const result = await storage.clearAllJudges();
    localStorage.setItem('judgeScores', '[]');
    localStorage.setItem('assignments', '[]');

    if (!result.syncedToCloud) {
        alert(`⚠️ 本机评委已清空，但云端清空失败：\n${result.cloudError || '未知原因'}`);
    } else {
        alert('✅ 已清空所有评委及相关数据（云端 + 本机）！\n\n您可以重新添加评委账号。');
    }

    loadJudgesTable();
}

// 调试：查看评委数据
function debugJudgesData() {
    const judgesData = localStorage.getItem('judges');
    const assignmentsData = localStorage.getItem('assignments');
    const scoresData = localStorage.getItem('judgeScores');
    
    let judges = [];
    try {
        judges = judgesData ? JSON.parse(judgesData) : [];
    } catch (e) {
        judges = '解析失败: ' + e.message;
    }
    
    let assignments = [];
    try {
        assignments = assignmentsData ? JSON.parse(assignmentsData) : [];
    } catch (e) {
        assignments = '解析失败';
    }
    
    let scores = [];
    try {
        scores = scoresData ? JSON.parse(scoresData) : [];
    } catch (e) {
        scores = '解析失败';
    }
    
    const debugInfo = `
=== 评委数据调试 ===

【评委列表】(localStorage.judges)
原始数据: ${judgesData}
解析结果: ${JSON.stringify(judges, null, 2)}

【分配记录】(${assignments.length}条)
${JSON.stringify(assignments, null, 2)}

【评分记录】(${scores.length}条)
${JSON.stringify(scores.slice(0, 3), null, 2)}${scores.length > 3 ? '\n... 还有' + (scores.length - 3) + '条' : ''}
    `.trim();
    
    console.log(debugInfo);
    alert('调试信息已输出到控制台\n按F12打开开发者工具查看Console标签');
}

// 管理员设置（账号密码保存到云端 configs 表）
document.getElementById('adminSettingsForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('currentAdminPassword').value;
    const newUsername = document.getElementById('newAdminUsername').value.trim();
    const newPassword = document.getElementById('newAdminPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;
    
    // 先同步云端配置，避免用本机旧密码校验
    await storage.refreshCloudConfig();
    const adminConfig = storage.getCachedConfig('adminConfig') || { account: 'admin', password: 'admin123' };
    
    // 验证当前密码（兼容明文与云端哈希两种存储形式）
    const verified = await storage.loginAdmin(adminConfig.account, currentPassword);
    if (!verified) {
        alert('当前密码错误！');
        return;
    }
    
    // 验证新密码
    if (newPassword && newPassword !== confirmPassword) {
        alert('两次输入的新密码不一致！');
        return;
    }
    
    // 更新配置
    const newConfig = {
        account: newUsername || adminConfig.account,
        password: newPassword || currentPassword
    };
    
    const result = await storage.saveConfig('adminConfig', newConfig);
    
    if (result.syncedToCloud) {
        alert('✅ 设置已更新并同步到云端！\n\n所有设备都需要使用新的账号密码登录管理后台。');
    } else {
        alert(`⚠️ 设置只保存在当前设备！\n\n原因：${result.cloudError || '云端写入失败'}\n\n其他设备仍需使用原来的账号密码。`);
    }
    logout();
});

// 退出登录
function logout() {
    location.href = 'index.html';
}

// ========== 作品管理功能 ==========

// 加载作品列表
async function loadWorksTable() {
    try {
        console.log('📊 加载作品列表...');
        
        // 从Supabase读取作品(包含选手信息)
        const works = await storage.listWorks();
        console.log(`✅ 加载了 ${works.length} 个作品`);
        
        const tbody = document.getElementById('worksTable');
        
        // 更新统计
        const total = works.length;
        const pending = works.filter(w => w.status === 'pending').length;
        const reviewing = works.filter(w => w.status === 'reviewing').length;
        const scored = works.filter(w => w.status === 'scored').length;
        document.getElementById('worksStats').textContent = `总计: ${total} | 待审核: ${pending} | 评审中: ${reviewing} | 已评分: ${scored}`;
        
        if (works.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">暂无作品</td></tr>';
            return;
        }
        
        tbody.innerHTML = works.map(work => {
            const statusClass = work.status === 'scored' ? 'status-scored' : 
                               work.status === 'reviewing' ? 'status-pending' : 'status-pending';
            const statusText = work.status === 'pending' ? '待审核' : 
                              work.status === 'reviewing' ? '评审中' : '已评分';
            
            // 从关联数据获取选手信息
            const contestantName = work.contestants?.name || work.author || '未知';
            const contestantSchool = work.contestants?.school || work.school || '未知';
            const submitTime = work.submit_time ? new Date(work.submit_time).toLocaleString('zh-CN') : '-';
            
            return `
                <tr>
                    <td><input type="checkbox" class="work-checkbox" value="${work.id}" data-title="${work.title}"></td>
                    <td>${submitTime}</td>
                    <td>${work.title}</td>
                    <td>${getCategoryName(work.category)}</td>
                    <td>${contestantName}</td>
                    <td>${contestantSchool}</td>
                    <td><span class="work-status ${statusClass}">${statusText}</span></td>
                    <td>
                        <button class="btn-secondary btn-sm" onclick="viewWorkDetail('${work.id}')">查看</button>
                        <button class="btn-secondary btn-sm" onclick="deleteSingleWork('${work.id}')" style="margin-left: 0.5rem; background: var(--danger);">删除</button>
                    </td>
                </tr>
            `;
        }).join('');
    
    } catch (error) {
        console.error('❌ 加载作品列表失败:', error);
        const tbody = document.getElementById('worksTable');
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">加载失败: ' + error.message + '</td></tr>';
    }
}

// 切换全选
function toggleSelectAll(checked) {
    document.querySelectorAll('.work-checkbox').forEach(cb => {
        cb.checked = checked;
    });
}

// 全选
function selectAllWorksInTable() {
    document.querySelectorAll('.work-checkbox').forEach(cb => cb.checked = true);
    document.getElementById('selectAllCheckbox').checked = true;
}

// 取消全选
function deselectAllWorksInTable() {
    document.querySelectorAll('.work-checkbox').forEach(cb => cb.checked = false);
    document.getElementById('selectAllCheckbox').checked = false;
}

// 批量删除作品
async function batchDeleteWorks() {
    const selectedCheckboxes = document.querySelectorAll('.work-checkbox:checked');
    
    if (selectedCheckboxes.length === 0) {
        alert('请先选择要删除的作品');
        return;
    }
    
    const workIds = Array.from(selectedCheckboxes).map(cb => cb.value);
    const workTitles = Array.from(selectedCheckboxes).map(cb => cb.dataset.title);
    
    if (!confirm(`确认删除以下 ${workIds.length} 个作品？\n\n${workTitles.slice(0, 5).join('\n')}${workTitles.length > 5 ? '\n...' : ''}\n\n此操作将：\n• 从云端数据库删除作品\n• 清除相关评分记录\n\n此操作不可恢复！`)) {
        return;
    }
    
    try {
        // 从 Supabase 删除（评分记录通过外键级联删除）
        if (storage.useSupabase && storage.supabase) {
            const { error, count } = await storage.supabase
                .from('works')
                .delete()
                .in('id', workIds);
            
            if (error) throw error;
            console.log(`✅ 已从云端删除 ${workIds.length} 个作品`);
        }
        
        // 同时清理 localStorage 中的相关数据（兼容性）
        let works = JSON.parse(localStorage.getItem('works') || '[]');
        works = works.filter(w => !workIds.includes(w.id));
        localStorage.setItem('works', JSON.stringify(works));
        
        let submissions = JSON.parse(localStorage.getItem('submissions') || '[]');
        submissions = submissions.filter(s => !workIds.includes(s.id));
        localStorage.setItem('submissions', JSON.stringify(submissions));
        
        let judgeScores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
        judgeScores = judgeScores.filter(s => !workIds.includes(s.workId));
        localStorage.setItem('judgeScores', JSON.stringify(judgeScores));
        
        let assignments = JSON.parse(localStorage.getItem('assignments') || '[]');
        assignments = assignments.filter(a => !workIds.includes(a.workId));
        localStorage.setItem('assignments', JSON.stringify(assignments));
        
        alert(`✅ 已成功删除 ${workIds.length} 个作品及相关数据！`);
        
        // 刷新列表
        document.getElementById('selectAllCheckbox').checked = false;
        loadWorksTable();
    } catch (error) {
        console.error('❌ 批量删除失败:', error);
        alert('删除失败: ' + error.message + '\n\n请确认已在 Supabase 执行 migration_fix_delete_policy.sql');
    }
}

// 删除单个作品
async function deleteSingleWork(workId) {
    try {
        console.log('🗑️ 删除作品:', workId);
        
        // 先从Supabase获取作品信息
        const work = await storage.getWork(workId);
        
        if (!work) {
            alert('作品不存在');
            return;
        }
        
        if (!confirm(`确认删除作品"${work.title}"？\n\n此操作不可恢复！`)) {
            return;
        }
        
        // 从Supabase删除
        await storage.deleteWork(workId);
        
        // 验证删除是否真正生效（防止RLS策略静默拒绝）
        const check = await storage.getWork(workId);
        if (check) {
            throw new Error('数据库拒绝了删除操作（权限策略问题），请在Supabase执行 migration_fix_delete_policy.sql');
        }
        console.log('✅ 作品已从云端删除');
        
        // 等待一下确保删除生效
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 同时清理localStorage中的相关数据(兼容性)
        let submissions = JSON.parse(localStorage.getItem('submissions') || '[]');
        submissions = submissions.filter(s => s.id !== workId);
        localStorage.setItem('submissions', JSON.stringify(submissions));
        
        let judgeScores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
        judgeScores = judgeScores.filter(s => s.work_id !== workId && s.workId !== workId);
        localStorage.setItem('judgeScores', JSON.stringify(judgeScores));
        
        let assignments = JSON.parse(localStorage.getItem('assignments') || '[]');
        assignments = assignments.filter(a => a.work_id !== workId && a.workId !== workId);
        localStorage.setItem('assignments', JSON.stringify(assignments));
        
        alert('作品已删除');
        
        // 强制刷新页面以重新加载数据
        window.location.reload();
        
    } catch (error) {
        console.error('❌ 删除失败:', error);
        alert('删除失败: ' + error.message);
    }
}

function getCategoryName(value) {
    const categories = {
        'visual': '视觉艺术',
        'text': '文本创作',
        'audio': '音频生成',
        'video': '视频制作'
    };
    return categories[value] || value;
}

// 查看作品详情
async function viewWorkDetail(workId) {
    try {
        // 从Supabase获取作品详情
        const works = await storage.listWorks();
        const work = works.find(w => w.id === workId);
        
        if (!work) {
            alert('作品不存在');
            return;
        }
        
        // 获取作者信息
        const authorName = work.contestants?.name || work.author || '未知';
        const school = work.contestants?.school || work.school || '未知';
        const groupName = work.group_name || '未分配';
        
        const detail = `
作品标题：${work.title}
作者：${authorName}
学校：${school}
组别：${groupName}
分类：${getCategoryName(work.category)}
描述：${work.description || '无'}
文件：${work.file_name || '无'}
文件大小：${(work.file_size / 1024 / 1024).toFixed(2)} MB
状态：${work.status}
提交时间：${work.submit_time ? new Date(work.submit_time).toLocaleString('zh-CN') : '-'}
        `.trim();
        
        alert(detail);
    } catch (error) {
        console.error('❌ 获取作品详情失败:', error);
        alert('获取作品详情失败: ' + error.message);
    }
}

// 通过作品
async function approveWork(workId) {
    if (!confirm('确认通过该作品？')) return;
    
    try {
        // 更新Supabase中的作品状态
        const { error } = await storage.supabase
            .from('works')
            .update({ status: 'reviewing' })
            .eq('id', workId);
        
        if (error) throw error;
        
        alert('作品已通过审核！');
        loadWorksTable();
    } catch (error) {
        console.error('❌ 通过作品失败:', error);
        alert('操作失败: ' + error.message);
    }
}

// 驳回作品
async function rejectWork(workId) {
    const reason = prompt('请输入驳回理由：');
    if (!reason) return;
    
    try {
        // 更新Supabase中的作品状态
        const { error } = await storage.supabase
            .from('works')
            .update({ 
                status: 'pending',
                description: reason  // 将驳回理由存储在description字段
            })
            .eq('id', workId);
        
        if (error) throw error;
        
        alert('作品已驳回！');
        loadWorksTable();
    } catch (error) {
        console.error('❌ 驳回作品失败:', error);
        alert('操作失败: ' + error.message);
    }
}

// ========== 实时评分查看 ==========

// 加载实时评分数据（云端 scores 表优先，localStorage 兜底）
async function loadScoresData() {
    const tbody = document.getElementById('scoresTable');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">加载中...</td></tr>';
    
    let rows = [];
    
    try {
        if (storage.useSupabase && storage.supabase) {
            const { data: scores, error } = await storage.supabase
                .from('scores')
                .select('*')
                .order('updated_at', { ascending: false });
            if (error) throw error;
            
            const works = await storage.listWorks();
            const workMap = {};
            works.forEach(w => { workMap[w.id] = w; });
            
            // 评委姓名映射：云端 judges 与本地 localStorage 取并集
            const judgeNameMap = {};
            try {
                (await storage.listJudges()).forEach(j => {
                    if (j && j.account) judgeNameMap[j.account] = j.name || j.account;
                });
            } catch (e) { /* 忽略，继续用账号显示 */ }
            try {
                JSON.parse(localStorage.getItem('judges') || '[]').forEach(j => {
                    if (j && j.account && !judgeNameMap[j.account]) judgeNameMap[j.account] = j.name || j.account;
                });
            } catch (e) { /* 忽略 */ }
            
            rows = (scores || []).map(s => {
                const work = workMap[s.work_id] || {};
                return {
                    workTitle: work.title || '(作品已删除)',
                    category: getCategoryName(work.category || ''),
                    author: work.contestants?.name || work.author || '-',
                    judgeName: judgeNameMap[s.judge_account] || s.judge_account || '-',
                    totalScore: parseFloat(s.score) || 0,
                    saveTime: s.updated_at ? new Date(s.updated_at).toLocaleString('zh-CN') : '-',
                    status: s.is_submitted ? '已提交' : '暂存'
                };
            });
        } else {
            // localStorage 兜底
            const works = JSON.parse(localStorage.getItem('works') || '[]');
            const judgeScores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
            const judges = JSON.parse(localStorage.getItem('judges') || '[]');
            
            judgeScores.forEach(score => {
                const work = works.find(w => w.id === score.workId);
                const judge = judges.find(j => j.account === score.judgeAccount);
                if (work && judge) {
                    rows.push({
                        workTitle: work.title,
                        category: getCategoryName(work.category),
                        author: work.author,
                        judgeName: judge.name,
                        totalScore: score.totalScore,
                        saveTime: score.saveTime,
                        status: '已完成'
                    });
                }
            });
        }
    } catch (error) {
        console.error('❌ 加载评分数据失败:', error);
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">加载失败: ${error.message}</td></tr>`;
        return;
    }
    
    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无评分记录</td></tr>';
        return;
    }
    
    tbody.innerHTML = rows.map(row => `
        <tr>
            <td>${row.workTitle}</td>
            <td>${row.category}</td>
            <td>${row.author}</td>
            <td>${row.judgeName}</td>
            <td><strong style="color: var(--primary); font-size: 1.2rem;">${(row.totalScore || 0).toFixed(1)}</strong></td>
            <td>${row.saveTime}</td>
            <td><span class="work-status ${row.status === '已提交' || row.status === '已完成' ? 'status-scored' : 'status-pending'}">${row.status}</span></td>
        </tr>
    `).join('');
}

// 刷新评分数据（手动按钮）
async function refreshScores() {
    await loadScoresData();
    alert('数据已刷新！');
}


// 初始化默认数据
window.addEventListener('load', async () => {
    // 1) 先从云端拉取共享配置（投稿规格 / 管理员账号 / 评分项）刷新本机缓存
    const cloudResult = await storage.refreshCloudConfig();
    if (!cloudResult.ok) {
        console.warn('⚠️ 云端配置不可用，本次使用本机配置：', cloudResult.reason);
    }

    // 2) 本机上不存在的配置写入默认值（仅本机缓存，随后再决定是否上传云端）
    if (!localStorage.getItem('adminConfig')) {
        localStorage.setItem('adminConfig', JSON.stringify({
            account: 'admin',
            password: 'admin123'
        }));
    }
    
    if (!localStorage.getItem('submissionSpecs')) {
        localStorage.setItem('submissionSpecs', JSON.stringify({
            categories: ['视觉艺术', '文本创作', '音频生成', '视频制作'],
            formats: 'JPG, PNG, MP4, PDF, DOCX',
            maxFileSize: 50,
            deadline: '2026-12-31 23:59',
            maxSubmissions: 1,
            descriptionMinLength: 50,
            maxFilesPerSubmission: 5
        }));
    }
    
    // 历史配置迁移：图片最小文件大小由 1MB 调整为 0.1MB
    // （旧浏览器 localStorage 里可能存着 minSize=1，这里统一纠正）
    try {
        const storedSpecs = JSON.parse(localStorage.getItem('submissionSpecs') || '{}');
        if (storedSpecs.image && storedSpecs.image.minSize === 1) {
            storedSpecs.image.minSize = 0.1;
            localStorage.setItem('submissionSpecs', JSON.stringify(storedSpecs));
            console.log('ℹ️ 已将图片最小文件大小配置从 1MB 迁移为 0.1MB');
            // 纠正后的值需要覆盖云端，否则其他设备仍会读到 1MB
            await storage.saveConfig('submissionSpecs', storedSpecs);
        }
    } catch (e) {
        console.warn('⚠️ 规格配置迁移失败:', e);
    }
    
    // 初始化评分项配置
    if (!localStorage.getItem('scoringItems')) {
        localStorage.setItem('scoringItems', JSON.stringify([
            {name: '创意性', maxScore: 10},
            {name: '完成度', maxScore: 10},
            {name: '表现力', maxScore: 10},
            {name: '契合度', maxScore: 10}
        ]));
    }

    // 3) 把本机已有、云端还缺失的配置补传到云端
    //    投稿规格影响全站的上传校验规则，不自动上传，
    //    改由管理员在「作品规格配置」页确认后手动保存
    try {
        const syncResult = await storage.syncLocalConfigToCloud(['adminConfig', 'scoringItems']);
        if (syncResult.cloudAvailable && syncResult.synced > 0) {
            console.log(`✅ 已将 ${syncResult.synced} 项本机配置上传到云端`);
        } else if (!syncResult.cloudAvailable) {
            console.warn('⚠️ 配置云端同步不可用：', (syncResult.errors || []).join('；'));
        }
    } catch (e) {
        console.warn('⚠️ 配置云端同步异常:', e);
    }

    updateSpecsSyncBanner();
    
    // 评委账号统一存储在云端 judges 表（跨设备共享），
    // 不再写入任何默认演示账号，避免各设备出现「仅本机」的幽灵账号。
    try {
        const cloudJudges = await storage.listCloudJudges();
        const localJudges = JSON.parse(localStorage.getItem('judges') || '[]');
        if (cloudJudges.length === 0 && Array.isArray(localJudges) && localJudges.length > 0) {
            console.log(`ℹ️ 检测到 ${localJudges.length} 个仅存在于本机的评委账号，将在打开「评委账号管理」时自动同步到云端`);
        }
    } catch (e) {
        console.warn('⚠️ 评委账号云端检查失败:', e);
    }
});

// ============================================
// 访问统计功能
// ============================================

async function refreshAnalytics() {
    try {
        console.log('📊 加载访问统计数据...');
        
        // 获取页面访问统计
        let stats;
        try {
            stats = await storage.getPageViewStats();
            console.log('✅ 统计数据:', stats);
        } catch (pageViewError) {
            console.warn('⚠️ 无法获取页面访问统计(可能page_views表不存在):', pageViewError.message);
            stats = { total: 0, today: 0, byPage: [] };
        }
        
        // 更新总览卡片
        document.getElementById('totalViews').textContent = stats.total || 0;
        document.getElementById('todayViews').textContent = stats.today || 0;
        
        // 获取作品提交数量
        const works = await storage.listWorks();
        document.getElementById('submissionCount').textContent = works.length;
        
        // 获取评委数量（评委账号由管理端存于 localStorage，Supabase judges 表为云端副本，
        // 两者取并集，避免任一为空时显示 0）
        let cloudJudges = [];
        try {
            cloudJudges = await storage.listJudges();
        } catch (judgeErr) {
            console.warn('⚠️ 读取云端评委失败:', judgeErr.message);
        }
        let localJudges = [];
        try {
            localJudges = JSON.parse(localStorage.getItem('judges') || '[]');
        } catch (e) {
            localJudges = [];
        }
        const judgeAccounts = new Set();
        [...cloudJudges, ...localJudges].forEach(j => {
            if (j && j.account) judgeAccounts.add(j.account);
        });
        document.getElementById('judgeCount').textContent = judgeAccounts.size;
        
        // 更新各页面访问量表格
        const pageViewsTable = document.getElementById('pageViewsTable');
        if (stats.byPage && stats.byPage.length > 0) {
            const totalFromPages = stats.byPage.reduce((sum, p) => sum + (p.count || 0), 0);
            pageViewsTable.innerHTML = stats.byPage.map(page => {
                const count = page.count || 0;
                const percentage = totalFromPages > 0 ? ((count / totalFromPages) * 100).toFixed(1) : 0;
                const pageNames = {
                    'index': '首页',
                    'contestant': '选手端',
                    'judge': '评委端',
                    'admin': '管理端'
                };
                return `
                    <tr>
                        <td>${pageNames[page.page_name] || page.page_name}</td>
                        <td>${count}</td>
                        <td>${percentage}%</td>
                    </tr>
                `;
            }).join('');
        } else {
            pageViewsTable.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-secondary);">暂无数据，等待用户访问...</td></tr>';
        }
        
        // 更新最近访问记录
        const recentVisits = await storage.getPageViews({ limit: 20 });
        const recentVisitsTable = document.getElementById('recentVisitsTable');
        if (recentVisits && recentVisits.length > 0) {
            recentVisitsTable.innerHTML = recentVisits.slice(0, 20).map(view => {
                const date = new Date(view.visited_at);
                const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
                const pageNames = {
                    'index': '首页',
                    'contestant': '选手端',
                    'judge': '评委端',
                    'admin': '管理端'
                };
                const referrer = view.referrer ? (new URL(view.referrer)).hostname : '直接访问';
                return `
                    <tr>
                        <td>${timeStr}</td>
                        <td>${pageNames[view.page_name] || view.page_name}</td>
                        <td>${referrer}</td>
                    </tr>
                `;
            }).join('');
        } else {
            recentVisitsTable.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-secondary);">暂无访问记录</td></tr>';
        }
        
    } catch (error) {
        console.error(' 加载访问统计失败:', error);
        alert('加载统计数据失败: ' + error.message);
    }
}

// ============================================
// 排名统计与Excel导出功能
// ============================================

// 加载组别排名
async function loadGroupRanking() {
    const groupFilter = document.getElementById('groupFilter').value;
    const container = document.getElementById('rankingResult');
    
    try {
        container.innerHTML = '<div class="empty-state">加载中...</div>';
        
        // 获取所有作品
        const works = await storage.listWorks();
        
        // 按组别过滤
        let filteredWorks = groupFilter ? works.filter(w => w.group_name === groupFilter) : works;
        
        if (filteredWorks.length === 0) {
            container.innerHTML = '<div class="empty-state">该组别暂无作品</div>';
            return;
        }
        
        // 计算每个作品的平均分和排名
        const rankings = [];
        
        for (const work of filteredWorks) {
            // 直接从Supabase查询该作品的所有已提交评分
            let totalScore = 0;
            let judgeCount = 0;
            const judgeScores = [];
            
            if (storage.useSupabase && storage.supabase) {
                const { data: scores, error } = await storage.supabase
                    .from('scores')
                    .select('*')
                    .eq('work_id', work.id)
                    .eq('is_submitted', true);
                
                if (error) throw error;
                
                if (scores) {
                    judgeCount = scores.length;
                    scores.forEach(score => {
                        totalScore += parseFloat(score.score);
                        judgeScores.push({
                            judge_account: score.judge_account,
                            score: parseFloat(score.score)
                        });
                    });
                }
            } else {
                // localStorage fallback
                const allScores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
                const workScores = allScores.filter(s => 
                    s.workId === work.id && s.isSubmitted
                );
                
                judgeCount = workScores.length;
                workScores.forEach(score => {
                    totalScore += score.totalScore;
                    judgeScores.push({
                        judge_account: score.judgeAccount,
                        score: score.totalScore
                    });
                });
            }
            
            const avgScore = judgeCount > 0 ? (totalScore / judgeCount).toFixed(2) : null;
            
            // 获取作者信息
            const authorName = work.contestants?.name || '未知';
            const school = work.contestants?.school || '未知';
            
            rankings.push({
                work_id: work.id,
                title: work.title,
                group_name: work.group_name,
                category: work.category,
                author_name: authorName,
                school: school,
                judge_count: judgeCount,
                avg_score: avgScore ? parseFloat(avgScore) : null,
                judge_scores: judgeScores
            });
        }
        
        // 按平均分降序排序，无分数的排最后
        rankings.sort((a, b) => {
            if (a.avg_score === null && b.avg_score === null) return 0;
            if (a.avg_score === null) return 1;
            if (b.avg_score === null) return -1;
            return b.avg_score - a.avg_score;
        });
        
        // 添加排名
        rankings.forEach((item, index) => {
            item.ranking = item.avg_score !== null ? index + 1 : null;
        });
        
        // 渲染排名表格
        renderRankingTable(rankings, groupFilter);
        
    } catch (error) {
        console.error('❌ 加载排名失败:', error);
        container.innerHTML = `<div class="empty-state">加载失败: ${error.message}</div>`;
    }
}

// 渲染排名表格
function renderRankingTable(rankings, groupFilter) {
    const container = document.getElementById('rankingResult');
    
    if (rankings.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无数据</div>';
        return;
    }
    
    let html = `
        <div style="margin-bottom: 1rem;">
            <strong>组别：</strong>${groupFilter || '全部'} | 
            <strong>作品数：</strong>${rankings.length} | 
            <strong>已评分：</strong>${rankings.filter(r => r.avg_score !== null).length}
        </div>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>排名</th>
                        <th>作品标题</th>
                        <th>作者</th>
                        <th>学校</th>
                        <th>组别</th>
                        <th>分类</th>
                        <th>评委数</th>
                        <th>平均分</th>
                        <th>各评委评分</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    rankings.forEach(item => {
        const rankDisplay = item.ranking ? 
            `<span style="font-weight: bold; color: ${item.ranking <= 3 ? 'var(--primary)' : 'inherit'};">#${item.ranking}</span>` : 
            '-';
        
        const scoreDisplay = item.avg_score !== null ? 
            `<span style="font-weight: bold; font-size: 1.1rem;">${item.avg_score.toFixed(2)}</span>` : 
            '<span style="color: var(--text-secondary);">待评分</span>';
        
        const judgeDetail = (item.judge_scores && item.judge_scores.length) ?
            item.judge_scores.map(js => `<div style="font-size: 0.85rem; white-space: nowrap;">${js.judge_account}：<strong>${js.score}</strong></div>`).join('') :
            '<span style="color: var(--text-secondary);">-</span>';
        
        html += `
            <tr>
                <td>${rankDisplay}</td>
                <td>${item.title}</td>
                <td>${item.author_name}</td>
                <td>${item.school}</td>
                <td>${item.group_name || '-'}</td>
                <td>${getCategoryName(item.category)}</td>
                <td>${item.judge_count}</td>
                <td>${scoreDisplay}</td>
                <td>${judgeDetail}</td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = html;
}

// 导出排名到Excel
async function exportRankingToExcel() {
    const groupFilter = document.getElementById('groupFilter').value;
    
    try {
        // 获取排名数据
        const works = await storage.listWorks();
        let filteredWorks = groupFilter ? works.filter(w => w.group_name === groupFilter) : works;
        
        if (filteredWorks.length === 0) {
            alert('没有可导出的数据');
            return;
        }
        
        // 评委账号 → 姓名 映射（用于导出表头）
        let judgeNameMap = {};
        try {
            const judges = await storage.listJudges();
            (judges || []).forEach(j => {
                if (j && j.account) judgeNameMap[j.account] = j.name || j.account;
            });
        } catch (e) {
            console.warn('⚠️ 读取评委名单失败，导出表头将仅显示账号:', e);
        }
        
        // 计算排名（复用loadGroupRanking的逻辑），并记录每位评委的单独分数
        const rankings = [];
        const judgeAccountSet = new Set();
        
        for (const work of filteredWorks) {
            let totalScore = 0;
            let judgeCount = 0;
            const judgeScores = {};  // 评委账号 -> 该评委给出的分数
            
            if (storage.useSupabase && storage.supabase) {
                const { data: scores, error } = await storage.supabase
                    .from('scores')
                    .select('*')
                    .eq('work_id', work.id)
                    .eq('is_submitted', true);
                
                if (error) throw error;
                
                if (scores) {
                    scores.forEach(score => {
                        const val = parseFloat(score.score);
                        totalScore += val;
                        judgeCount++;
                        const acc = score.judge_account || '未知评委';
                        judgeScores[acc] = val;
                        judgeAccountSet.add(acc);
                    });
                }
            } else {
                // localStorage fallback
                const allScores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
                const workScores = allScores.filter(s => 
                    s.workId === work.id && s.isSubmitted
                );
                
                workScores.forEach(score => {
                    totalScore += score.totalScore;
                    judgeCount++;
                    const acc = score.judgeAccount || '未知评委';
                    judgeScores[acc] = score.totalScore;
                    judgeAccountSet.add(acc);
                });
            }
            
            const avgScore = judgeCount > 0 ? (totalScore / judgeCount).toFixed(2) : '';
            const authorName = work.contestants?.name || '未知';
            const school = work.contestants?.school || '未知';
            
            rankings.push({
                title: work.title,
                author_name: authorName,
                school: school,
                group_name: work.group_name || '',
                category: getCategoryName(work.category),
                judge_count: judgeCount,
                avg_score: avgScore,
                judge_scores: judgeScores
            });
        }
        
        // 排序
        rankings.sort((a, b) => {
            if (!a.avg_score && !b.avg_score) return 0;
            if (!a.avg_score) return 1;
            if (!b.avg_score) return -1;
            return parseFloat(b.avg_score) - parseFloat(a.avg_score);
        });
        
        // 评委列（所有出现过的评委，按账号排序，保证列顺序稳定）
        const judgeAccounts = [...judgeAccountSet].sort();
        const esc = v => `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""')}"`;
        
        // 构建CSV数据：基础列 + 每位评委一列 + 明细列
        let csv = '\uFEFF'; // BOM for UTF-8
        const header = ['排名', '作品标题', '作者', '学校', '组别', '分类', '评委数', '平均分']
            .concat(judgeAccounts.map(acc => esc(`${judgeNameMap[acc] || acc}(${acc})`)))
            .concat(['各评委评分明细']);
        csv += header.join(',') + '\n';
        
        // 添加排名并写入CSV
        rankings.forEach((item, index) => {
            const rank = item.avg_score ? index + 1 : '';
            const judgeCells = judgeAccounts.map(acc => 
                item.judge_scores[acc] !== undefined ? item.judge_scores[acc] : ''
            );
            const detail = judgeAccounts
                .filter(acc => item.judge_scores[acc] !== undefined)
                .map(acc => `${judgeNameMap[acc] || acc}:${item.judge_scores[acc]}`)
                .join('; ');
            
            csv += [
                rank,
                esc(item.title),
                esc(item.author_name),
                esc(item.school),
                esc(item.group_name),
                esc(item.category),
                item.judge_count,
                item.avg_score,
                ...judgeCells,
                esc(detail)
            ].join(',') + '\n';
        });
        
        // 下载文件
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().slice(0, 10);
        const filename = `成绩排名_${groupFilter || '全部组别'}_${timestamp}.csv`;
        
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        alert(`✅ 已成功导出 ${rankings.length} 条记录`);
        
    } catch (error) {
        console.error('❌ 导出失败:', error);
        alert('导出失败: ' + error.message);
    }
}

// ============================================
// 实时数据推送（Supabase Realtime + 轮询兜底）
// ============================================
let liveRefreshTimer = null;
let pollTimer = null;
let realtimeChannel = null;

// 当前激活的页签
function currentActiveTab() {
    const map = ['works', 'specs', 'judges', 'scores', 'ranking', 'analytics', 'admin'];
    const buttons = [...document.querySelectorAll('.tab-btn')];
    const idx = buttons.findIndex(b => b.classList.contains('active'));
    return idx >= 0 ? map[idx] : null;
}

// 防抖刷新当前页签数据
function scheduleLiveRefresh(reason) {
    clearTimeout(liveRefreshTimer);
    liveRefreshTimer = setTimeout(() => {
        const tab = currentActiveTab();
        console.log(`🔄 检测到数据变化(${reason})，刷新页签:`, tab);
        if (tab === 'scores') loadScoresData();
        else if (tab === 'works') loadWorksTable();
        else if (tab === 'ranking') loadGroupRanking();
        else if (tab === 'analytics') refreshAnalytics();
    }, 800);
}

// 云端配置变更：刷新本机缓存，并在不打断编辑的前提下更新界面
let configRefreshTimer = null;

async function handleCloudConfigChange(reason) {
    clearTimeout(configRefreshTimer);
    configRefreshTimer = setTimeout(async () => {
        try {
            console.log(`🔄 检测到云端配置变化(${reason})，重新拉取...`);
            const result = await storage.refreshCloudConfig();
            if (!result.ok) return;

            const tab = currentActiveTab();
            if (tab === 'specs') {
                // 管理员可能正在编辑表单，不直接覆盖输入内容
                showConfigUpdatedToast();
            } else {
                loadSpecsForm();
            }
            if (tab === 'judges') loadJudgesTable();
        } catch (error) {
            console.warn('⚠️ 处理云端配置变更失败:', error);
        }
    }, 600);
}

function showConfigUpdatedToast() {
    const old = document.getElementById('configUpdatedToast');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.id = 'configUpdatedToast';
    toast.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9999;background:#1f2937;color:#fff;'
        + 'padding:1rem 1.25rem;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.35);font-size:0.9rem;max-width:320px;';
    toast.innerHTML = '🔄 云端配置已被其他设备更新。'
        + '<button id="configToastReload" class="btn-primary btn-sm" style="margin-top:0.6rem;display:block;">载入最新配置</button>';
    document.body.appendChild(toast);

    document.getElementById('configToastReload').addEventListener('click', () => {
        loadSpecsForm();
        toast.remove();
    });

    setTimeout(() => { if (toast.isConnected) toast.remove(); }, 15000);
}

// 初始化 Realtime 订阅 + 轮询兜底
function initAdminRealtime() {
    // Realtime 推送（需 Supabase 开启 scores/works 表的 Realtime）
    if (storage.useSupabase && storage.supabase && !realtimeChannel) {
        try {
            realtimeChannel = storage.supabase
                .channel('admin-live-changes')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' },
                    p => scheduleLiveRefresh('scores:' + p.eventType))
                .on('postgres_changes', { event: '*', schema: 'public', table: 'works' },
                    p => scheduleLiveRefresh('works:' + p.eventType))
                .on('postgres_changes', { event: '*', schema: 'public', table: 'configs' },
                    p => handleCloudConfigChange('configs:' + p.eventType))
                .subscribe(status => console.log('📡 Realtime 状态:', status));
        } catch (e) {
            console.warn('⚠️ Realtime 订阅失败，仅用轮询:', e);
        }
    }
    
    // 轮询兜底：每 20 秒静默刷新当前页签（即使 Realtime 未开通也保持较新）
    if (!pollTimer) {
        pollTimer = setInterval(() => {
            const tab = currentActiveTab();
            if (tab === 'scores') loadScoresData();
            else if (tab === 'works') loadWorksTable();
            else if (tab === 'ranking') loadGroupRanking();
        }, 20000);
    }
}
