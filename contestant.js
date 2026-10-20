// 当前登录的选手信息(使用var避免暂时性死区问题)
var currentContestant = null;

// 获取当前配置
function getCurrentSpecs() {
    return JSON.parse(localStorage.getItem('submissionSpecs') || '{}');
}

// 动态加载并显示规格
function loadAndDisplaySpecs() {
    const specs = getCurrentSpecs();
    
    // 视频规格
    const videoSection = document.getElementById('videoSpecsSection');
    if (specs.video && specs.video.enabled !== false) {
        videoSection.style.display = 'block';
        const videoList = document.getElementById('videoSpecsList');
        const maxMinutes = Math.floor((specs.video.maxDuration || 180) / 60);
        
        videoList.innerHTML = `
            <li><strong>格式要求：</strong>${(specs.video.formats || ['MP4']).join(', ')}格式</li>
            <li><strong>分辨率：</strong>≥ ${specs.video.minWidth || 1920}×${specs.video.minHeight || 1080}</li>
            <li><strong>时长限制：</strong>${maxMinutes}分钟以内</li>
            ${specs.video.subtitleRequired ? '<li><strong>字幕要求：</strong>需包含中文字幕</li>' : ''}
            <li><strong>文件大小：</strong>单文件不超过${specs.video.maxSize || 100}MB</li>
        `;
    } else {
        videoSection.style.display = 'none';
    }
    
    // 图像规格
    const imageSection = document.getElementById('imageSpecsSection');
    if (specs.image && specs.image.enabled !== false) {
        imageSection.style.display = 'block';
        const imageList = document.getElementById('imageSpecsList');
        
        imageList.innerHTML = `
            <li><strong>格式要求：</strong>${(specs.image.formats || ['JPG', 'PNG']).join('/')}格式</li>
            <li><strong>分辨率：</strong>≥ ${specs.image.minDPI || 300} DPI</li>
            <li><strong>文件大小：</strong>单张不超过${specs.image.maxSize || 1}MB（确保质量）</li>
            <li><strong>作品形式：</strong>可以是单张图、组图、连环画</li>
            <li><strong>数量限制：</strong>最多上传${specs.image.maxFiles || 5}张图片</li>
        `;
    } else {
        imageSection.style.display = 'none';
    }
    
    // 通用规格
    const generalList = document.getElementById('generalSpecsList');
    const deadline = specs.deadline || '2026-12-31 23:59';
    const maxSubmissions = specs.maxSubmissionsPerCategory || 1;
    
    generalList.innerHTML = `
        <li><strong>提交截止时间：</strong>${deadline}</li>
        <li><strong>每人每类可提交：</strong>${maxSubmissions} 份作品</li>
    `;
}

// 更新上传提示（从配置读取）
function updateUploadHint() {
    const specs = getCurrentSpecs();
    const category = document.getElementById('category').value;
    const uploadText = document.getElementById('uploadText');
    const uploadHint2 = document.getElementById('uploadHint2');
    const fileInput = document.getElementById('fileInput');
    
    if (category === 'video' && specs.video) {
        const formats = specs.video.formats.join(', ');
        const minWidth = specs.video.minWidth;
        const minHeight = specs.video.minHeight;
        const maxDuration = Math.floor(specs.video.maxDuration / 60);
        const maxSize = specs.video.maxSize;
        
        uploadText.textContent = `点击上传${formats}视频文件`;
        uploadHint2.innerHTML = `要求：分辨率≥${minWidth}×${minHeight}，时长≤${maxDuration}分钟${specs.video.subtitleRequired ? '，需中文字幕' : ''}`;
        fileInput.accept = '.' + specs.video.formats.join(',.').toLowerCase();
        fileInput.multiple = false;
    } else if (category === 'image' && specs.image) {
        const formats = specs.image.formats.join(', ');
        const minDPI = specs.image.minDPI;
        const maxSize = specs.image.maxSize || 1;
        const maxFiles = specs.image.maxFiles || 5;
        
        uploadText.textContent = `点击上传${formats}图片（可多选，最多${maxFiles}张）`;
        uploadHint2.textContent = `要求：分辨率≥${minDPI}DPI，单张不超过${maxSize}MB，支持连环画等多张图片`;
        fileInput.accept = '.' + specs.image.formats.join(',.').toLowerCase();
        fileInput.multiple = true;
    } else {
        uploadText.textContent = '请先选择作品分类';
        uploadHint2.textContent = '支持的视频或图片格式';
        fileInput.accept = '';
    }
}

