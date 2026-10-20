// 评委登录
let currentJudge = null;
let works = [];
let filteredWorks = []; // 过滤后的作品列表
let currentWork = null;
let scores = {};
let currentGroupFilter = ''; // 当前组别筛选

document.getElementById('judgeLoginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const username = document.getElementById('judgeUsername').value;
    const password = document.getElementById('judgePassword').value;
    
    // 验证评委账号
    const judges = JSON.parse(localStorage.getItem('judges') || '[]');
    const judge = judges.find(j => j.account === username && j.password === password);
    
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
});

// 加载作品列表
function loadWorks() {
    const allWorks = JSON.parse(localStorage.getItem('works') || '[]');
    const assignments = JSON.parse(localStorage.getItem('assignments') || '[]');
    
    console.log('所有作品:', allWorks);
    console.log('所有分配:', assignments);
    console.log('当前评委:', currentJudge.account);
    
    // 获取分配给当前评委的作品
    const assignedWorkIds = assignments
        .filter(a => a.judgeAccount === currentJudge.account)
        .map(a => a.workId);
    
    console.log('分配的作品ID:', assignedWorkIds);
    
    works = allWorks.filter(w => assignedWorkIds.includes(w.id));
    
    console.log('过滤后的作品:', works);
    
    // 应用组别筛选
    applyGroupFilter();
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

function renderWorksList() {
    const container = document.getElementById('worksList');
    
    if (filteredWorks.length === 0) {
        if (currentGroupFilter) {
            container.innerHTML = '<div class="empty-state">该组别暂无分配的作品</div>';
        } else {
            container.innerHTML = '<div class="empty-state">暂无分配的作品</div>';
        }
        return;
    }
    
    const judgeScores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
    
    container.innerHTML = filteredWorks.map(work => {
        const scored = judgeScores.find(s => s.workId === work.id && s.judgeAccount === currentJudge.account);
        const statusClass = scored ? 'status-scored' : 'status-pending';
        const statusText = scored ? '已评分' : '待评分';
        
        return `
            <div class="work-item" onclick="openScoringPanel('${work.id}')">
                <div class="work-item-header">
                    <div class="work-title">${work.title}</div>
                    <span class="work-status ${statusClass}">${statusText}</span>
                </div>
                <div class="work-meta">
                    分类：${getCategoryName(work.category)} | 
                    组别：${work.group_name || '未分配'} | 
                    学校：${work.school} | 
                    ${scored ? '得分：' + scored.totalScore : '点击开始评分'}
                </div>
            </div>
        `;
    }).join('');
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
    currentWork = filteredWorks.find(w => w.id === workId);
    if (!currentWork) {
        alert('作品不存在');
        return;
    }
    
    console.log('当前评分作品:', currentWork);
    
    document.getElementById('scoringWorkTitle').textContent = `作品打分 - ${currentWork.title}`;
    document.getElementById('detailTitle').textContent = currentWork.title || '未命名';
    document.getElementById('detailCategory').textContent = getCategoryName(currentWork.category);
    document.getElementById('detailSchool').textContent = currentWork.school || '未知';
    document.getElementById('detailDescription').textContent = currentWork.description || '无描述';
    
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
    
    // 加载已有评分
    const judgeScores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
    const existingScore = judgeScores.find(s => s.workId === workId && s.judgeAccount === currentJudge.account);
    
    if (existingScore) {
        scores = existingScore.scores;
    } else {
        scores = {};
    }
    
    // 渲染评分项
    renderScoringItems();
    
    document.getElementById('scoringPanel').style.display = 'block';
    document.getElementById('worksList').style.display = 'none';
}

function renderScoringItems() {
    const scoringItemsConfig = JSON.parse(localStorage.getItem('scoringItems') || '[{"name":"创意性","maxScore":10},{"name":"完成度","maxScore":10},{"name":"表现力","maxScore":10},{"name":"契合度","maxScore":10}]');
    
    const container = document.getElementById('scoringItems');
    let maxTotal = 0;
    
    container.innerHTML = scoringItemsConfig.map(item => {
        maxTotal += item.maxScore;
        const currentScore = scores[item.name] || 0;
        
        return `
            <div class="score-item">
                <label>${item.name} (0-${item.maxScore}分)</label>
                <div class="score-slider">
                    <input type="range" class="slider-input" 
                           min="0" max="${item.maxScore}" step="0.1" 
                           value="${currentScore}"
                           data-item="${item.name}"
                           oninput="updateScore('${item.name}', this.value, ${item.maxScore})">
                    <span class="score-value-display" id="score-${item.name}">${currentScore.toFixed(1)}</span>
                </div>
            </div>
        `;
    }).join('');
    
    document.getElementById('maxScore').textContent = maxTotal;
    calculateTotal();
}

function updateScore(itemName, value, maxScore) {
    value = parseFloat(value);
    if (value > maxScore) {
        value = maxScore;
        alert(`不能超过最高分 ${maxScore} 分`);
    }
    
    scores[itemName] = value;
    document.getElementById(`score-${itemName}`).textContent = value.toFixed(1);
    calculateTotal();
}

function calculateTotal() {
    const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
    document.getElementById('totalScore').textContent = total.toFixed(1);
}

// 关闭打分面板
function closeScoringPanel() {
    document.getElementById('scoringPanel').style.display = 'none';
    document.getElementById('worksList').style.display = 'block';
    currentWork = null;
}

// 暂存评分
function saveScore() {
    if (!currentWork) return;
    
    const judgeScores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
    const existingIndex = judgeScores.findIndex(s => s.workId === currentWork.id && s.judgeAccount === currentJudge.account);
    
    const scoreData = {
        workId: currentWork.id,
        judgeAccount: currentJudge.account,
        scores: scores,
        totalScore: parseFloat(document.getElementById('totalScore').textContent),
        saveTime: new Date().toLocaleString('zh-CN')
    };
    
    if (existingIndex >= 0) {
        judgeScores[existingIndex] = scoreData;
    } else {
        judgeScores.push(scoreData);
    }
    
    localStorage.setItem('judgeScores', JSON.stringify(judgeScores));
    alert('评分已暂存！');
}

// 提交评分
function submitScore() {
    if (!currentWork) return;
    
    const scoringItemsConfig = JSON.parse(localStorage.getItem('scoringItems') || '[]');
    const hasUnscored = scoringItemsConfig.some(item => !scores[item.name]);
    
    if (hasUnscored) {
        alert('请完成所有评分项目的打分！');
        return;
    }
    
    if (!confirm('确认提交评分？提交后不可修改！')) {
        return;
    }
    
    saveScore();
    alert('评分提交成功！');
    closeScoringPanel();
    loadWorks();
    updateProgress();
}

// 更新进度
function updateProgress() {
    const total = filteredWorks.length;
    const judgeScores = JSON.parse(localStorage.getItem('judgeScores') || '[]');
    const scored = filteredWorks.filter(w => 
        judgeScores.find(s => s.workId === w.id && s.judgeAccount === currentJudge.account)
    ).length;
    
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
