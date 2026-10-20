/**
 * Contestant Portal - Supabase Version
 * 
 * 选手端功能：
 * - 查看比赛规格（从Supabase configs读取）
 * - 注册/填写个人信息
 * - 上传作品到Supabase Storage
 * - 提交作品信息到数据库
 */

// 导入Supabase客户端
import { supabase, registerContestant, submitWork, uploadFile, getConfig } from './supabase-client.js';

// ============================================
// 全局状态
// ============================================
let currentContestant = null;
let uploadedFiles = [];
let submissionSpecs = null;

// ============================================
// 初始化
// ============================================
document.addEventListener('DOMContentLoaded', async function() {
    // 加载配置
    await loadSpecs();
    
    // 检查是否已登录
    checkLoginStatus();
    
    // 绑定事件
    bindEvents();
});

// ============================================
// 配置加载
// ============================================
async function loadSpecs() {
    try {
        const specs = await getConfig('submission_specs');
        submissionSpecs = specs;
        displaySpecs(specs);
    } catch (error) {
        console.error('Failed to load specs:', error);
        // 使用默认配置
        submissionSpecs = getDefaultSpecs();
        displaySpecs(submissionSpecs);
    }
}

function getDefaultSpecs() {
    return {
        video: {
            enabled: true,
            formats: ['MP4'],
            maxSize: 100,
            subtitleRequired: true
        },
        image: {
            enabled: true,
            formats: ['JPG', 'PNG'],
            minDPI: 300,
            minSizeMB: 5,
            maxFiles: 10
        },
        deadline: '2026-12-31 23:59:59',
        maxSubmissionsPerCategory: 3,
        descriptionMinLength: 50
    };
}