// 文件上传处理
let uploadedFiles = [];

document.getElementById('fileInput').addEventListener('change', async function(e) {
    const files = Array.from(e.target.files);
    const category = document.getElementById('category').value;
    
    if (!category) {
        alert('请先选择作品分类！');
        this.value = '';
        return;
    }
    
    // 清空之前的文件
    uploadedFiles = [];
    
    // 逐个验证文件
    for (const file of files) {
        const validationResult = await validateFile(file, category);
        if (validationResult.valid) {
            uploadedFiles.push({
                file: file,
                metadata: validationResult.metadata
            });
        } else {
            alert(`文件 "${file.name}" 验证失败：\n${validationResult.error}`);
        }
    }
    
    updateFileList();
});

// 文件验证函数
async function validateFile(file, category) {
    // 基础检查：文件大小不能为0
    if (file.size === 0) {
        return { valid: false, error: '文件大小为0' };
    }
    
    if (category === 'video') {
        return await validateVideoFile(file);
    } else if (category === 'image') {
        return await validateImageFile(file);
    }
    
    return { valid: false, error: '未知的作品分类' };
}

// 验证视频文件（只检查格式和大小）
async function validateVideoFile(file) {
    const specs = getCurrentSpecs();
    const videoConfig = specs.video || {};
    
    // 检查格式
    const allowedFormats = (videoConfig.formats || ['MP4']).map(f => '.' + f.toLowerCase());
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowedFormats.includes(fileExt)) {
        return { valid: false, error: `视频格式不正确，支持：${videoConfig.formats.join(', ')}` };
    }
    
    // 只检查文件大小
    const maxSizeMB = videoConfig.maxSize || 100;
    if (file.size > maxSizeMB * 1024 * 1024) {
        return { valid: false, error: `视频文件不能超过${maxSizeMB}MB` };
    }
    
    // 通过校验，返回基本元数据（不读取视频属性）
    return { 
        valid: true, 
        metadata: {
            size: file.size
        }
    };
}

// 验证图片文件（检查格式和大小）
async function validateImageFile(file) {
    const specs = getCurrentSpecs();
    const imageConfig = specs.image || {};
    
    // 检查格式
    const allowedFormats = (imageConfig.formats || ['JPG', 'PNG', 'JPEG']).map(f => f.toLowerCase());
    const fileExt = file.name.split('.').pop().toLowerCase();
    
    if (!allowedFormats.includes(fileExt)) {
        return { valid: false, error: `图片格式不正确，支持：${imageConfig.formats.join(', ')}` };
    }
    
    // 检查文件大小 - 最大1MB
    const maxSizeMB = imageConfig.maxSize || 1;
    if (file.size > maxSizeMB * 1024 * 1024) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(2);
        return { valid: false, error: `文件太大：当前${sizeMB}MB，单张不超过${maxSizeMB}MB` };
    }
    
    // 检查图片数量限制
    const maxFiles = imageConfig.maxFiles || 5;
    if (uploadedFiles.length >= maxFiles) {
        return { valid: false, error: `最多只能上传${maxFiles}张图片` };
    }
    
    // 通过校验，返回基本元数据
    return { 
        valid: true, 
        metadata: {
            size: file.size
        }
    };
}

