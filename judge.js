// 评委登录
let currentJudge = null;
let works = [];
let filteredWorks = []; // 过滤后的作品列表
let currentWork = null;
let currentScore = 0; // 当前评分（0-100）
let isScoreSubmitted = false; // 是否已提交评分
let currentGroupFilter = ''; // 当前组别筛选

document.getElementById('judgeLoginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const username = document.getElementById('judgeUsername').value;
    const password = document.getElementById('judgePassword').value;
    
    try {
        // 尝试从Supabase验证评委账号
        let judge = null;
        
        if (storage.useSupabase && storage.supabase) {
            // 从Supabase查询
            const { data, error } = await storage.supabase
                .from('judges')
                .select('*')
                .eq('account', username)
                .single();
            
            if (!error && data) {
                // 简单密码验证（生产环境应使用bcrypt）
                const passwordHash = await storage.hashPassword(password);
                if (data.password_hash === passwordHash) {
                    judge = { account: data.account, name: data.name, password: password };
                }
            }
        }
        
        // Fallback到localStorage
        if (!judge) {
            const judges = JSON.parse(localStorage.getItem('judges') || '[]');
            judge = judges.find(j => j.account === username && j.password === password);
        }
        
        if (judge) {
            currentJudge = judge;
            document.getElementById('judgeName').innerHTML = `评委：<span class="judge-name-display">${judge.name}</span>`;
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('workbenchSection').style.display = 'block';
            
            loadWorks();
            updateProgress();
        } else {
            alert('账号或密码错误！');
        }
    } catch (error) {
        console.error('❌ 登录失败:', error);
        alert('登录失败: ' + error.message);
    }
});

// 加载作品列表
async function loadWorks() {
    try {
        // 从 Supabase 获取所有作品
        const allWorks = await storage.listWorks();
        
        console.log('📋 所有作品:', allWorks);
        
        // 直接显示所有作品，评委通过组别下拉框筛选（不再使用分配机制）
        works = allWorks || [];
        
        console.log('✅ 显示作品数量:', works.length);
        
        // 应用组别筛选
        applyGroupFilter();
    } catch (error) {
        console.error('❌ 加载作品失败:', error);
        alert('加载作品失败: ' + error.message);
    }
}

// 按组别筛选作品
function filterWorksByGroup() {
    const groupFilter = document.getElementById('groupFilter').value;
    currentGroupFilter = groupFilter;
    console.log('🔍 组别筛选:', groupFilter);
    applyGroupFilter();
}

// 应用组别筛选
function applyGroupFilter() {
    if (!currentGroupFilter) {
        filteredWorks = [...works];
    } else {
        filteredWorks = works.filter(w => w.group_name === currentGroupFilter);
    }
    
    console.log(`📊 显示 ${filteredWorks.length} 个作品 (总共 ${works.length} 个)`);
    renderWorksList();
    updateProgress();
}

