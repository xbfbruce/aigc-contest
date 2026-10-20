// 科技感背景动画 - 粒子系统
class TechBackground {
    constructor() {
        this.container = document.getElementById('particles-container');
        if (!this.container) {
            this.createContainer();
        }
        this.particles = [];
        this.lines = [];
        this.maxParticles = 50;
        this.maxLines = 15;
        this.init();
    }
    
    createContainer() {
        this.container = document.createElement('div');
        this.container.id = 'particles-container';
        document.body.insertBefore(this.container, document.body.firstChild);
    }
    
    init() {
        this.createParticles();
        this.createLines();
        this.animate();
    }
    
    createParticles() {
        for (let i = 0; i < this.maxParticles; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            
            // 随机位置
            const x = Math.random() * 100;
            const y = Math.random() * 100;
            const size = Math.random() * 3 + 2;
            const delay = Math.random() * 20;
            const duration = Math.random() * 20 + 15;
            
            particle.style.left = x + '%';
            particle.style.top = y + '%';
            particle.style.width = size + 'px';
            particle.style.height = size + 'px';
            particle.style.animationDelay = delay + 's';
            particle.style.animationDuration = duration + 's';
            
            // 随机颜色（蓝紫色系）
            const colors = [
                'rgba(99, 102, 241, 0.6)',
                'rgba(139, 92, 246, 0.6)',
                'rgba(236, 72, 153, 0.5)',
                'rgba(79, 70, 229, 0.6)'
            ];
            const color = colors[Math.floor(Math.random() * colors.length)];
            particle.style.background = color;
            particle.style.boxShadow = `0 0 ${size * 3}px ${color}`;
            
            this.container.appendChild(particle);
            this.particles.push(particle);
        }
    }
    
    createLines() {
        for (let i = 0; i < this.maxLines; i++) {
            const line = document.createElement('div');
            line.className = 'particle-line';
            
            // 随机位置和角度
            const x = Math.random() * 100;
            const y = Math.random() * 100;
            const width = Math.random() * 200 + 100;
            const angle = Math.random() * 360;
            const delay = Math.random() * 5;
            
            line.style.left = x + '%';
            line.style.top = y + '%';
            line.style.width = width + 'px';
            line.style.transform = `rotate(${angle}deg)`;
            line.style.animationDelay = delay + 's';
            
            this.container.appendChild(line);
            this.lines.push(line);
        }
    }
    
    animate() {
        // 粒子浮动效果已经在CSS中定义
        // 这里可以添加额外的交互效果
        
        // 鼠标跟随光效
        document.addEventListener('mousemove', (e) => {
            this.updateMouseGlow(e.clientX, e.clientY);
        });
    }
    
    updateMouseGlow(x, y) {
        // 在鼠标位置创建一个临时光晕
        const glow = document.createElement('div');
        glow.style.position = 'fixed';
        glow.style.left = (x - 100) + 'px';
        glow.style.top = (y - 100) + 'px';
        glow.style.width = '200px';
        glow.style.height = '200px';
        glow.style.borderRadius = '50%';
        glow.style.background = 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)';
        glow.style.pointerEvents = 'none';
        glow.style.zIndex = '-1';
        glow.style.transition = 'opacity 0.5s ease';
        
        document.body.appendChild(glow);
        
        setTimeout(() => {
            glow.style.opacity = '0';
            setTimeout(() => glow.remove(), 500);
        }, 100);
    }
}

// 页面加载时初始化背景
window.addEventListener('load', () => {
    new TechBackground();
});

// 添加额外的视觉效果 - 扫描线
function createScanlines() {
    const scanline = document.createElement('div');
    scanline.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 2px;
        background: linear-gradient(90deg, 
            transparent 0%, 
            rgba(99, 102, 241, 0.3) 50%, 
            transparent 100%
        );
        z-index: -1;
        pointer-events: none;
        animation: scanline 8s linear infinite;
    `;
    
    // 添加扫描线动画
    const style = document.createElement('style');
    style.textContent = `
        @keyframes scanline {
            from {
                transform: translateY(-100vh);
            }
            to {
                transform: translateY(100vh);
            }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(scanline);
}

// 启动扫描线效果
createScanlines();

console.log('✨ 科技感背景已加载');