function updateFileList() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';
    
    uploadedFiles.forEach((item, index) => {
        const file = item.file;
        const meta = item.metadata || {};
        
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        let info = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        if (meta.width && meta.height) {
            info += ` - ${meta.width}×${meta.height}`;
        }
        if (meta.duration) {
            const mins = Math.floor(meta.duration / 60);
            const secs = Math.floor(meta.duration % 60);
            info += ` - ${mins}:${secs.toString().padStart(2, '0')}`;
        }
        
        fileItem.innerHTML = `
            <span class="file-name">${info}</span>
            <span class="file-remove" onclick="removeFile(${index})">×</span>
        `;
        fileList.appendChild(fileItem);
    });
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    updateFileList();
}

// 拖拽上传
const uploadArea = document.getElementById('uploadArea');

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--primary)';
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = 'var(--border-color)';
});

uploadArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--border-color)';
    
    const files = Array.from(e.dataTransfer.files);
    const category = document.getElementById('category').value;
    
    if (!category) {
        alert('请先选择作品分类！');
        return;
    }
    
    uploadedFiles = [];
    
    for (const file of files) {
        const validationResult = await validateFile(file, category);
        if (validationResult.valid) {
            uploadedFiles.push({
                file: file,
                metadata: validationResult.metadata
            });
        } else {
            alert(`文件 "${file.name}" 验证失败：\n${validationResult.error}`);
        }
    }
    
    updateFileList();
});

// 字符计数
document.getElementById('description').addEventListener('input', function() {
    document.getElementById('charCount').textContent = this.value.length;
});

// 将文件转换为base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// 表单提交
document.getElementById('contestantForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    if (uploadedFiles.length === 0) {
        alert('请至少上传一个作品文件！');
        return;
    }
    
    const formData = new FormData(this);
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = '提交中...';
    
    try {
        // 1. 注册选手(如果不存在)
        const name = formData.get('name');
        const school = formData.get('school');
        
        let contestantId = localStorage.getItem('currentContestantId');
        
        if (!contestantId) {
            console.log('📝 注册新选手:', name, school);
            const contestant = await storage.registerContestant(name, school);
            contestantId = contestant.id;
            localStorage.setItem('currentContestantId', contestantId);
            console.log('✅ 选手注册成功, ID:', contestantId);
        }
        
        // 2. 处理文件 - 对于Supabase,我们存储文件元数据
        // 注意:实际文件上传需要Storage Bucket,这里先存储元数据
        const files = uploadedFiles.map(item => ({
            name: item.file.name,
            size: item.file.size,
            type: item.file.type,
            metadata: item.metadata
        }));
        
        // 3. 准备作品数据
        const workData = {
            contestant_id: contestantId,
            category: formData.get('category'),
            title: formData.get('workTitle'),
            description: formData.get('description'),
            file_name: files.map(f => f.name).join(', '),
            file_size: files.reduce((sum, f) => sum + f.size, 0),
            file_url: 'pending_upload', // 后续可以集成Supabase Storage
            status: 'pending'
        };
        
        console.log('📤 提交作品到Supabase:', workData);
        
        // 4. 提交到Supabase(或localStorage作为fallback)
        const result = await storage.submitWork(workData);
        console.log('✅ 作品提交成功:', result);
        
        // 5. 同时保存到本地提交记录(用于显示历史)
        const submission = {
            id: result.id || ('work_' + Date.now()),
            name: name,
            school: school,
            category: workData.category,
            title: workData.title,
            workTitle: workData.title,
            description: workData.description,
            files: files,
            submitTime: new Date().toLocaleString('zh-CN'),
            status: '待审核'
        };
        
        let submissions = JSON.parse(localStorage.getItem('submissions') || '[]');
        submissions.push(submission);
        localStorage.setItem('submissions', JSON.stringify(submissions));
        
        // 6. 显示成功消息
        alert('✅ 作品提交成功！\n\n作品已保存到云端数据库。\n管理员可以在后台查看您的作品。');
        
        // 7. 重置表单
        this.reset();
        uploadedFiles = [];
        updateFileList();
        loadSubmissions();
        updateUploadHint();
        
    } catch (error) {
        console.error('❌ 提交失败:', error);
        alert('❌ 提交失败: ' + error.message + '\n\n请检查网络连接后重试。');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
});