function displaySpecs(specs) {
    // 视频规格
    const videoSection = document.getElementById('videoSpecsSection');
    if (specs.video && specs.video.enabled !== false) {
        videoSection.style.display = 'block';
        const videoList = document.getElementById('videoSpecsList');
        const maxMinutes = Math.floor((specs.video.maxDuration || 180) / 60);
        
        videoList.innerHTML = `
            <li><strong>格式要求：</strong>${(specs.video.formats || ['MP4']).join(', ')}格式</li>
            <li><strong>文件大小：</strong>单文件不超过${specs.video.maxSize || 100}MB</li>
            ${specs.video.subtitleRequired ? '<li><strong>字幕要求：</strong>需包含中文字幕</li>' : ''}
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
            <li><strong>文件大小：</strong>≥ ${specs.image.minSizeMB || 5}MB（确保高质量）</li>
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

// ============================================
// 用户认证
// ============================================
function checkLoginStatus() {
    const stored = sessionStorage.getItem('currentContestant');
    if (stored) {
        currentContestant = JSON.parse(stored);
        showSubmissionForm();
    }
}

function bindEvents() {
    // 分类切换
    document.getElementById('category').addEventListener('change', updateUploadHint);
    
    // 文件选择
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    
    // 表单提交
    document.getElementById('submissionForm').addEventListener('submit', handleSubmit);
    
    // 取消按钮
    document.getElementById('cancelBtn')?.addEventListener('click', () => {
        location.href = 'index.html';
    });
}

function updateUploadHint() {
    const category = document.getElementById('category').value;
    const uploadText = document.getElementById('uploadText');
    const fileInput = document.getElementById('fileInput');
    
    if (!submissionSpecs) return;
    
    if (category === 'video' && submissionSpecs.video) {
        const formats = submissionSpecs.video.formats.join(', ');
        uploadText.textContent = `点击上传${formats}视频文件`;
        fileInput.accept = '.' + submissionSpecs.video.formats.join(',.').toLowerCase();
        fileInput.multiple = false;
    } else if (category === 'image' && submissionSpecs.image) {
        const formats = submissionSpecs.image.formats.join(', ');
        uploadText.textContent = `点击上传${formats}图片（可多选）`;
        fileInput.accept = '.' + submissionSpecs.image.formats.join(',.').toLowerCase();
        fileInput.multiple = true;
    }
}

// ============================================
// 文件处理
// ============================================
async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    const category = document.getElementById('category').value;
    
    if (files.length === 0) return;
    
    // 验证文件
    const validFiles = [];
    for (const file of files) {
        const validation = await validateFile(file, category);
        if (validation.valid) {
            validFiles.push({ file, ...validation.metadata });
        } else {
            alert(`文件 "${file.name}" 不符合要求：\n${validation.error}`);
        }
    }
    
    if (validFiles.length > 0) {
        uploadedFiles = validFiles;
        displayFileList();
    }
}

async function validateFile(file, category) {
    const specs = submissionSpecs;
    
    if (category === 'video') {
        const videoConfig = specs.video || {};
        const allowedFormats = (videoConfig.formats || ['MP4']).map(f => '.' + f.toLowerCase());
        const fileExt = '.' + file.name.split('.').pop().toLowerCase();
        
        if (!allowedFormats.includes(fileExt)) {
            return { valid: false, error: `视频格式不正确，支持：${videoConfig.formats.join(', ')}` };
        }
        
        const maxSizeMB = videoConfig.maxSize || 100;
        if (file.size > maxSizeMB * 1024 * 1024) {
            return { valid: false, error: `视频文件不能超过${maxSizeMB}MB` };
        }
        
        return { valid: true, metadata: { size: file.size } };
        
    } else if (category === 'image') {
        const imageConfig = specs.image || {};
        const allowedFormats = (imageConfig.formats || ['JPG', 'PNG']).map(f => '.' + f.toLowerCase());
        const fileExt = '.' + file.name.split('.').pop().toLowerCase();
        
        if (!allowedFormats.includes(fileExt)) {
            return { valid: false, error: `图片格式不正确，支持：${imageConfig.formats.join(', ')}` };
        }
        
        const minSizeMB = imageConfig.minSizeMB || 5;
        if (file.size < minSizeMB * 1024 * 1024) {
            return { valid: false, error: `图片文件不能小于${minSizeMB}MB` };
        }
        
        return { valid: true, metadata: { size: file.size } };
    }
    
    return { valid: false, error: '请先选择作品分类' };
}

function displayFileList() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = uploadedFiles.map((item, index) => `
        <div class="file-item">
            <span class="file-name">${item.file.name} (${formatFileSize(item.size)})</span>
            <span class="file-remove" onclick="removeFile(${index})">×</span>
        </div>
    `).join('');
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    displayFileList();
    if (uploadedFiles.length === 0) {
        document.getElementById('fileInput').value = '';
    }
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// ============================================
// 表单提交
// ============================================
async function handleSubmit(e) {
    e.preventDefault();
    
    if (!currentContestant) {
        alert('请先填写个人信息');
        return;
    }
    
    if (uploadedFiles.length === 0) {
        alert('请至少上传一个文件');
        return;
    }
    
    const formData = new FormData(e.target);
    const category = formData.get('category');
    const title = formData.get('workTitle');
    const description = formData.get('description');
    
    // 验证描述长度
    const minLength = submissionSpecs.descriptionMinLength || 50;
    if (description.length < minLength) {
        alert(`作品描述至少需要${minLength}个字`);
        return;
    }
    
    try {
        showLoading(true);
        
        // 1. 上传文件到Storage
        const uploadedFileUrls = [];
        for (const item of uploadedFiles) {
            const uploadResult = await uploadFile(item.file, 'works');
            uploadedFileUrls.push({
                name: uploadResult.name,
                url: uploadResult.url,
                size: uploadResult.size
            });
        }
        
        // 2. 提交作品信息到数据库
        const workData = {
            contestant_id: currentContestant.id,
            category: category,
            title: title,
            description: description,
            file_name: uploadedFileUrls.map(f => f.name).join(', '),
            file_size: uploadedFileUrls.reduce((sum, f) => sum + f.size, 0),
            file_url: uploadedFileUrls[0].url, // 主文件URL
            thumbnail_url: category === 'image' ? uploadedFileUrls[0].url : null,
            status: 'pending'
        };
        
        const work = await submitWork(workData);
        
        showLoading(false);
        alert('✅ 作品提交成功！\n\n作品ID: ' + work.id + '\n状态: 待审核');
        
        // 重置表单
        e.target.reset();
        uploadedFiles = [];
        displayFileList();
        
        // 刷新提交记录
        loadSubmissions();
        
    } catch (error) {
        showLoading(false);
        console.error('Submission failed:', error);
        alert('❌ 提交失败：' + error.message);
    }
}

// ============================================
// 选手注册/登录
// ============================================
async function handleRegistration(name, school) {
    try {
        const contestant = await registerContestant(name, school);
        currentContestant = contestant;
        sessionStorage.setItem('currentContestant', JSON.stringify(contestant));
        showSubmissionForm();
    } catch (error) {
        console.error('Registration failed:', error);
        alert('注册失败：' + error.message);
    }
}

function showSubmissionForm() {
    document.getElementById('registrationSection').style.display = 'none';
    document.getElementById('submissionSection').style.display = 'block';
    document.getElementById('contestantName').textContent = currentContestant.name;
    document.getElementById('contestantSchool').textContent = currentContestant.school;
    
    // 加载已提交的作品
    loadSubmissions();
}

async function loadSubmissions() {
    if (!currentContestant) return;
    
    try {
        const { listWorks } = await import('./supabase-client.js');
        const works = await listWorks({ contestant_id: currentContestant.id });
        displaySubmissions(works);
    } catch (error) {
        console.error('Failed to load submissions:', error);
    }
}

function displaySubmissions(submissions) {
    const tbody = document.getElementById('submissionsTableBody');
    
    if (submissions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无提交记录</td></tr>';
        return;
    }
    
    tbody.innerHTML = submissions.map(sub => `
        <tr>
            <td>${new Date(sub.submit_time).toLocaleString('zh-CN')}</td>
            <td>${sub.title}</td>
            <td>${getCategoryName(sub.category)}</td>
            <td><span class="work-status ${sub.status === 'scored' ? 'status-scored' : 'status-pending'}">${getStatusText(sub.status)}</span></td>
            <td><button class="btn-secondary btn-sm" onclick="viewDetail('${sub.id}')">查看</button></td>
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

function getStatusText(status) {
    const statuses = {
        'pending': '待审核',
        'reviewing': '评审中',
        'scored': '已评分'
    };
    return statuses[status] || status;
}

function viewDetail(workId) {
    // TODO: 实现查看详情功能
    alert('查看详情功能开发中...');
}

function showLoading(show) {
    const loadingEl = document.getElementById('loadingIndicator');
    if (loadingEl) {
        loadingEl.style.display = show ? 'block' : 'none';
    }
    
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.disabled = show;
    }
}
