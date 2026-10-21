// 管理员登录
let currentAdmin = null;

document.getElementById('adminLoginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const username = document.getElementById('adminUsername').value;
    const password = document.getElementById('adminPassword').value;
    
    // 验证管理员账号（从localStorage读取）
    const adminConfig = JSON.parse(localStorage.getItem('adminConfig') || '{"account":"admin","password":"admin123"}');
    
    if (username === adminConfig.account && password === adminConfig.password) {
        currentAdmin = adminConfig;
        document.getElementById('adminName').innerHTML = `管理员：<span class="admin-name-display">${username}</span>`;
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('dashboardSection').style.display = 'block';
        
        loadSpecsForm();
        loadJudgesTable();
    } else {
        alert('账号或密码错误！');
    }
});

// Tab切换
function switchTab(tabName) {
    // 更新按钮状态
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // 更新内容显示
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    if (tabName === 'works') {
        document.getElementById('worksTab').classList.add('active');
        loadWorksTable();
    } else if (tabName === 'specs') {
        document.getElementById('specsTab').classList.add('active');
    } else if (tabName === 'judges') {
        document.getElementById('judgesTab').classList.add('active');
    } else if (tabName === 'scores') {
        document.getElementById('scoresTab').classList.add('active');
        refreshScores();
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
    const specs = JSON.parse(localStorage.getItem('submissionSpecs') || '{}');
    
    // 视频配置
    if (specs.video) {
        document.getElementById('enableVideo').checked = specs.video.enabled !== false;
        document.getElementById('videoFormats').value = specs.video.formats || 'MP4';
        document.getElementById('videoMinWidth').value = specs.video.minWidth || 1920;
        document.getElementById('videoMinHeight').value = specs.video.minHeight || 1080;
        document.getElementById('videoMaxDuration').value = specs.video.maxDuration || 180;
        document.getElementById('videoMaxSize').value = specs.video.maxSize || 100;
        document.getElementById('videoSubtitleRequired').checked = specs.video.subtitleRequired !== false;
    }
    
    // 图像配置
    if (specs.image) {
        document.getElementById('enableImage').checked = specs.image.enabled !== false;
        document.getElementById('imageFormats').value = specs.image.formats || 'JPG, PNG, JPEG';
        document.getElementById('imageMinDPI').value = specs.image.minDPI || 300;
        document.getElementById('imageMinWidth').value = specs.image.minWidth || 2400;
        document.getElementById('imageMinHeight').value = specs.image.minHeight || 1800;
        document.getElementById('imageMinSize').value = specs.image.minSize || 1;
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

// 保存作品规格配置
document.getElementById('specsForm').addEventListener('submit', function(e) {
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
    
    localStorage.setItem('submissionSpecs', JSON.stringify(specs));
    
    // 触发自定义事件通知其他页面
    window.dispatchEvent(new CustomEvent('specsUpdated'));
    
    alert('✅ 配置已保存！\n\n选手端将立即更新：\n• 作品分类显示\n• 上传规则提示\n• 文件校验标准\n\n请刷新选手端页面查看最新配置。');
});

// 恢复默认配置
function resetToDefaults() {
    if (!confirm('确认恢复所有配置为默认值？')) return;
    
    localStorage.removeItem('submissionSpecs');
    loadSpecsForm();
    alert('已恢复默认配置！');
}

// 加载评委列表
async function loadJudgesTable() {
    const judgesData = localStorage.getItem('judges');
    let judges = [];
    
    try {
        judges = judgesData ? JSON.parse(judgesData) : [];
        // 确保是数组
        if (!Array.isArray(judges)) {
            console.warn('judges不是数组，重置为空数组');
            judges = [];
            localStorage.setItem('judges', '[]');
        }
    } catch (e) {
        console.error('解析judges失败:', e);
        judges = [];
        localStorage.setItem('judges', '[]');
    }
    
    const tbody = document.getElementById('judgesTable');
    
    if (!tbody) {
        console.error('找不到judgesTable元素');
        return;
    }
    
    if (judges.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">暂无评委账号</td></tr>';
        return;
    }
    
    // 过滤掉无效数据
    const validJudges = judges.filter(judge => {
        if (!judge || !judge.account || !judge.name) {
            console.warn('发现无效的评委数据:', judge);
            return false;
        }
        return true;
    });
    
    // 如果有无效数据，清理localStorage
    if (validJudges.length !== judges.length) {
        console.log(`清理无效数据：${judges.length - validJudges.length}条`);
        localStorage.setItem('judges', JSON.stringify(validJudges));
    }
    
    if (validJudges.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">暂无评委账号</td></tr>';
        return;
    }
    
    // 从 Supabase 获取每个评委的已评分作品数
    try {
        const { data: allScores, error } = await storage.supabase
            .from('scores')
            .select('judge_account, work_id')
            .eq('is_submitted', true);
        
        if (error) throw error;
        
        // 统计每个评委的已评分作品数
        const scoredCountMap = {};
        if (allScores) {
            allScores.forEach(score => {
                if (!scoredCountMap[score.judge_account]) {
                    scoredCountMap[score.judge_account] = new Set();
                }
                scoredCountMap[score.judge_account].add(score.work_id);
            });
        }
        
        tbody.innerHTML = validJudges.map(judge => {
            const scoredCount = scoredCountMap[judge.account]?.size || 0;
            
            return `
                <tr>
                    <td>${judge.account}</td>
                    <td>${judge.name}</td>
                    <td>-</td>
                    <td>${scoredCount}</td>
                    <td><span class="work-status status-scored">正常</span></td>
                    <td>
                        <button class="btn-secondary btn-sm" onclick="resetJudgePassword('${judge.account}')">重置密码</button>
                        <button class="btn-secondary btn-sm" onclick="deleteJudge('${judge.account}')" style="margin-left: 0.5rem;">删除</button>
                    </td>
                </tr>
            `;
        }).join('');
        
        console.log(`加载评委列表：共${validJudges.length}个评委`);
    } catch (error) {
        console.error('❌ 加载评委列表失败:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">加载失败: ' + error.message + '</td></tr>';
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

// 添加评委
document.getElementById('addJudgeForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const account = document.getElementById('judgeAccount').value;
    const name = document.getElementById('judgeNameInput').value;
    const password = document.getElementById('judgePasswordInput').value;
    
    const judges = JSON.parse(localStorage.getItem('judges') || '[]');
    
    // 检查账号是否已存在
    if (judges.find(j => j.account === account)) {
        alert('该账号已存在！');
        return;
    }
    
    judges.push({ account, name, password });
    localStorage.setItem('judges', JSON.stringify(judges));
    
    alert('评委账号创建成功！');
    closeAddJudgeModal();
    loadJudgesTable();
});

// 重置评委密码
function resetJudgePassword(account) {
    const newPassword = prompt('请输入新密码：');
    if (!newPassword) return;
    
    const judges = JSON.parse(localStorage.getItem('judges') || '[]');
    const judge = judges.find(j => j.account === account);
    
    if (judge) {
        judge.password = newPassword;
        localStorage.setItem('judges', JSON.stringify(judges));
        alert('密码已重置！');
    }
}

// 删除评委
function deleteJudge(account) {
    console.log('开始删除评委:', account);
    
    const judgesData = localStorage.getItem('judges');
    let judges = [];
    
    try {
        judges = judgesData ? JSON.parse(judgesData) : [];
        if (!Array.isArray(judges)) {
            console.error('judges数据格式错误');
            judges = [];
        }
    } catch (e) {
        console.error('解析judges失败:', e);
        alert('数据错误，请刷新页面后重试');
        return;
    }
    
    // 检查是否只剩最后一个评委
    if (judges.length <= 1) {
        alert('⚠️ 至少需要保留一个评委账号！\n\n如需删除所有评委，请先添加新评委后再操作。');
        return;
    }
    
    // 查找要删除的评委
    const judgeToDelete = judges.find(j => j.account === account);
    if (!judgeToDelete) {
        alert('找不到该评委账号，可能已被删除');
        loadJudgesTable(); // 刷新列表
        return;
    }
    
    if (!confirm(`确认删除评委 ${account}（${judgeToDelete.name}）？\n\n此操作将：\n• 删除评委登录账号\n• 清除该评委的所有评分记录\n• 清除相关的作品分配\n\n此操作不可恢复！`)) {
        return;
    }
    
    // 删除评委账号
    const updatedJudges = judges.filter(j => j.account !== account);
    console.log('删除后剩余评委数:', updatedJudges.length);
    
    try {
        localStorage.setItem('judges', JSON.stringify(updatedJudges));
        
        // 验证是否保存成功
        const savedData = localStorage.getItem('judges');
        const parsed = JSON.parse(savedData);
        console.log('保存后的数据:', parsed);
        
        if (parsed.length !== updatedJudges.length) {
            throw new Error('保存的数据与预期不符');
        }
    } catch (e) {
        console.error('保存judges失败:', e);
        alert('保存失败，请重试');
        return;
    }
    
    // 清除该评委的评分记录
    let judgeScores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
    const beforeScores = judgeScores.length;
    judgeScores = judgeScores.filter(s => s.judgeAccount !== account);
    localStorage.setItem('judgeScores', JSON.stringify(judgeScores));
    console.log(`清除评分记录: ${beforeScores} -> ${judgeScores.length}`);
    
    // 清除相关的作品分配
    let assignments = JSON.parse(localStorage.getItem('assignments') || '[]');
    const beforeAssignments = assignments.length;
    assignments = assignments.filter(a => a.judgeAccount !== account);
    localStorage.setItem('assignments', JSON.stringify(assignments));
    console.log(`清除分配记录: ${beforeAssignments} -> ${assignments.length}`);
    
    alert(`✅ 评委 ${account}（${judgeToDelete.name}）已删除！\n\n同时已清理：\n• ${beforeScores - judgeScores.length} 条评分记录\n• ${beforeAssignments - assignments.length} 条分配记录`);
    
    // 强制刷新列表
    setTimeout(() => {
        loadJudgesTable();
    }, 100);
}

// 清空所有评委
function clearAllJudges() {
    const judges = JSON.parse(localStorage.getItem('judges') || '[]');
    
    if (judges.length === 0) {
        alert('当前没有评委账号');
        return;
    }
    
    if (!confirm(`⚠️ 警告：即将清空所有评委账号（共${judges.length}个）！\n\n此操作将：\n• 删除所有评委登录账号\n• 清除所有评分记录\n• 清除所有作品分配关系\n\n此操作不可恢复！确认继续吗？`)) {
        return;
    }
    
    // 二次确认
    const confirmText = prompt(`请输入 "DELETE" 确认清空所有评委：`);
    if (confirmText !== 'DELETE') {
        alert('已取消操作');
        return;
    }
    
    // 清空所有评委数据
    localStorage.setItem('judges', '[]');
    localStorage.setItem('judgeScores', '[]');
    localStorage.setItem('assignments', '[]');
    
    alert('✅ 已清空所有评委及相关数据！\n\n您可以重新添加评委账号。');
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

// 管理员设置
document.getElementById('adminSettingsForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('currentAdminPassword').value;
    const newUsername = document.getElementById('newAdminUsername').value;
    const newPassword = document.getElementById('newAdminPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;
    
    const adminConfig = JSON.parse(localStorage.getItem('adminConfig') || '{"account":"admin","password":"admin123"}');
    
    // 验证当前密码
    if (currentPassword !== adminConfig.password) {
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
        password: newPassword || adminConfig.password
    };
    
    localStorage.setItem('adminConfig', JSON.stringify(newConfig));
    
    alert('设置已更新！请使用新账号密码重新登录。');
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
function batchDeleteWorks() {
    const selectedCheckboxes = document.querySelectorAll('.work-checkbox:checked');
    
    if (selectedCheckboxes.length === 0) {
        alert('请先选择要删除的作品');
        return;
    }
    
    const workIds = Array.from(selectedCheckboxes).map(cb => cb.value);
    const workTitles = Array.from(selectedCheckboxes).map(cb => cb.dataset.title);
    
    if (!confirm(`确认删除以下 ${workIds.length} 个作品？\n\n${workTitles.slice(0, 5).join('\n')}${workTitles.length > 5 ? '\n...' : ''}\n\n此操作将：\n• 删除作品信息\n• 清除相关评分记录\n• 清除相关分配关系\n\n此操作不可恢复！`)) {
        return;
    }
    
    // 删除作品
    let works = JSON.parse(localStorage.getItem('works') || '[]');
    works = works.filter(w => !workIds.includes(w.id));
    localStorage.setItem('works', JSON.stringify(works));
    
    // 删除提交记录
    let submissions = JSON.parse(localStorage.getItem('submissions') || '[]');
    submissions = submissions.filter(s => !workIds.includes(s.id));
    localStorage.setItem('submissions', JSON.stringify(submissions));
    
    // 删除评分记录
    let judgeScores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
    judgeScores = judgeScores.filter(s => !workIds.includes(s.workId));
    localStorage.setItem('judgeScores', JSON.stringify(judgeScores));
    
    // 删除分配关系
    let assignments = JSON.parse(localStorage.getItem('assignments') || '[]');
    assignments = assignments.filter(a => !workIds.includes(a.workId));
    localStorage.setItem('assignments', JSON.stringify(assignments));
    
    alert(`✅ 已成功删除 ${workIds.length} 个作品及相关数据！`);
    
    // 刷新列表
    document.getElementById('selectAllCheckbox').checked = false;
    loadWorksTable();
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

// 加载实时评分数据
function loadScoresData() {
    const works = JSON.parse(localStorage.getItem('works') || '[]');
    const judgeScores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
    const judges = JSON.parse(localStorage.getItem('judges') || '[]');
    const tbody = document.getElementById('scoresTable');
    
    if (judgeScores.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无评分记录</td></tr>';
        return;
    }
    
    // 按作品和评委展开显示
    const rows = [];
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
    
    tbody.innerHTML = rows.map(row => `
        <tr>
            <td>${row.workTitle}</td>
            <td>${row.category}</td>
            <td>${row.author}</td>
            <td>${row.judgeName}</td>
            <td><strong style="color: var(--primary); font-size: 1.2rem;">${row.totalScore.toFixed(1)}</strong></td>
            <td>${row.saveTime}</td>
            <td><span class="work-status status-scored">${row.status}</span></td>
        </tr>
    `).join('');
}

// 刷新评分数据
function refreshScores() {
    loadScoresData();
    alert('数据已刷新！');
}

// ========== 排名导出 ==========

// 生成排名
function generateRanking() {
    const works = JSON.parse(localStorage.getItem('works') || '[]');
    const judgeScores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
    const category = document.getElementById('exportCategory').value;
    const sortBy = document.getElementById('sortBy').value;
    
    // 过滤作品
    let filteredWorks = works.filter(w => w.status === '已通过');
    if (category !== 'all') {
        filteredWorks = filteredWorks.filter(w => w.category === category);
    }
    
    // 计算每个作品的平均分（去掉最高分和最低分后平均）
    const rankedWorks = filteredWorks.map(work => {
        const scores = judgeScores
            .filter(s => s.workId === work.id)
            .map(s => s.totalScore);
        
        let avgScore = 0;
        if (scores.length > 0) {
            if (scores.length >= 3) {
                // 去掉最高分和最低分
                scores.sort((a, b) => a - b);
                const trimmed = scores.slice(1, -1);
                avgScore = trimmed.reduce((sum, s) => sum + s, 0) / trimmed.length;
            } else {
                avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
            }
        }
        
        return {
            ...work,
            avgScore: avgScore,
            scoreCount: scores.length,
            scores: scores
        };
    });
    
    // 排序
    if (sortBy === 'totalDesc') {
        rankedWorks.sort((a, b) => b.avgScore - a.avgScore);
    } else if (sortBy === 'totalAsc') {
        rankedWorks.sort((a, b) => a.avgScore - b.avgScore);
    } else if (sortBy === 'timeDesc') {
        rankedWorks.sort((a, b) => new Date(b.submitTime) - new Date(a.submitTime));
    }
    
    // 添加排名
    rankedWorks.forEach((work, index) => {
        work.rank = index + 1;
    });
    
    // 显示结果
    displayRanking(rankedWorks);
    
    // 保存到全局变量供导出使用
    window.currentRanking = rankedWorks;
}

// 显示排名结果
function displayRanking(rankedWorks) {
    const container = document.getElementById('rankingResult');
    
    if (rankedWorks.length === 0) {
        container.innerHTML = '<div class="empty-state">没有符合条件的作品</div>';
        return;
    }
    
    container.innerHTML = `
        <h4>排名结果（共 ${rankedWorks.length} 个作品）</h4>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>排名</th>
                        <th>作品标题</th>
                        <th>分类</th>
                        <th>作者</th>
                        <th>学校</th>
                        <th>平均分</th>
                        <th>评分人数</th>
                        <th>提交时间</th>
                    </tr>
                </thead>
                <tbody>
                    ${rankedWorks.map((work, index) => `
                        <tr style="${index < 3 ? 'background: rgba(99, 102, 241, 0.1);' : ''}">
                            <td><strong style="color: ${index < 3 ? 'var(--accent)' : 'inherit'}; font-size: ${index < 3 ? '1.3rem' : '1rem'};">${work.rank}</strong></td>
                            <td>${work.title}</td>
                            <td>${getCategoryName(work.category)}</td>
                            <td>${work.author}</td>
                            <td>${work.school}</td>
                            <td><strong style="color: var(--primary);">${work.avgScore.toFixed(2)}</strong></td>
                            <td>${work.scoreCount}人</td>
                            <td>${work.submitTime || '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// 导出Excel
function exportToExcel() {
    if (!window.currentRanking || window.currentRanking.length === 0) {
        alert('请先生成排名！');
        return;
    }
    
    // 创建CSV内容
    const headers = ['排名', '作品标题', '分类', '作者', '学校', '平均分', '评分人数', '提交时间'];
    const rows = window.currentRanking.map(work => [
        work.rank,
        work.title,
        getCategoryName(work.category),
        work.author,
        work.school,
        work.avgScore.toFixed(2),
        work.scoreCount,
        work.submitTime || ''
    ]);
    
    // 添加BOM以支持中文
    let csvContent = '\uFEFF';
    csvContent += headers.join(',') + '\n';
    rows.forEach(row => {
        csvContent += row.map(cell => `"${cell}"`).join(',') + '\n';
    });
    
    // 创建下载链接
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const timestamp = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `AIGC大赛排名_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    alert('排名数据已导出为CSV文件！');
}

// 更新Tab切换函数，添加新的tab
const originalSwitchTab = switchTab;
switchTab = function(tabName) {
    // 更新按钮状态
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // 更新内容显示
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    if (tabName === 'works') {
        document.getElementById('worksTab').classList.add('active');
        loadWorksTable();
    } else if (tabName === 'specs') {
        document.getElementById('specsTab').classList.add('active');
    } else if (tabName === 'judges') {
        document.getElementById('judgesTab').classList.add('active');
    } else if (tabName === 'scores') {
        document.getElementById('scoresTab').classList.add('active');
        loadScoresData();
    } else if (tabName === 'ranking') {
        document.getElementById('rankingTab').classList.add('active');
    } else if (tabName === 'admin') {
        document.getElementById('adminTab').classList.add('active');
    }
};

// 初始化默认数据
window.addEventListener('load', () => {
    // 初始化管理员配置
    if (!localStorage.getItem('adminConfig')) {
        localStorage.setItem('adminConfig', JSON.stringify({
            account: 'admin',
            password: 'admin123'
        }));
    }
    
    // 初始化作品规格
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
    
    // 初始化评分项配置
    if (!localStorage.getItem('scoringItems')) {
        localStorage.setItem('scoringItems', JSON.stringify([
            {name: '创意性', maxScore: 10},
            {name: '完成度', maxScore: 10},
            {name: '表现力', maxScore: 10},
            {name: '契合度', maxScore: 10}
        ]));
    }
    
    // 初始化评委数据（仅在完全没有数据时）
    const existingJudges = localStorage.getItem('judges');
    if (!existingJudges) {
        localStorage.setItem('judges', JSON.stringify([
            { account: 'judge1', name: '张评委', password: 'judge123' },
            { account: 'judge2', name: '李评委', password: 'judge123' }
        ]));
    }
    
    // 创建示例作品（用于测试）
    if (!localStorage.getItem('works')) {
        localStorage.setItem('works', JSON.stringify([
            {
                id: 'work1',
                title: 'AI创意作品A',
                category: 'visual',
                school: '清华大学',
                author: '张三',
                description: '这是一幅使用AI生成的数字艺术作品，展现了未来城市的想象。',
                files: ['artwork.jpg']
            },
            {
                id: 'work2',
                title: '智能诗歌集',
                category: 'text',
                school: '北京大学',
                author: '李四',
                description: '使用AI辅助创作的现代诗集，包含20首原创诗歌。',
                files: ['poems.pdf']
            },
            {
                id: 'work3',
                title: '电子音乐作品',
                category: 'audio',
                school: '中央音乐学院',
                author: '王五',
                description: 'AI生成的电子音乐作品，融合了古典与现代元素。',
                files: ['music.mp3']
            }
        ]));
    }
    
    // 创建示例分配
    if (!localStorage.getItem('assignments')) {
        localStorage.setItem('assignments', JSON.stringify([
            { workId: 'work1', judgeAccount: 'judge1' },
            { workId: 'work2', judgeAccount: 'judge1' },
            { workId: 'work3', judgeAccount: 'judge2' }
        ]));
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
        
        // 获取评委数量
        const judges = await storage.listJudges();
        document.getElementById('judgeCount').textContent = judges.length;
        
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
            // 获取该作品的所有评分
            const assignments = await storage.listAssignments({ work_id: work.id });
            let totalScore = 0;
            let judgeCount = 0;
            const judgeScores = [];
            
            for (const assignment of assignments) {
                const scores = await storage.listScores({ assignment_id: assignment.id });
                for (const score of scores) {
                    if (score.is_submitted && score.score !== null) {
                        totalScore += parseFloat(score.score);
                        judgeCount++;
                        judgeScores.push({
                            judge_id: assignment.judge_id,
                            score: parseFloat(score.score)
                        });
                    }
                }
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
        
        // 构建CSV数据
        let csv = '\uFEFF'; // BOM for UTF-8
        csv += '排名,作品标题,作者,学校,组别,分类,评委数,平均分\n';
        
        // 计算排名（复用loadGroupRanking的逻辑）
        const rankings = [];
        
        for (const work of filteredWorks) {
            const assignments = await storage.listAssignments({ work_id: work.id });
            let totalScore = 0;
            let judgeCount = 0;
            
            for (const assignment of assignments) {
                const scores = await storage.listScores({ assignment_id: assignment.id });
                for (const score of scores) {
                    if (score.is_submitted && score.score !== null) {
                        totalScore += parseFloat(score.score);
                        judgeCount++;
                    }
                }
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
                avg_score: avgScore
            });
        }
        
        // 排序
        rankings.sort((a, b) => {
            if (!a.avg_score && !b.avg_score) return 0;
            if (!a.avg_score) return 1;
            if (!b.avg_score) return -1;
            return parseFloat(b.avg_score) - parseFloat(a.avg_score);
        });
        
        // 添加排名并写入CSV
        rankings.forEach((item, index) => {
            const rank = item.avg_score ? index + 1 : '';
            csv += `${rank},"${item.title}","${item.author_name}","${item.school}","${item.group_name}","${item.category}",${item.judge_count},${item.avg_score}\n`;
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