async function renderWorksList() {
    const container = document.getElementById('worksList');
    
    if (filteredWorks.length === 0) {
        if (currentGroupFilter) {
            container.innerHTML = '<div class="empty-state">该组别暂无作品</div>';
        } else {
            container.innerHTML = '<div class="empty-state">暂无已提交的作品</div>';
        }
        return;
    }
    
    // 从Supabase查询已评分作品
    let scoredWorkIds = new Set();
    if (storage.useSupabase && storage.supabase) {
        try {
            const { data: scores } = await storage.supabase
                .from('scores')
                .select('work_id')
                .eq('judge_account', currentJudge.account)
                .eq('is_submitted', true);
            
            if (scores) {
                scoredWorkIds = new Set(scores.map(s => s.work_id));
            }
        } catch (error) {
            console.error('❌ 查询评分状态失败:', error);
        }
    } else {
        // Fallback到localStorage
        const judgeScores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
        filteredWorks.forEach(w => {
            if (judgeScores.find(s => s.workId === w.id && s.judgeAccount === currentJudge.account)) {
                scoredWorkIds.add(w.id);
            }
        });
    }
    
    // 调试：打印第一个作品的结构，检查school字段
    if (filteredWorks.length > 0) {
        console.log('=== 作品数据结构调试 ===');
        console.log('完整对象:', JSON.stringify(filteredWorks[0], null, 2));
        console.log('school字段值:', filteredWorks[0].school);
        console.log('contestants字段:', filteredWorks[0].contestants);
        console.log('========================');
    }
    
    container.innerHTML = filteredWorks.map(work => {
        const scored = scoredWorkIds.has(work.id);
        const statusClass = scored ? 'status-scored' : 'status-pending';
        const statusText = scored ? '已评分' : '待评分';
        
        return `
            <div class="work-item" data-work-id="${work.id}">
                <div class="work-item-header">
                    <div class="work-title">${work.title}</div>
                    <span class="work-status ${statusClass}">${statusText}</span>
                </div>
                <div class="work-meta">
                    分类：${getCategoryName(work.category)} | 
                    组别：${work.group_name || '未分配'} | 
                    学校：${work.contestants?.school || work.school || '未知'} | 
                    ${scored ? '得分：' + scored.totalScore : '点击开始评分'}
                </div>
            </div>
        `;
    }).join('');
    
    // 使用事件委托处理点击（避免inline onclick的引号问题）
    container.onclick = function(e) {
        const workItem = e.target.closest('.work-item');
        if (workItem) {
            const workId = workItem.dataset.workId;
            console.log('✅ 点击了作品ID:', workId);
            openScoringPanel(workId);
        }
    };
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

// 打开打分面板
function openScoringPanel(workId) {
    // 从所有作品中查找，而不是仅从过滤后的列表
    currentWork = works.find(w => w.id === workId);
    if (!currentWork) {
        alert('作品不存在');
        return;
    }
    
    console.log('当前评分作品:', currentWork);
    
    document.getElementById('scoringWorkTitle').textContent = `作品打分 - ${currentWork.title}`;
    document.getElementById('detailTitle').textContent = currentWork.title || '未命名';
    document.getElementById('detailCategory').textContent = getCategoryName(currentWork.category);
    
    // 获取选手信息（支持两种数据结构）
    const contestantName = currentWork.contestants?.name || currentWork.author || '未知';
    const contestantSchool = currentWork.contestants?.school || currentWork.school || '未知';
    
    document.getElementById('detailSchool').textContent = contestantSchool;
    document.getElementById('detailDescription').textContent = currentWork.description || '无描述';
    
    // 显示作者信息
    const authorDisplay = document.getElementById('detailAuthor');
    if (authorDisplay) {
        authorDisplay.textContent = contestantName;
    }
    
    // 显示组别信息
    const groupDisplay = document.getElementById('detailGroup');
    if (groupDisplay) {
        groupDisplay.textContent = currentWork.group_name || '未分配';
    }
    
    // 显示文件列表
    const filesContainer = document.getElementById('detailFiles');
    if (currentWork.files && currentWork.files.length > 0) {
        // 判断是否为图片作品
        const isImageWork = currentWork.category === 'image';
        
        if (isImageWork) {
            // 图片作品：显示可点击预览的缩略图
            filesContainer.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 1rem; margin-top: 0.5rem;">
                    ${currentWork.files.map((file, index) => {
                        // 对于测试数据，使用占位图；实际应用中应该是真实图片URL
                        const fileSize = file.size ? (file.size / 1024 / 1024).toFixed(2) : '未知';
                        const resolution = file.metadata ? `${file.metadata.width}×${file.metadata.height}` : '未知分辨率';
                        
                        return `
                            <div class="file-link-preview" onclick="previewImage(${index})" style="cursor: pointer; text-align: center;">
                                <div style="font-size: 3rem; margin-bottom: 0.5rem;">🖼️</div>
                                <div style="font-size: 0.9rem; word-break: break-all;">${file.name}</div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
                                    ${fileSize} MB<br>${resolution}
                                </div>
                                <div style="font-size: 0.75rem; color: var(--primary); margin-top: 0.5rem;">
                                    👁️ 点击查看大图
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } else {
            // 视频作品：显示视频信息
            filesContainer.innerHTML = currentWork.files.map(file => {
                const fileSize = file.size ? (file.size / 1024 / 1024).toFixed(2) : '未知';
                const duration = file.metadata && file.metadata.duration ? 
                    `${Math.floor(file.metadata.duration / 60)}:${Math.floor(file.metadata.duration % 60).toString().padStart(2, '0')}` : 
                    '未知时长';
                const resolution = file.metadata ? `${file.metadata.width}×${file.metadata.height}` : '未知分辨率';
                
                return `
                    <div style="background: rgba(99, 102, 241, 0.1); padding: 1rem; border-radius: 8px; margin-top: 0.5rem;">
                        <div style="font-size: 2rem; margin-bottom: 0.5rem;">🎬</div>
                        <div><strong>文件名：</strong>${file.name}</div>
                        <div><strong>文件大小：</strong>${fileSize} MB</div>
                        <div><strong>分辨率：</strong>${resolution}</div>
                        <div><strong>时长：</strong>${duration}</div>
                        <div style="margin-top: 0.5rem; color: var(--warning); font-size: 0.9rem;">
                            ⚠️ 视频文件需要在本地播放，当前为演示模式
                        </div>
                    </div>
                `;
            }).join('');
        }
    } else {
        filesContainer.innerHTML = '<span style="color: var(--text-secondary);">无附件</span>';
    }
    
    // 显示评分面板，隐藏作品列表区域
    document.querySelector('.filter-section').style.display = 'none';
    document.getElementById('worksList').style.display = 'none';
    document.getElementById('scoringPanel').style.display = 'block';
    
    console.log('✅ 评分面板已显示');
    
    // 从Supabase加载已有评分
    loadExistingScore(workId);
}

// 从Supabase加载已有评分
async function loadExistingScore(workId) {
    try {
        console.log('🔍 加载评分记录, workId:', workId);
        
        // 检查Supabase是否可用
        if (!storage.useSupabase || !storage.supabase) {
            console.log('⚠️ Supabase不可用，使用localStorage');
            resetScoreUI();
            return;
        }

        // 直接通过 work_id 和 judge_account 查询评分
        const { data: scores, error } = await storage.supabase
            .from('scores')
            .select('*')
            .eq('work_id', workId)
            .eq('judge_account', currentJudge.account);
        
        if (error) throw error;
        
        console.log('📊 评分记录:', scores);
        
        if (scores && scores.length > 0) {
            const scoreRecord = scores[0];
            currentScore = parseFloat(scoreRecord.score) || 0;
            isScoreSubmitted = scoreRecord.is_submitted || false;
            
            console.log(`✅ 加载评分: ${currentScore}分, 已提交: ${isScoreSubmitted}`);
            
            // 更新UI
            updateScoreInput(currentScore);
            updateSubmitButton();
        } else {
            console.log('  暂无评分记录');
            resetScoreUI();
        }
    } catch (error) {
        console.error('❌ 加载评分失败:', error);
        resetScoreUI();
    }
}

// 重置评分UI
function resetScoreUI() {
    currentScore = 0;
    isScoreSubmitted = false;
    updateScoreInput(0);
    updateSubmitButton();
}

// 更新评分输入框
function updateScoreInput(value) {
    const scoreInput = document.getElementById('scoreInput');
    if (scoreInput) {
        scoreInput.value = value;
    }
    const scoreDisplay = document.getElementById('scoreDisplay');
    if (scoreDisplay) {
        scoreDisplay.textContent = value.toFixed(1);
    }
}

// 更新提交按钮状态
function updateSubmitButton() {
    const submitBtn = document.querySelector('button[onclick="submitScore()"]');
    if (submitBtn) {
        if (isScoreSubmitted) {
            submitBtn.disabled = true;
            submitBtn.textContent = '已提交';
            submitBtn.style.opacity = '0.5';
        } else {
            submitBtn.disabled = false;
            submitBtn.textContent = '提交评分';
            submitBtn.style.opacity = '1';
        }
    }
}

// 关闭打分面板
function closeScoringPanel() {
    document.getElementById('scoringPanel').style.display = 'none';
    document.querySelector('.filter-section').style.display = 'block';
    document.getElementById('worksList').style.display = 'block';
    currentWork = null;
}

// 暂存评分（保存到Supabase）
async function saveScore() {
    if (!currentWork) return;
    
    try {
        console.log('💾 暂存评分:', currentScore);
        
        if (storage.useSupabase && storage.supabase) {
            // Supabase模式
            const { data: existingScores, error: queryError } = await storage.supabase
                .from('scores')
                .select('*')
                .eq('work_id', currentWork.id)
                .eq('judge_account', currentJudge.account);
            
            if (queryError) throw queryError;
            
            if (existingScores && existingScores.length > 0) {
                const { error: updateError } = await storage.supabase
                    .from('scores')
                    .update({ 
                        score: currentScore,
                        is_submitted: false
                    })
                    .eq('id', existingScores[0].id);
                
                if (updateError) throw updateError;
            } else {
                const { error: insertError } = await storage.supabase
                    .from('scores')
                    .insert([{
                        work_id: currentWork.id,
                        judge_account: currentJudge.account,
                        score: currentScore,
                        is_submitted: false
                    }]);
                
                if (insertError) throw insertError;
            }
        } else {
            // localStorage fallback
            let judgeScores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
            const existingIndex = judgeScores.findIndex(
                s => s.workId === currentWork.id && s.judgeAccount === currentJudge.account
            );
            
            const scoreRecord = {
                workId: currentWork.id,
                judgeAccount: currentJudge.account,
                totalScore: currentScore,
                saveTime: new Date().toLocaleString('zh-CN'),
                isSubmitted: false
            };
            
            if (existingIndex >= 0) {
                judgeScores[existingIndex] = scoreRecord;
            } else {
                judgeScores.push(scoreRecord);
            }
            
            localStorage.setItem('judgeScores', JSON.stringify(judgeScores));
        }
        
        alert('✅ 评分已暂存！');
    } catch (error) {
        console.error('❌ 暂存失败:', error);
        alert('暂存失败: ' + error.message);
    }
}

// 提交评分
async function submitScore() {
    if (!currentWork) return;
    
    if (currentScore === 0) {
        alert('请先输入评分！');
        return;
    }
    
    if (!confirm(`确认提交评分 ${currentScore.toFixed(1)} 分？\n\n提交后将不可修改！`)) {
        return;
    }
    
    try {
        console.log('📤 提交评分:', currentScore);
        
        if (storage.useSupabase && storage.supabase) {
            // Supabase模式
            const { data: existingScores, error: queryError } = await storage.supabase
                .from('scores')
                .select('*')
                .eq('work_id', currentWork.id)
                .eq('judge_account', currentJudge.account);
            
            if (queryError) throw queryError;
            
            if (existingScores && existingScores.length > 0) {
                const { error: updateError } = await storage.supabase
                    .from('scores')
                    .update({ 
                        score: currentScore,
                        is_submitted: true
                    })
                    .eq('id', existingScores[0].id);
                
                if (updateError) throw updateError;
            } else {
                const { error: insertError } = await storage.supabase
                    .from('scores')
                    .insert([{
                        work_id: currentWork.id,
                        judge_account: currentJudge.account,
                        score: currentScore,
                        is_submitted: true
                    }]);
                
                if (insertError) throw insertError;
            }
        } else {
            // localStorage fallback
            let judgeScores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
            const existingIndex = judgeScores.findIndex(
                s => s.workId === currentWork.id && s.judgeAccount === currentJudge.account
            );
            
            const scoreRecord = {
                workId: currentWork.id,
                judgeAccount: currentJudge.account,
                totalScore: currentScore,
                saveTime: new Date().toLocaleString('zh-CN'),
                isSubmitted: true
            };
            
            if (existingIndex >= 0) {
                judgeScores[existingIndex] = scoreRecord;
            } else {
                judgeScores.push(scoreRecord);
            }
            
            localStorage.setItem('judgeScores', JSON.stringify(judgeScores));
        }
        
        isScoreSubmitted = true;
        updateSubmitButton();
        
        alert('✅ 评分提交成功！');
        closeScoringPanel();
        loadWorks();
        updateProgress();
    } catch (error) {
        console.error('❌ 提交失败:', error);
        alert('提交失败: ' + error.message);
    }
}

// 处理评分输入变化
function handleScoreChange(value) {
    currentScore = parseFloat(value);
    if (isNaN(currentScore) || currentScore < 0) currentScore = 0;
    if (currentScore > 100) currentScore = 100;
    
    updateScoreInput(currentScore);
}

// 更新进度
async function updateProgress() {
    const total = filteredWorks.length;
    
    let scored = 0;
    if (storage.useSupabase && storage.supabase) {
        try {
            const { data: scores } = await storage.supabase
                .from('scores')
                .select('work_id')
                .eq('judge_account', currentJudge.account)
                .eq('is_submitted', true);
            
            if (scores) {
                const scoredIds = new Set(scores.map(s => s.work_id));
                scored = filteredWorks.filter(w => scoredIds.has(w.id)).length;
            }
        } catch (error) {
            console.error('❌ 查询进度失败:', error);
        }
    } else {
        // Fallback到localStorage
        const judgeScores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
        scored = filteredWorks.filter(w => 
            judgeScores.find(s => s.workId === w.id && s.judgeAccount === currentJudge.account)
        ).length;
    }
    
    document.getElementById('progressText').textContent = `${scored} / ${total} 已完成`;
    document.getElementById('progressFill').style.width = total > 0 ? `${(scored / total) * 100}%` : '0%';
}

// 退出登录
function logout() {
    if (confirm('确认退出登录？')) {
        location.href = 'index.html';
    }
}

// ========== 图片预览功能 ==========

let currentPreviewIndex = 0;
let currentPreviewFiles = [];

// 预览图片
function previewImage(index) {
    if (!currentWork || !currentWork.files) return;
    
    currentPreviewFiles = currentWork.files;
    currentPreviewIndex = index;
    
    showImagePreview();
}

// 显示图片预览
function showImagePreview() {
    const file = currentPreviewFiles[currentPreviewIndex];
    const modal = document.getElementById('imagePreviewModal');
    const img = document.getElementById('previewImage');
    const title = document.getElementById('previewImageTitle');
    const info = document.getElementById('previewImageInfo');
    const counter = document.getElementById('imageCounter');
    
    // 设置标题
    title.textContent = `${currentWork.title} - 图片预览`;
    
    // 使用真实的base64图片内容
    if (file.content) {
        // 有base64内容，直接显示
        img.src = file.content;
    } else {
        // 没有base64内容，生成占位图
        const canvas = document.createElement('canvas');
        canvas.width = file.metadata?.width || 1920;
        canvas.height = file.metadata?.height || 1080;
        const ctx = canvas.getContext('2d');
        
        // 创建渐变背景
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#667eea');
        gradient.addColorStop(1, '#764ba2');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 添加文字
        ctx.fillStyle = 'white';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(file.name, canvas.width / 2, canvas.height / 2 - 50);
        
        ctx.font = '32px Arial';
        ctx.fillText(`${file.metadata?.width || '?'} × ${file.metadata?.height || '?'}`, canvas.width / 2, canvas.height / 2 + 20);
        
        const fileSize = file.size ? (file.size / 1024 / 1024).toFixed(2) : '?';
        ctx.font = '24px Arial';
        ctx.fillText(`${fileSize} MB`, canvas.width / 2, canvas.height / 2 + 70);
        
        img.src = canvas.toDataURL();
    }
    
    // 显示图片信息
    const fileSize = file.size ? (file.size / 1024 / 1024).toFixed(2) : '?';
    info.innerHTML = `
        <div><strong>文件名：</strong>${file.name}</div>
        <div><strong>分辨率：</strong>${file.metadata?.width || '?'} × ${file.metadata?.height || '?'}</div>
        <div><strong>文件大小：</strong>${fileSize} MB</div>
        ${file.metadata?.dpi_estimated ? `<div><strong>DPI：</strong>${file.metadata.dpi_estimated}</div>` : ''}
        ${file.type ? `<div><strong>文件类型：</strong>${file.type}</div>` : ''}
    `;
    
    // 显示计数器
    counter.textContent = `${currentPreviewIndex + 1} / ${currentPreviewFiles.length}`;
    
    // 显示模态框
    modal.style.display = 'flex';
}

// 关闭图片预览
function closeImagePreview() {
    document.getElementById('imagePreviewModal').style.display = 'none';
}

// 上一张图片
function prevImage() {
    if (currentPreviewIndex > 0) {
        currentPreviewIndex--;
        showImagePreview();
    } else {
        alert('已经是第一张图片了');
    }
}

// 下一张图片
function nextImage() {
    if (currentPreviewIndex < currentPreviewFiles.length - 1) {
        currentPreviewIndex++;
        showImagePreview();
    } else {
        alert('已经是最后一张图片了');
    }
}

// 键盘快捷键支持
document.addEventListener('keydown', function(e) {
    const modal = document.getElementById('imagePreviewModal');
    if (modal.style.display === 'flex') {
        if (e.key === 'Escape') {
            closeImagePreview();
        } else if (e.key === 'ArrowLeft') {
            prevImage();
        } else if (e.key === 'ArrowRight') {
            nextImage();
        }
    }
});

// 初始化
window.addEventListener('load', () => {
    // 检查是否有配置评分项
    if (!localStorage.getItem('scoringItems')) {
        localStorage.setItem('scoringItems', JSON.stringify([
            {name: '创意性', maxScore: 10},
            {name: '完成度', maxScore: 10},
            {name: '表现力', maxScore: 10},
            {name: '契合度', maxScore: 10}
        ]));
    }
});
