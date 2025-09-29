/**
 * MediaMingle 推广链接追踪系统
 * 专为 https://mediamingle.cn/ 官网定制
 * 后端API: https://google-maps-backend-master.netlify.app/api
 */

// 防止重复加载
if (typeof window.mediamingleReferralTracker !== 'undefined') {
    console.log('MediaMingle推广追踪器已存在，跳过重复加载');
} else {

class MediaMingleReferralTracker {
    constructor() {
        this.apiBaseUrl = 'https://google-maps-backend-master.netlify.app/api';
        this.websiteUrl = 'https://mediamingle.cn';
        this.referralData = null;
        this.init();
    }

    init() {
        this.parseReferralFromURL();
        // 只有在有推广信息时才追踪点击
        if (this.referralData) {
            this.trackReferralClick();
        }
        this.setupPurchaseTracking();
        this.setupProductNavigation();
        this.setupGlobalNavigation();
    }

    /**
     * 从URL解析推广信息
     */
    parseReferralFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        const refCode = urlParams.get('ref');
        
        console.log('MediaMingle推广追踪器: 从URL获取推广码:', refCode);
        
        if (refCode) {
            try {
                // 解析推广码: AGENT_CODE_PRODUCT_TYPE_TIMESTAMP_RANDOM
                const parts = refCode.split('_');
                console.log('MediaMingle推广追踪器: 推广码分割结果:', parts);
                
                if (parts.length >= 4) {
                    this.referralData = {
                        agentCode: parts[0],
                        productType: parts[1],
                        timestamp: parts[2],
                        random: parts.slice(3).join('_'), // 处理可能包含下划线的随机部分
                        fullCode: refCode,
                        source: 'url'
                    };

                    // 存储到localStorage和Cookie
                    this.storeReferralData();
                    
                    console.log('MediaMingle推广信息解析成功:', this.referralData);
                    
                    // 显示推广信息提示
                    this.showReferralNotification();
                } else {
                    console.error('MediaMingle推广追踪器: 推广码格式不正确，期望至少4个部分，实际:', parts.length);
                }
            } catch (error) {
                console.error('推广码解析失败:', error);
            }
        } else {
            console.log('MediaMingle推广追踪器: URL中没有推广码，尝试从存储中恢复');
            // 尝试从localStorage恢复推广信息
            this.loadStoredReferralData();
        }
    }

    /**
     * 存储推广信息
     */
    storeReferralData() {
        if (!this.referralData) return;

        // 存储到localStorage (30天)
        localStorage.setItem('mediamingle_referral_data', JSON.stringify({
            ...this.referralData,
            storedAt: Date.now()
        }));

        // 存储到Cookie (30天)
        const expires = new Date();
        expires.setDate(expires.getDate() + 30);
        document.cookie = `mediamingle_referral_data=${JSON.stringify(this.referralData)}; expires=${expires.toUTCString()}; path=/`;
    }

    /**
     * 从存储中加载推广信息
     */
    loadStoredReferralData() {
        try {
            // 优先从localStorage读取
            const stored = localStorage.getItem('mediamingle_referral_data');
            if (stored) {
                const data = JSON.parse(stored);
                // 检查是否过期 (30天)
                if (Date.now() - data.storedAt < 30 * 24 * 60 * 60 * 1000) {
                    this.referralData = data;
                    return;
                }
            }

            // 从Cookie读取
            const cookies = document.cookie.split(';');
            for (let cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === 'mediamingle_referral_data') {
                    this.referralData = JSON.parse(decodeURIComponent(value));
                    break;
                }
            }
        } catch (error) {
            console.error('加载推广信息失败:', error);
        }
    }

    /**
     * 显示推广信息通知
     */
    showReferralNotification() {
        if (!this.referralData) return;

        // 创建通知元素
        const notification = document.createElement('div');
        notification.id = 'referral-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 8px 25px rgba(0,0,0,0.15);
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            max-width: 300px;
            animation: slideInRight 0.5s ease-out;
        `;

        notification.innerHTML = `
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 18px; margin-right: 8px;">🎉</span>
                <strong>代理推荐访问</strong>
                <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: white; font-size: 16px; margin-left: auto; cursor: pointer;">×</button>
            </div>
            <div style="font-size: 12px; opacity: 0.9;">
                代理代码: <strong>${this.referralData.agentCode}</strong><br>
                产品: <strong>${this.getProductName(this.referralData.productType)}</strong>
            </div>
        `;

        // 添加CSS动画
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);

        // 插入到页面
        document.body.appendChild(notification);

        // 5秒后自动隐藏
        setTimeout(() => {
            if (notification.parentElement) {
                notification.style.animation = 'slideInRight 0.5s ease-out reverse';
                setTimeout(() => notification.remove(), 500);
            }
        }, 5000);
    }

    /**
     * 获取产品名称
     */
    getProductName(productType) {
        const productNames = {
            'google-maps': '谷歌地图拓客程序',
            'email-filter': '邮件过滤程序',
            'whatsapp-filter': 'WhatsApp过滤程序'
        };
        return productNames[productType] || '产品';
    }

    /**
     * 追踪推广点击
     */
    async trackReferralClick() {
        if (!this.referralData) {
            console.log('MediaMingle推广追踪器: 无推广信息，跳过点击追踪');
            return;
        }

        console.log('MediaMingle推广追踪器: 开始追踪点击', this.referralData);

        try {
            const requestData = {
                promotionCode: this.referralData.fullCode,
                agentCode: this.referralData.agentCode,
                productType: this.referralData.productType,
                pageUrl: window.location.href,
                userAgent: navigator.userAgent,
                referrer: document.referrer,
                timestamp: Date.now()
            };

            console.log('MediaMingle推广追踪器: 发送请求数据', requestData);
            console.log('MediaMingle推广追踪器: API地址', `${this.apiBaseUrl}/trackReferralClick`);

            const response = await fetch(`${this.apiBaseUrl}/trackReferralClick`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData)
            });

            console.log('MediaMingle推广追踪器: API响应状态', response.status);
            console.log('MediaMingle推广追踪器: API响应头', response.headers);

            if (response.ok) {
                const result = await response.json();
                console.log('MediaMingle推广点击记录成功:', result);
            } else {
                const errorText = await response.text();
                console.error('MediaMingle推广点击记录失败:', response.status, errorText);
            }
        } catch (error) {
            console.error('MediaMingle推广点击记录异常:', error);
        }
    }

    /**
     * 设置购买追踪
     */
    setupPurchaseTracking() {
        // 监听支付按钮点击
        document.addEventListener('click', (event) => {
            const target = event.target;
            if (target.matches('.checkout-btn, .buy-btn, .purchase-btn, [data-action="checkout"], .btn-primary')) {
                this.trackPurchaseIntent();
            }
        });

        // 监听表单提交
        document.addEventListener('submit', (event) => {
            const form = event.target;
            if (form.matches('.checkout-form, .payment-form')) {
                this.addReferralToForm(form);
            }
        });
    }

    /**
     * 设置产品导航追踪
     */
    setupProductNavigation() {
        // 监听产品链接点击
        document.addEventListener('click', (event) => {
            const link = event.target.closest('a');
            if (link && link.href && link.href.includes('product.html')) {
                this.trackProductNavigation(link.href);
            }
        });
    }

    /**
     * 设置全局导航追踪 - 新增功能
     */
    setupGlobalNavigation() {
        // 监听所有链接点击，确保推广信息在页面跳转时保持
        document.addEventListener('click', (event) => {
            const link = event.target.closest('a');
            if (link && link.href && !link.href.startsWith('javascript:') && !link.href.startsWith('#')) {
                this.preserveReferralInNavigation(link);
            }
        });

        // 监听表单提交，确保推广信息在表单提交时保持
        document.addEventListener('submit', (event) => {
            const form = event.target;
            if (form.action && !form.action.startsWith('javascript:')) {
                this.preserveReferralInForm(form);
            }
        });
    }

    /**
     * 在导航中保持推广信息
     */
    preserveReferralInNavigation(link) {
        if (!this.referralData) return;

        try {
            const url = new URL(link.href);
            // 如果链接没有推广参数，则添加
            if (!url.searchParams.has('ref')) {
                url.searchParams.set('ref', this.referralData.fullCode);
                link.href = url.toString();
            }
        } catch (error) {
            console.error('处理导航链接失败:', error);
        }
    }

    /**
     * 在表单中保持推广信息
     */
    preserveReferralInForm(form) {
        if (!this.referralData) return;

        // 检查是否已有推广字段
        let refInput = form.querySelector('input[name="referral_code"]');
        if (!refInput) {
            refInput = document.createElement('input');
            refInput.type = 'hidden';
            refInput.name = 'referral_code';
            form.appendChild(refInput);
        }
        refInput.value = this.referralData.fullCode;

        // 添加代理信息
        let agentInput = form.querySelector('input[name="agent_code"]');
        if (!agentInput) {
            agentInput = document.createElement('input');
            agentInput.type = 'hidden';
            agentInput.name = 'agent_code';
            form.appendChild(agentInput);
        }
        agentInput.value = this.referralData.agentCode;
    }

    /**
     * 追踪产品导航
     */
    trackProductNavigation(href) {
        if (!this.referralData) return;

        // 在链接中添加推广参数
        const url = new URL(href);
        url.searchParams.set('ref', this.referralData.fullCode);
        
        // 更新链接
        event.target.closest('a').href = url.toString();
    }

    /**
     * 追踪购买意图
     */
    trackPurchaseIntent() {
        if (!this.referralData) return;

        // 在支付页面URL中添加推广参数
        const currentUrl = new URL(window.location.href);
        if (currentUrl.pathname.includes('checkout') || currentUrl.pathname.includes('payment')) {
            currentUrl.searchParams.set('ref', this.referralData.fullCode);
            window.history.replaceState({}, '', currentUrl.toString());
        }
    }

    /**
     * 向表单添加推广信息
     */
    addReferralToForm(form) {
        if (!this.referralData) return;

        // 检查是否已有推广字段
        let refInput = form.querySelector('input[name="referral_code"]');
        if (!refInput) {
            refInput = document.createElement('input');
            refInput.type = 'hidden';
            refInput.name = 'referral_code';
            form.appendChild(refInput);
        }
        refInput.value = this.referralData.fullCode;

        // 添加代理信息
        let agentInput = form.querySelector('input[name="agent_code"]');
        if (!agentInput) {
            agentInput = document.createElement('input');
            agentInput.type = 'hidden';
            agentInput.name = 'agent_code';
            form.appendChild(agentInput);
        }
        agentInput.value = this.referralData.agentCode;
    }

    /**
     * 获取当前推广信息
     */
    getReferralData() {
        return this.referralData;
    }

    /**
     * 检查是否有推广信息
     */
    hasReferral() {
        return this.referralData !== null;
    }

    /**
     * 获取产品类型映射
     */
    getProductTypeMapping() {
        return {
            'maps-scraper': 'google-maps',
            'email-validator': 'email-filter',
            'whatsapp-validator': 'whatsapp-filter'
        };
    }

    /**
     * 根据当前页面确定产品类型
     */
    getCurrentProductType() {
        const urlParams = new URLSearchParams(window.location.search);
        const productId = urlParams.get('id');
        const mapping = this.getProductTypeMapping();
        return mapping[productId] || null;
    }
}

// 自动初始化
document.addEventListener('DOMContentLoaded', () => {
    window.mediamingleReferralTracker = new MediaMingleReferralTracker();
    
    // 全局函数，供其他脚本调用
    window.getReferralData = () => window.mediamingleReferralTracker.getReferralData();
    window.hasReferral = () => window.mediamingleReferralTracker.hasReferral();
});

// 导出供其他脚本使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MediaMingleReferralTracker;
}

} // 结束重复加载检查
