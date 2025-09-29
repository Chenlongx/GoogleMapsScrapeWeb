/**
 * MediaMingle 推广链接追踪系统 - 安全版本
 * 专为 https://mediamingle.cn/ 官网定制
 * 后端API: https://google-maps-backend-master.netlify.app/api
 */

// 检查是否已经加载
if (window.mediamingleReferralTrackerLoaded) {
    console.log('MediaMingle推广追踪器已加载，跳过重复初始化');
} else {
    window.mediamingleReferralTrackerLoaded = true;

    (function() {
        'use strict';

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

                try {
                    // 存储到localStorage
                    const dataToStore = {
                        referralData: this.referralData,
                        storedAt: new Date().toISOString()
                    };
                    localStorage.setItem('mediamingle_referral_data', JSON.stringify(dataToStore));

                    // 存储到Cookie（30天过期）
                    const cookieData = encodeURIComponent(JSON.stringify(dataToStore));
                    const expires = new Date();
                    expires.setDate(expires.getDate() + 30);
                    document.cookie = `mediamingle_referral_data=${cookieData}; expires=${expires.toUTCString()}; path=/`;

                    console.log('MediaMingle推广信息已存储');
                } catch (error) {
                    console.error('存储推广信息失败:', error);
                }
            }

            /**
             * 从存储中加载推广信息
             */
            loadStoredReferralData() {
                try {
                    // 从localStorage加载
                    const storedData = localStorage.getItem('mediamingle_referral_data');
                    if (storedData) {
                        const parsed = JSON.parse(storedData);
                        // 检查数据是否过期（30天）
                        const storedTime = new Date(parsed.storedAt);
                        const now = new Date();
                        const daysDiff = (now - storedTime) / (1000 * 60 * 60 * 24);
                        
                        if (daysDiff <= 30 && parsed.referralData) {
                            this.referralData = parsed.referralData;
                            console.log('MediaMingle推广信息从localStorage恢复:', this.referralData);
                            return;
                        }
                    }
                    
                    // 从Cookie加载
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

                document.body.appendChild(notification);

                // 5秒后自动隐藏
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 5000);
            }

            /**
             * 获取产品名称
             */
            getProductName(productType) {
                const productNames = {
                    'google-maps': 'Google Maps Scraper',
                    'email-filter': 'Email Validator',
                    'whatsapp-filter': 'WhatsApp Validator'
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
                // 监听购买按钮点击
                document.addEventListener('click', (event) => {
                    const target = event.target;
                    if (target.matches('.purchase-btn, .buy-btn, .checkout-btn, [data-action="purchase"]')) {
                        console.log('MediaMingle推广追踪器: 检测到购买按钮点击');
                        this.trackPurchase();
                    }
                });
            }

            /**
             * 追踪购买行为
             */
            trackPurchase() {
                if (!this.referralData) return;
                console.log('MediaMingle推广追踪器: 追踪购买行为', this.referralData);
                // 这里可以添加购买追踪逻辑
            }

            /**
             * 设置产品导航追踪
             */
            setupProductNavigation() {
                // 监听产品链接点击
                document.addEventListener('click', (event) => {
                    const target = event.target.closest('a');
                    if (target && target.href && target.href.includes('/product.html')) {
                        console.log('MediaMingle推广追踪器: 检测到产品页面导航');
                        this.preserveReferralInNavigation(target);
                    }
                });
            }

            /**
             * 在导航中保持推广信息
             */
            preserveReferralInNavigation(link) {
                if (!this.referralData) return;
                const url = new URL(link.href);
                if (!url.searchParams.has('ref')) {
                    url.searchParams.set('ref', this.referralData.fullCode);
                    link.href = url.toString();
                }
            }

            /**
             * 设置全局导航追踪
             */
            setupGlobalNavigation() {
                // 监听所有链接点击
                document.addEventListener('click', (event) => {
                    const target = event.target.closest('a');
                    if (target && target.href) {
                        this.preserveReferralInNavigation(target);
                    }
                });

                // 监听表单提交
                document.addEventListener('submit', (event) => {
                    this.preserveReferralInForm(event.target);
                });
            }

            /**
             * 在表单中保持推广信息
             */
            preserveReferralInForm(form) {
                if (!this.referralData) return;
                
                // 添加隐藏字段
                let refInput = form.querySelector('input[name="ref"]');
                if (!refInput) {
                    refInput = document.createElement('input');
                    refInput.type = 'hidden';
                    refInput.name = 'ref';
                    form.appendChild(refInput);
                }
                refInput.value = this.referralData.fullCode;
            }

            /**
             * 获取推广数据
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
        }

        // 自动初始化
        document.addEventListener('DOMContentLoaded', () => {
            window.mediamingleReferralTracker = new MediaMingleReferralTracker();
            
            // 全局函数，供其他脚本调用
            window.getReferralData = () => window.mediamingleReferralTracker.getReferralData();
            window.hasReferral = () => window.mediamingleReferralTracker.hasReferral();
        });

    })();
}
