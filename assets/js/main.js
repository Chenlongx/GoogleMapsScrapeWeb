/**
 * GoogleMapsScraper - Main JavaScript File
 */

document.addEventListener('DOMContentLoaded', () => {

    const App = {
        init() {
            this.loadHeader();
            this.loadFooter();

            // ⚡ 重要：header/footer 动态插入后立即绑定事件
            this.bindEvents();

            this.initTheme();
            this.initLang();
            this.setActiveNavLink();

            // 初始化 FAQ 和客户评价功能
            this.initFaqAccordion();
            this.initTestimonialCarousel();
            this.initContactModal();
            
            // 初始化推广链接追踪
            this.initReferralTracking();

            // 轻量交互增强（兼容移动端与减少动效设置）
            this.initRevealOnScroll();
            this.initBackToTop();
            this.initHeroParallax();
            this.initCardTilt();
        },

        state: {
            currentTheme: 'light',
            currentLang: 'zh',
        },

        // --- Header 和 Footer ---
        getHeaderHTML() {
            return `
                <div class="container">
                    <div class="logo" style="display: flex; align-items:center">
                        <a href="./index.html">
                            <img src="assets/img/logo.webp" alt="智贸云梯 Logo" style="height: 60px; width: auto;">
                        </a>
                        <span class="logo-text" data-lang-zh="智贸云梯" data-lang-en="SmartTrade CloudLadder">智贸云梯</span>
                    </div>
                    <nav class="main-nav" id="main-nav">
                        <ul>
                            <li><a href="./index.html" data-lang-zh="首页" data-lang-en="Home">首页</a></li>
                            <li class="nav-item-dropdown">
                                <a href="javascript:void(0);" class="dropdown-toggle" data-lang-zh="产品" data-lang-en="Product">产品 <i class='bx bx-chevron-down'></i></a>
                                <ul class="dropdown-menu">
                                    <li><a href="./product.html?id=maps-scraper" data-lang-zh="智贸云梯 | 谷歌地图抓取器" data-lang-en="Google Maps Scraper">Google Maps Scraper</a></li>
                                    <li><a href="./product.html?id=mediamingle-pro" data-lang-zh="智贸云梯 | 搜索引擎专业版" data-lang-en="MediaMingle Professional">MediaMingle Professional</a></li>
                                    <li><a href="./product.html?id=email-validator" data-lang-zh="智贸云梯 | 邮件营销大师" data-lang-en="MailPro Email Marketing Master">MailPro Email Marketing Master</a></li>
                                    <li><a href="./product.html?id=whatsapp-validator" data-lang-zh="智贸云梯 | WhatsApp验证" data-lang-en="WhatsApp Validator">WhatsApp Validator</a></li>
                                    <li><a href="./product.html?id=email-finder-extension" data-lang-zh="智贸云梯 | 谷歌插件获客" data-lang-en="Email Finder Chrome Extension">Email Finder Chrome Extension</a></li>
                                </ul>
                            </li>
                            <li><a href="./checkout.html" data-lang-zh="定价" data-lang-en="Pricing">定价</a></li>
                            <li><a href="./download.html" data-lang-zh="下载" data-lang-en="Download">下载</a></li>
                            <li><a href="./troubleshooting.html" data-lang-zh="安装问题" data-lang-en="Installation Issues">安装问题</a></li>
                            <li><a href="./docs.html" data-lang-zh="使用文档" data-lang-en="Docs">使用文档</a></li>
                            <li><a href="./contact.html" data-lang-zh="联系我们" data-lang-en="Contact">联系我们</a></li>
                        </ul>
                    </nav>
                    <div class="header-actions">
                        <button class="lang-toggle" id="lang-toggle" aria-label="Switch Language">EN</button>
                        <button class="theme-toggle" id="theme-toggle" aria-label="Toggle dark mode"></button>
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
                            <div class="mapouter">
                                <div class="gmap_canvas">
                                    <iframe class="gmap_iframe" frameborder="0" scrolling="no" marginheight="0" marginwidth="0"
                                        src="https://maps.google.com/maps?width=300&amp;height=300&amp;hl=zh-CN&amp;q=广州天河软件园&amp;t=&amp;z=14&amp;ie=UTF8&amp;iwloc=B&amp;output=embed">
                                    </iframe>
                                    <a href="https://embedgooglemap.xyz/">google maps iframe</a>
                                </div>
                                <style>
                                    .mapouter {
                                        position: relative;
                                        text-align: right;
                                        width: 300px;
                                        height: 300px;
                                    }
                                    .gmap_canvas {
                                        overflow: hidden;
                                        background: none!important;
                                        width: 300px;
                                        height: 300px;
                                    }
                                    .gmap_iframe {
                                        width: 300px!important;
                                        height: 300px!important;
                                    }
                                </style>
                            </div>
                            <p data-lang-zh="中心位置" data-lang-en="Location">中心位置</p>
                        </div>
                        <div class="footer-links">
                            <h3 data-lang-zh="产品" data-lang-en="Product">产品</h3>
                            <ul>
                                <li><a href="./checkout.html" data-lang-zh="定价" data-lang-en="Pricing">定价</a></li>
                                <li><a href="./docs.html" data-lang-zh="文档" data-lang-en="Docs">文档</a></li>
                                <li><a href="./faq.html" data-lang-zh="常见问题" data-lang-en="FAQ">常见问题</a></li>
                                <li><a href="./troubleshooting.html" data-lang-zh="安装问题" data-lang-en="Installation Issues">安装问题</a></li>
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

        // --- 事件绑定 ---
        bindEvents() {
            const mobileToggle = document.getElementById('mobile-nav-toggle');
            const themeToggle = document.getElementById('theme-toggle');
            const langToggle = document.getElementById('lang-toggle');
            // ▼▼▼ 新增联系按钮的事件绑定 ▼▼▼
            const contactFab = document.getElementById('contact-fab');
            const modalContainer = document.getElementById('contact-modal-container');
            const modalCloseBtn = document.getElementById('modal-close-btn');

            if (mobileToggle) {
                mobileToggle.addEventListener('click', this.toggleMobileNav);
            }
            if (themeToggle) {
                themeToggle.addEventListener('click', () => this.toggleTheme());
            }
            if (langToggle) {
                langToggle.addEventListener('click', () => this.toggleLang());
            }
            // ▼▼▼ 联系按钮点击事件 ▼▼▼
            if (contactFab && modalContainer) {
                contactFab.addEventListener('click', () => {
                    modalContainer.classList.add('active');
                });
            }
            if (modalCloseBtn && modalContainer) { // <-- 将这一整块
                modalCloseBtn.addEventListener('click', () => {
                    modalContainer.classList.remove('active');
                });
            }
            // 点击遮罩层关闭弹窗
            if (modalContainer) {
                modalContainer.addEventListener('click', (e) => {
                    if (e.target === modalContainer) {
                        modalContainer.classList.remove('active');
                    }
                });
            }
        },

        // --- 移动端导航 ---
        toggleMobileNav() {
            const nav = document.getElementById('main-nav');
            const toggleButton = document.getElementById('mobile-nav-toggle');
            const isExpanded = toggleButton.getAttribute('aria-expanded') === 'true';
            nav.classList.toggle('active');
            toggleButton.setAttribute('aria-expanded', !isExpanded);
        },
        initContactModal() {
            // 这个函数目前是空的，因为所有逻辑都已移至 bindEvents 中
            // 这样做是为了保持结构清晰，未来可以把弹窗逻辑移到这里
            console.log('Contact modal events bound.');
        },

        // --- 主题相关 ---
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

        // --- 语言相关 ---
        initLang() {
            const savedLang = localStorage.getItem('lang');
            if (savedLang) {
                // 如果用户之前手动切换过，就用保存的
                this.state.currentLang = savedLang;
            } else {
                // 否则根据浏览器语言自动判断
                const browserLang = navigator.language || navigator.userLanguage;
                if (browserLang.toLowerCase().startsWith('zh')) {
                    this.state.currentLang = 'zh';
                } else {
                    this.state.currentLang = 'en';
                }
            }
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
                const val = el.getAttribute(`data-lang-${this.state.currentLang}`);
                if (val != null) {
                    const tag = el.tagName.toLowerCase();

                    // <meta name="description"> 这类需要写到 content 属性
                    if (tag === 'meta' && el.getAttribute('name') === 'description') {
                        el.setAttribute('content', val);
                    }
                    // 表单类：优先改 placeholder，没有就直接改 value
                    else if ((tag === 'input' || tag === 'textarea')) {
                        if (el.hasAttribute('placeholder')) {
                            el.setAttribute('placeholder', val);
                        } else {
                            el.value = val;
                        }
                    }
                    // 其它元素：直接改文本
                    else {
                        // ▼▼▼ 核心修改点在这里 ▼▼▼
                        el.innerHTML = val; // 将 textContent 修改为 innerHTML
                        // ▲▲▲ 修改结束 ▲▲▲
                    }
                }
            });

            document.documentElement.lang = this.state.currentLang === 'zh' ? 'zh-CN' : 'en';
            if (langToggleButton) {
                langToggleButton.textContent = this.state.currentLang === 'zh' ? 'EN' : '中';
            }
        },

        // --- 其它 ---
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

                    allButtons.forEach(button => {
                        button.setAttribute('aria-expanded', 'false');
                        const otherAnswerId = button.getAttribute('aria-controls');
                        const otherAnswerElement = document.getElementById(otherAnswerId);
                        if (otherAnswerElement) {
                            otherAnswerElement.classList.remove('open');
                            otherAnswerElement.hidden = true;
                        }
                    });

                    if (!isCurrentlyExpanded) {
                        clickedButton.setAttribute('aria-expanded', 'true');
                        if (answerElement) {
                            answerElement.hidden = false;
                            // 使用setTimeout确保hidden属性先生效，然后再添加open类
                            setTimeout(() => {
                                answerElement.classList.add('open');
                            }, 10);
                        }
                    }
                });
            });
        },
        initTestimonialCarousel() {
            const track = document.getElementById('testimonials-track');
            if (!track) return;

            // 复制所有卡片以实现无缝滚动
            const originalCards = Array.from(track.children);
            originalCards.forEach(card => {
                const clone = card.cloneNode(true);
                track.appendChild(clone);
            });
        },

        // 初始化推广链接追踪
        initReferralTracking() {
            // 检查是否有推广链接追踪器
            if (typeof window.mediamingleReferralTracker !== 'undefined') {
                console.log('MediaMingle推广追踪器已加载');
                return;
            }

            // 如果没有加载，则动态加载推广追踪器
            const script = document.createElement('script');
            script.src = 'https://google-maps-backend-master.netlify.app/mediamingle-referral-tracker.js';
            script.onload = () => {
                console.log('智贸云梯推广追踪器加载成功');
            };
            script.onerror = () => {
                console.warn('MediaMingle推广追踪器加载失败，使用本地版本');
                // 如果远程加载失败，使用本地版本
                this.loadLocalReferralTracker();
            };
            document.head.appendChild(script);
        },

        // 加载本地推广追踪器
        loadLocalReferralTracker() {
            // 这里可以添加本地版本的推广追踪器代码
            // 或者从本地文件加载
            const script = document.createElement('script');
            script.src = './assets/js/referral-tracker.js';
            document.head.appendChild(script);
        },

        // --- 视口进入动画 ---
        initRevealOnScroll() {
            const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

            // 需要淡入的元素集合（无需改HTML，JS自动添加reveal类）
            const selectors = [
                '.hero-text h1', '.hero-text .subtitle', '.hero-actions',
                '.why-us-section .section-header', '.why-us-section .new-feature-card',
                '#tools .section-header', '#tools .new-feature-card',
                '.how-it-works .section-header', '.how-it-works .step-row',
                '.testimonials-section .section-header', '.testimonial-card',
                '.faq-section .section-header', '.faq-item'
            ];
            const nodes = selectors.flatMap(sel => Array.from(document.querySelectorAll(sel)));

            if (reduceMotion) {
                nodes.forEach(el => el.classList.remove('reveal'));
                return; // 尊重减少动效设置
            }

            nodes.forEach(el => el.classList.add('reveal'));

            const io = new IntersectionObserver((entries, obs) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        obs.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });

            nodes.forEach(el => io.observe(el));
        },

        // --- 返回顶部按钮 ---
        initBackToTop() {
            const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const btn = document.createElement('button');
            btn.id = 'back-to-top';
            btn.type = 'button';
            btn.setAttribute('aria-label', this.state.currentLang === 'zh' ? '返回顶部' : 'Back to top');
            btn.innerHTML = '↑';
            document.body.appendChild(btn);

            btn.addEventListener('click', () => {
                window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
            });

            let ticking = false;
            const onScroll = () => {
                if (!ticking) {
                    window.requestAnimationFrame(() => {
                        btn.classList.toggle('show', window.scrollY > 400);
                        ticking = false;
                    });
                    ticking = true;
                }
            };
            window.addEventListener('scroll', onScroll, { passive: true });
            onScroll();
        },

        // --- Hero 轻量视差 ---
        initHeroParallax() {
            const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
            const heroImg = document.querySelector('.hero-visual img');
            if (!heroImg || reduceMotion || !finePointer) return;

            let rafId = null;
            const maxShift = 40; // 最大位移，避免夸张
            const update = () => {
                const y = Math.min(window.scrollY * 0.08, maxShift);
                heroImg.style.transform = `translateY(${y}px)`;
                rafId = null;
            };
            const onScroll = () => {
                if (rafId == null) rafId = requestAnimationFrame(update);
            };
            window.addEventListener('scroll', onScroll, { passive: true });
            update();
        },

        // --- 卡片3D悬浮（桌面端） ---
        initCardTilt() {
            const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
            if (reduceMotion || !finePointer) return; // 移动端或减少动效时禁用

            const cards = document.querySelectorAll('.card-hover-effect');
            cards.forEach(card => {
                const onMove = (e) => {
                    const rect = card.getBoundingClientRect();
                    const px = (e.clientX - rect.left) / rect.width; // 0..1
                    const py = (e.clientY - rect.top) / rect.height; // 0..1
                    const rx = (py - 0.5) * 6; // 旋转X角度
                    const ry = (px - 0.5) * -6; // 旋转Y角度
                    card.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg)`;
                };
                const onLeave = () => {
                    card.style.transform = 'perspective(800px) rotateX(0) rotateY(0)';
                };
                card.addEventListener('mousemove', onMove);
                card.addEventListener('mouseleave', onLeave);
            });
        }
    };

    App.init();
});