// 保存草稿
function saveDraft() {
    const formData = new FormData(document.getElementById('contestantForm'));
    const draft = {
        name: formData.get('name'),
        school: formData.get('school'),
        category: formData.get('category'),
        workTitle: formData.get('workTitle'),
        description: formData.get('description'),
        files: uploadedFiles.map(item => item.file.name)
    };
    
    localStorage.setItem('draft', JSON.stringify(draft));
    alert('草稿已保存！');
}

// 加载提交记录
function loadSubmissions() {
    const submissions = JSON.parse(localStorage.getItem('submissions') || '[]');
    const tbody = document.getElementById('submissionsList');
    
    if (submissions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无提交记录</td></tr>';
        return;
    }
    
    tbody.innerHTML = submissions.map(sub => `
        <tr>
            <td>${sub.submitTime}</td>
            <td>${sub.workTitle}</td>
            <td>${getCategoryName(sub.category)}</td>
            <td><span class="work-status ${sub.status === '已通过' ? 'status-scored' : 'status-pending'}">${sub.status}</span></td>
            <td><button class="btn-secondary btn-sm" onclick="viewDetail('${sub.workTitle}')">查看</button></td>
        </tr>
    `).join('');
}

function getCategoryName(value) {
    const categories = {
        'video': '视频作品',
        'image': '图像作品'
    };
    return categories[value] || value;
}

function viewDetail(title) {
    alert('查看详情功能：' + title);
}

// 初始化
window.addEventListener('load', () => {
    loadAndDisplaySpecs();  // 加载并显示规格
    updateUploadHint();
    loadSubmissions();
    loadSchoolList();  // 加载学校列表
    
    // 加载草稿
    const draft = JSON.parse(localStorage.getItem('draft') || '{}');
    if (draft.name) {
        document.getElementById('name').value = draft.name || '';
        document.getElementById('school').value = draft.school || '';
        document.getElementById('category').value = draft.category || '';
        document.getElementById('workTitle').value = draft.workTitle || '';
        document.getElementById('description').value = draft.description || '';
        document.getElementById('charCount').textContent = (draft.description || '').length;
        updateUploadHint();
    }
});

// ============================================
// 学校列表加载功能
// ============================================

async function loadSchoolList() {
    try {
        console.log(' 加载学校列表...');
        
        // 检查school元素是否存在
        const schoolSelect = document.getElementById('school');
        if (!schoolSelect) {
            console.error('❌ 未找到school下拉框元素');
            return;
        }
        
        // 尝试从服务器加载(使用相对路径)
        console.log(' 尝试加载 schools.json...');
        const response = await fetch('./schools.json');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        const schools = data.schools || [];
        
        console.log(`✅ 成功加载 ${schools.length} 所学校`);
        
        // 清空现有选项(保留第一个"请选择")
        schoolSelect.innerHTML = '<option value="">请选择学校</option>';
        
        // 填充下拉框
        schools.forEach(school => {
            const option = document.createElement('option');
            option.value = school;
            option.textContent = school;
            schoolSelect.appendChild(option);
        });
        
        console.log('✅ 学校列表已填充');
        
    } catch (error) {
        console.error('❌ 加载学校列表失败:', error.message);
        console.warn('⚠️ 使用默认学校列表');
        
        // 降级方案：使用硬编码的默认列表
        const defaultSchools = [
            '广州海珠外国语实验中学附属第二小学',
            '广州市海珠区晓园小学',
            '广州市宝玉直小学',
            '广州市海珠区宝玉直实验小学',
            '广州市海珠区绿翠小学',
            '广州市海珠区昌岗中路小学',
            '广州市南武中学附属学校',
            '广州市逸景第一小学',
            '广州市海珠区大元帅府小学',
            '其他学校'
        ];
        
        const schoolSelect = document.getElementById('school');
        if (schoolSelect) {
            schoolSelect.innerHTML = '<option value="">请选择学校</option>';
            defaultSchools.forEach(school => {
                const option = document.createElement('option');
                option.value = school;
                option.textContent = school;
                schoolSelect.appendChild(option);
            });
            console.log(`✅ 已加载 ${defaultSchools.length} 所默认学校`);
        }
    }
}

