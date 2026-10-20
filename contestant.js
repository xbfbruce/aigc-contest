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
            <li><strong>文件大小：</strong>≥ ${specs.image.minSize || 5}MB（确保高质量）</li>
            <li><strong>作品形式：</strong>可以是单张图、组图、连环画</li>
            <li><strong>数量限制：</strong>最多上传${specs.image.maxFiles || 10}张图片</li>
        `;
    } else {
        imageSection.style.display = 'none';
    }
    
    // 通用规格
    const generalList = document.getElementById('generalSpecsList');
    const deadline = specs.deadline || '2026-12-31 23:59';
    const maxSubmissions = specs.maxSubmissionsPerCategory || 1;
    const descMinLength = specs.descriptionMinLength || 50;
    
    generalList.innerHTML = `
        <li><strong>提交截止时间：</strong>${deadline}</li>
        <li><strong>每人每类可提交：</strong>${maxSubmissions} 份作品</li>
        <li><strong>作品描述最少字数：</strong>${descMinLength} 字</li>
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
        const minSize = specs.image.minSize;
        const maxFiles = specs.image.maxFiles;
        
        uploadText.textContent = `点击上传${formats}图片（可多选）`;
        uploadHint2.textContent = `要求：分辨率≥${minDPI}DPI，文件大小≥${minSize}MB，最多${maxFiles}张`;
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

// 验证图片文件（只检查格式和大小）
async function validateImageFile(file) {
    const specs = getCurrentSpecs();
    const imageConfig = specs.image || {};
    
    // 检查格式
    const allowedFormats = (imageConfig.formats || ['JPG', 'PNG', 'JPEG']).map(f => f.toLowerCase());
    const fileExt = file.name.split('.').pop().toLowerCase();
    
    if (!allowedFormats.includes(fileExt)) {
        return { valid: false, error: `图片格式不正确，支持：${imageConfig.formats.join(', ')}` };
    }
    
    // 只检查文件大小
    const minSizeMB = imageConfig.minSize || 5;
    if (file.size < minSizeMB * 1024 * 1024) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(2);
        return { valid: false, error: `文件太小：当前${sizeMB}MB，要求≥${minSizeMB}MB（确保高质量）` };
    }
    
    // 检查图片数量限制
    const maxFiles = imageConfig.maxFiles || 10;
    if (uploadedFiles.length >= maxFiles) {
        return { valid: false, error: `最多只能上传${maxFiles}张图片` };
    }
    
    // 通过校验，返回基本元数据（不读取图片属性）
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
    const workId = 'work_' + Date.now();
    
    // 转换所有文件为base64
    const filesWithContent = [];
    for (const item of uploadedFiles) {
        try {
            const base64 = await fileToBase64(item.file);
            filesWithContent.push({
                name: item.file.name,
                size: item.file.size,
                type: item.file.type,
                metadata: item.metadata,
                content: base64  // 保存base64内容用于预览
            });
        } catch (error) {
            console.error('文件转换失败:', error);
            alert(`文件 ${item.file.name} 处理失败`);
            return;
        }
    }
    
    const submission = {
        id: workId,
        name: formData.get('name'),
        school: formData.get('school'),
        category: formData.get('category'),
        title: formData.get('workTitle'),
        workTitle: formData.get('workTitle'),
        description: formData.get('description'),
        files: filesWithContent,
        submitTime: new Date().toLocaleString('zh-CN'),
        status: '待审核'
    };
    
    // 保存到提交记录
    let submissions = JSON.parse(localStorage.getItem('submissions') || '[]');
    submissions.push(submission);
    localStorage.setItem('submissions', JSON.stringify(submissions));
    
    // 同时保存到作品库
    let works = JSON.parse(localStorage.getItem('works') || '[]');
    works.push({
        id: workId,
        title: submission.title,
        category: submission.category,
        school: submission.school,
        author: submission.name,
        description: submission.description,
        files: submission.files,
        submitTime: submission.submitTime,
        status: '待审核'
    });
    
    try {
        localStorage.setItem('works', JSON.stringify(works));
        alert('作品提交成功！等待管理员审核。');
        this.reset();
        uploadedFiles = [];
        updateFileList();
        loadSubmissions();
        updateUploadHint();
    } catch (error) {
        console.error('保存失败:', error);
        alert('作品太大，超出浏览器存储限制。请使用较小的文件或联系管理员。');
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

// 监听配置变化（当管理端修改配置时）
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
