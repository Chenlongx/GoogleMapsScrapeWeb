/**
 * GoogleMapsScraper - Main JavaScript File
 *
 * 功能:
 * 1. 动态加载可复用的头部和尾部
 * 2. 处理移动端导航菜单
 * 3. 实现浅色/深色模式切换与记忆
 * 4. 实现中/英双语切换与记忆
 * 5. 客户端表单提交处理 (fetch to placeholder API)
 * 6. 显示成功/失败通知
 * 7. 高亮当前页面的导航链接
 * 8. FAQ 手风琴效果
 */

document.addEventListener('DOMContentLoaded', () => {

    // --- 组件定义 ---
    const App = {
        // --- 1. 初始化 ---
        init() {
            this.loadHeader();
            this.loadFooter();
            this.initTheme();
            this.initLang();

            // 使用 setTimeout 确保 DOM 更新后再绑定事件
            setTimeout(() => {
                this.bindEvents();
                this.setActiveNavLink();
                this.initFaqAccordion();
            }, 0);
        },

        state: {
            currentTheme: 'light',
            currentLang: 'zh',
        },

        // --- 3. 动态组件加载 ---
        // 您没看到的导航和页脚文本都在这里定义
        getHeaderHTML() {
            return `
                <div class="container">
                    <div class="logo" style="display: flex; align-items:center">
                        <a href="./index.html">
                            <img src="./assets/img/logo.png" alt="GoogleMapsScraper Logo" style="height: 60px; width: auto;">
                        </a>
                        <span class="logo-text">GoogleMapsScraper</span>
                    </div>
                    <nav class="main-nav" id="main-nav">
                        <ul>
                            <li><a href="./index.html" data-lang-zh="首页" data-lang-en="Home">首页</a></li>
                            <li><a href="./product.html" data-lang-zh="产品" data-lang-en="Product">产品</a></li>
                            <li><a href="./pricing.html" data-lang-zh="定价" data-lang-en="Pricing">定价</a></li>
                            <li><a href="./docs.html" data-lang-zh="文档" data-lang-en="Docs">文档</a></li>
                            <li><a href="./faq.html" data-lang-zh="FAQ" data-lang-en="FAQ">FAQ</a></li>
                            <li><a href="./download.html" data-lang-zh="下载" data-lang-en="Download">下载</a></li>
                            <li><a href="./contact.html" data-lang-zh="联系我们" data-lang-en="Contact">联系我们</a></li>
                        </ul>
                    </nav>
                    <div class="header-actions">
                        <button class="lang-toggle" id="lang-toggle" aria-label="Switch Language">EN</button>
                        <button class="theme-toggle" id="theme-toggle" aria-label="Toggle dark mode">
                           </button>
                        <button class="mobile-nav-toggle" id="mobile-nav-toggle" aria-controls="main-nav" aria-expanded="false">
                            <span class="sr-only" data-lang-zh="打开导航" data-lang-en="Open navigation">打开导航</span>
                            <span class="icon-bar"></span>
                            <span class="icon-bar"></span>
                            <span class="icon-bar"></span>
                        </button>
                    </div>
                </div>
            `;
        },

        getFooterHTML() {
            return `
                <div class="container">
                    <div class="footer-content">
                        <div class="footer-about">
                            <div class="mapouter"><div class="gmap_canvas"><iframe class="gmap_iframe" frameborder="0" scrolling="no" marginheight="0" marginwidth="0" src="https://maps.google.com/maps?width=300&amp;height=300&amp;hl=en&amp;q=高义创新产业园&amp;t=&amp;z=14&amp;ie=UTF8&amp;iwloc=B&amp;output=embed"></iframe><a href="https://embedgooglemap.xyz/">google maps iframe</a></div><style>.mapouter{position:relative;text-align:right;width:300px;height:300px;}.gmap_canvas {overflow:hidden;background:none!important;width:300px;height:300px;}.gmap_iframe {width:300px!important;height:300px!important;}</style></div>
                            <p data-lang-zh="中心位置" data-lang-en="Location">中心位置</p>
                        </div>
                        <div class="footer-links">
                            <h3 data-lang-zh="产品" data-lang-en="Product">产品</h3>
                            <ul>
                                <li><a href="./pricing.html" data-lang-zh="定价" data-lang-en="Pricing">定价</a></li>
                                <li><a href="./docs.html" data-lang-zh="文档" data-lang-en="Docs">文档</a></li>
                            </ul>
                        </div>
                        <div class="footer-links">
                            <h3 data-lang-zh="公司" data-lang-en="Company">公司</h3>
                            <ul>
                                <li><a href="./about.html" data-lang-zh="关于我们" data-lang-en="About Us">关于我们</a></li>
                                <li><a href="./contact.html" data-lang-zh="联系我们" data-lang-en="Contact">联系我们</a></li>
                            </ul>
                        </div>
                        <div class="footer-links">
                            <h3 data-lang-zh="法律" data-lang-en="Legal">法律</h3>
                            <ul>
                                <li><a href="./privacy.html" data-lang-zh="隐私政策" data-lang-en="Privacy Policy">隐私政策</a></li>
                                <li><a href="./terms.html" data-lang-zh="服务条款" data-lang-en="Terms of Service">服务条款</a></li>
                            </ul>
                        </div>
                    </div>
                    <div class="footer-bottom">
                        <p>&copy; ${new Date().getFullYear()} GoogleMapsScraper. All rights reserved.</p>
                    </div>
                </div>
            `;
        },

        loadHeader() {
            document.getElementById('main-header').innerHTML = this.getHeaderHTML();
        },

        loadFooter() {
            document.getElementById('main-footer').innerHTML = this.getFooterHTML();
        },

        bindEvents() {
            document.getElementById('mobile-nav-toggle').addEventListener('click', this.toggleMobileNav);
            document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());
            document.getElementById('lang-toggle').addEventListener('click', () => this.toggleLang());
            // const contactForm = document.getElementById('contact-form');
            // if (contactForm) {
            //     contactForm.addEventListener('submit', this.handleFormSubmit);
            // }
        },

        toggleMobileNav() {
            const nav = document.getElementById('main-nav');
            const toggleButton = document.getElementById('mobile-nav-toggle');
            const isExpanded = toggleButton.getAttribute('aria-expanded') === 'true';
            nav.classList.toggle('active');
            toggleButton.setAttribute('aria-expanded', !isExpanded);
        },

        initTheme() {
            const savedTheme = localStorage.getItem('theme');
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            this.state.currentTheme = savedTheme || (prefersDark ? 'dark' : 'light');
            this.applyTheme();
        },

        toggleTheme() {
            this.state.currentTheme = this.state.currentTheme === 'light' ? 'dark' : 'light';
            localStorage.setItem('theme', this.state.currentTheme);
            this.applyTheme();
        },

        applyTheme() {
            document.documentElement.setAttribute('data-theme', this.state.currentTheme);
            const themeToggle = document.getElementById('theme-toggle');
            if (themeToggle) {
                if (this.state.currentTheme === 'dark') {
                    themeToggle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.95-4.243l-1.59-1.59M3 12H.75m.386-6.364L3.75 7.25M12 6a6 6 0 100 12 6 6 0 000-12z" /></svg>`;
                } else {
                    themeToggle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>`;
                }
            }
        },

        initLang() {
            const savedLang = localStorage.getItem('lang');
            this.state.currentLang = savedLang || 'zh';
            this.applyLang();
        },

        toggleLang() {
            this.state.currentLang = this.state.currentLang === 'zh' ? 'en' : 'zh';
            localStorage.setItem('lang', this.state.currentLang);
            this.applyLang();
        },

        applyLang() {
            const langElements = document.querySelectorAll('[data-lang-zh], [data-lang-en]');
            const langToggleButton = document.getElementById('lang-toggle');

            langElements.forEach(el => {
                const newText = el.dataset[`lang-${this.state.currentLang}`];
                if (newText) {
                    el.textContent = newText;
                }
            });

            document.documentElement.lang = this.state.currentLang === 'zh' ? 'zh-CN' : 'en';

            if (langToggleButton) {
                langToggleButton.textContent = this.state.currentLang === 'zh' ? 'EN' : '中';
            }
        },

        // async handleFormSubmit(event) {
        //     event.preventDefault();
        //     const form = event.target;
        //     const formData = new FormData(form);
        //     const data = Object.fromEntries(formData.entries());
        //     const submitButton = form.querySelector('button[type="submit"]');
        //     submitButton.disabled = true;
        //     submitButton.textContent = 'Sending...';
        //     try {
        //         const response = await fetch('https://jsonplaceholder.typicode.com/posts', {
        //             method: 'POST',
        //             headers: { 'Content-Type': 'application/json' },
        //             body: JSON.stringify(data),
        //         });
        //         if (response.ok) {
        //             App.showNotification('Message sent successfully!', 'success');
        //             form.reset();
        //         } else {
        //             throw new Error('Network response was not ok.');
        //         }
        //     } catch (error) {
        //         App.showNotification('Failed to send message. Please try again.', 'error');
        //         console.error('Form submission error:', error);
        //     } finally {
        //         submitButton.disabled = false;
        //         const originalText = App.state.currentLang === 'zh' ? '发送消息' : 'Send Message';
        //         submitButton.textContent = originalText;
        //     }
        // },

        showNotification(message, type = 'success') {
            const banner = document.getElementById('notification-banner');
            banner.textContent = message;
            banner.className = `notification-banner ${type}`;
            banner.classList.add('show');
            setTimeout(() => {
                banner.classList.remove('show');
            }, 3000);
        },

        setActiveNavLink() {
            const currentPath = window.location.pathname.split('/').pop() || 'index.html';
            const navLinks = document.querySelectorAll('.main-nav a');
            navLinks.forEach(link => {
                const linkPath = link.getAttribute('href').split('/').pop();
                if (linkPath === currentPath) {
                    link.classList.add('active');
                }
            });
        },

        initFaqAccordion() {
            const accordion = document.getElementById('faq-accordion');
            if (!accordion) return;

            const allButtons = accordion.querySelectorAll('.faq-question button');

            allButtons.forEach(clickedButton => {
                clickedButton.addEventListener('click', () => {
                    const isCurrentlyExpanded = clickedButton.getAttribute('aria-expanded') === 'true';
                    const answerId = clickedButton.getAttribute('aria-controls');
                    const answerElement = document.getElementById(answerId);

                    // --- 关键步骤 1: 先关闭所有的答案 ---
                    allButtons.forEach(button => {
                        button.setAttribute('aria-expanded', 'false');
                        const otherAnswerId = button.getAttribute('aria-controls');
                        const otherAnswerElement = document.getElementById(otherAnswerId);
                        if (otherAnswerElement) {
                            otherAnswerElement.hidden = true;  // 隐藏其他答案
                        }
                    });

                    // --- 关键步骤 2: 如果当前点击的那个原本是关闭的，就把它打开 ---
                    if (!isCurrentlyExpanded) {
                        clickedButton.setAttribute('aria-expanded', 'true');
                        if (answerElement) {
                            answerElement.hidden = false;  // 显示当前答案
                        }
                    }
                });
            });
        }
    };

    // --- 启动应用 ---
    App.init();
});