// ============================================
// 监听配置变化（当管理端修改配置时）
// ============================================
window.addEventListener('storage', (e) => {
    if (e.key === 'submissionSpecs') {
        console.log('检测到配置更新，刷新显示...');
        loadAndDisplaySpecs();
        updateUploadHint();
        // 显示提示
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: var(--gradient-1);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
            z-index: 9999;
            animation: slideIn 0.3s ease;
        `;
        notification.innerHTML = '🔄 作品规范已更新，请刷新页面查看最新要求';
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
});

// 添加动画样式
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
`;
document.head.appendChild(style);

// ============================================
// 选手登录和验证系统
// ============================================

// 加载预录入选手名单
async function loadContestantList() {
    try {
        console.log('📋 加载选手名单...');
        const response = await fetch('contestants.json');
        if (!response.ok) {
            throw new Error('无法加载选手名单');
        }
        
        const data = await response.json();
        const contestants = data.contestants || [];
        console.log(`✅ 加载了 ${contestants.length} 名选手`);
        return contestants;
    } catch (error) {
        console.error('❌ 加载选手名单失败:', error);
        alert('加载选手名单失败,请刷新页面重试');
        return [];
    }
}

// 选手登录验证
async function contestantLogin(loginInput) {
    console.log('🔐 contestantLogin 被调用, 输入:', loginInput);
    
    const input = loginInput.trim();
    
    if (!input) {
        console.warn('⚠️ 输入为空');
        showLoginError('请输入姓名或手机号');
        return null;
    }
    
    // 加载选手名单
    console.log('📋 开始加载选手名单...');
    const contestants = await loadContestantList();
    console.log(`✅ 加载了 ${contestants.length} 名选手`);
    
    // 查找匹配的选手(支持姓名或手机号)
    console.log('🔍 查找匹配选手:', input);
    const matched = contestants.find(c => 
        c.name === input || c.phone === input
    );
    
    if (!matched) {
        console.warn('⚠️ 未找到匹配选手');
        showLoginError('未找到匹配的选手,请检查输入或联系管理员');
        return null;
    }
    
    console.log('✅ 找到匹配选手:', matched);
    
    // 检查是否已提交
    const submittedWorks = await checkIfSubmitted(matched.name);
    if (submittedWorks) {
        // 已提交,显示提示
        showAlreadySubmitted(submittedWorks);
        return null;
    }
    
    // 登录成功
    currentContestant = matched;
    localStorage.setItem('currentContestant', JSON.stringify(matched));
    
    // 显示表单
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('formSection').style.display = 'block';
    
    // 自动填充姓名和学校
    document.getElementById('name').value = matched.name;
    document.getElementById('name').readOnly = true; // 不允许修改
    
    if (matched.school) {
        document.getElementById('school').value = matched.school;
        document.getElementById('school').disabled = true; // 不允许修改
    }
    
    console.log('✅ 选手登录成功:', matched.name);
    return matched;
}

// 检查选手是否已提交作品
async function checkIfSubmitted(name) {
    try {
        console.log('🔍 检查选手是否已提交:', name);
        
        // 从Supabase查询
        const allWorks = await storage.listWorks();
        console.log(`📊 总作品数: ${allWorks.length}`);
        
        // 查找该选手的作品
        const contestantWorks = allWorks.filter(w => {
            const authorName = w.contestants?.name || w.author || w.name;
            return authorName === name;
        });
        
        console.log(`📊 ${name} 的作品数: ${contestantWorks.length}`);
        
        if (contestantWorks && contestantWorks.length > 0) {
            console.log('✅ 找到已提交作品:', contestantWorks[0].title);
            return contestantWorks[0]; // 返回第一个作品
        }
        
        // Fallback: 从localStorage查询
        const submissions = JSON.parse(localStorage.getItem('submissions') || '[]');
        const submission = submissions.find(s => s.name === name);
        if (submission) {
            console.log('✅ 在localStorage中找到提交记录:', submission.title);
            return submission;
        }
        
        console.log(' 未找到提交记录');
        return null;
    } catch (error) {
        console.error('❌ 检查提交状态失败:', error);
        return null;
    }
}

// 显示登录错误
function showLoginError(message) {
    const errorDiv = document.getElementById('loginError');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

// 显示已提交提示
function showAlreadySubmitted(work) {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('alreadySubmittedSection').style.display = 'block';
    
    const infoDiv = document.getElementById('submittedWorkInfo');
    const submitTime = work.submit_time ? new Date(work.submit_time).toLocaleString('zh-CN') : work.submitTime;
    const categoryText = work.category === 'video' ? '视频作品' : '图像作品';
    
    infoDiv.innerHTML = `
        <h3 style="margin-bottom: 1rem;">${work.title}</h3>
        <div style="text-align: left; line-height: 2;">
            <div><strong>作者:</strong> ${work.author || work.name}</div>
            <div><strong>学校:</strong> ${work.school}</div>
            <div><strong>分类:</strong> ${categoryText}</div>
            <div><strong>提交时间:</strong> ${submitTime}</div>
            <div><strong>状态:</strong> <span style="color: var(--success);">已提交</span></div>
        </div>
    `;
}

// 处理登录表单提交(HTML中直接调用)
async function handleLogin(e) {
    e.preventDefault();
    console.log('🔐 开始登录验证...');
    const loginInput = document.getElementById('loginInput').value;
    console.log('输入:', loginInput);
    await contestantLogin(loginInput);
}

// 监听登录表单提交(备用方案)
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('contestantLoginForm');
    if (loginForm) {
        // 已经通过onsubmit绑定,这里作为备用
        console.log('✅ 登录表单已就绪');
    } else {
        console.error('❌ 未找到登录表单元素');
    }
});

// 检查是否已经登录过
window.addEventListener('load', () => {
    const savedContestant = localStorage.getItem('currentContestant');
    if (savedContestant) {
        currentContestant = JSON.parse(savedContestant);
        
        // 检查是否已提交
        checkIfSubmitted(currentContestant.name).then(work => {
            if (work) {
                showAlreadySubmitted(work);
            } else {
                // 未提交,显示表单
                document.getElementById('loginSection').style.display = 'none';
                document.getElementById('formSection').style.display = 'block';
                document.getElementById('name').value = currentContestant.name;
                document.getElementById('name').readOnly = true;
                
                if (currentContestant.school) {
                    document.getElementById('school').value = currentContestant.school;
                    document.getElementById('school').disabled = true;
                }
            }
        });
    }
});

// 修改提交事件,限制只能提交一次
const originalSubmitHandler = document.getElementById('contestantForm')?.onsubmit;
if (document.getElementById('contestantForm')) {
    document.getElementById('contestantForm').addEventListener('submit', async function(e) {
        // 再次检查是否已提交
        if (currentContestant) {
            const alreadySubmitted = await checkIfSubmitted(currentContestant.name);
            if (alreadySubmitted) {
                e.preventDefault();
                alert('您已经提交过作品,无法重复提交！');
                showAlreadySubmitted(alreadySubmitted);
                return false;
            }
        }
        
        // 检查作品类型是否与该选手其他提交冲突
        const category = document.getElementById('category').value;
        const allWorks = await storage.listWorks();
        const contestantWorks = allWorks.filter(w => 
            w.contestants?.name === currentContestant?.name || 
            w.author === currentContestant?.name ||
            w.name === currentContestant?.name
        );
        
        if (contestantWorks.length > 0) {
            const existingCategory = contestantWorks[0].category;
            if (existingCategory !== category) {
                e.preventDefault();
                alert(`您之前已提交过${existingCategory === 'video' ? '视频' : '图像'}作品,每个选手只能选择一种作品类型！`);
                return false;
            }
        }
    }, true); // 使用捕获阶段,确保在其他handler之前执行
}
