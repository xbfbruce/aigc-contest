/**
 * 页面访问统计追踪器
 * 
 * 自动记录每次页面访问到Supabase数据库
 */

// 等待storage适配器加载完成
function waitForStorage(callback, retries = 10) {
    if (typeof storage !== 'undefined') {
        callback();
    } else if (retries > 0) {
        setTimeout(() => waitForStorage(callback, retries - 1), 100);
    } else {
        console.error('❌ storage适配器未加载');
    }
}

// 记录页面访问
function trackPageView(pageName) {
    waitForStorage(() => {
        storage.recordPageView(pageName).catch(err => {
            console.warn('⚠️ 访问记录失败:', err);
        });
    });
}

// 自动追踪当前页面
(function autoTrack() {
    const pageName = window.location.pathname.split('/').pop() || 'index';
    const cleanPageName = pageName.replace('.html', '') || 'index';
    
    // 页面加载完成后记录
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            trackPageView(cleanPageName);
        });
    } else {
        trackPageView(cleanPageName);
    }
})();

// 导出函数供其他页面使用
window.AnalyticsTracker = {
    track: trackPageView,
    
    // 获取统计数据（用于管理端）
    async getStats() {
        return await storage.getPageViewStats();
    },
    
    // 获取详细访问记录
    async getViews(filters = {}) {
        return await storage.getPageViews(filters);
    }
};

console.log('✅ 访问统计追踪器已启动');
