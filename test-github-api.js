/**
 * GitHub API 测试脚本
 * 用于测试 GitHub Token 配置是否正确
 * 
 * 使用方法:
 *   node test-github-api.js
 * 
 * 或带 Token 测试:
 *   GITHUB_TOKEN=ghp_your_token node test-github-api.js
 */

const https = require('https');

// 测试配置
const TEST_CONFIG = {
    username: 'Chenlongx',
    repos: [
        'gogole_maps',
        'email_validator_repo',
        'whatsapp_validator_repo',
        'mediamingle_pro_repo'
    ]
};

// 颜色输出
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
    log(`ℹ️  ${message}`, 'cyan');
}

/**
 * 测试单个仓库的 GitHub API
 */
function testRepository(repo) {
    return new Promise((resolve, reject) => {
        const apiUrl = `https://api.github.com/repos/${TEST_CONFIG.username}/${repo}/releases/latest`;
        
        logInfo(`测试仓库: ${repo}`);
        
        const headers = {
            'User-Agent': 'GitHub-API-Test-Script',
            'Accept': 'application/vnd.github.v3+json'
        };
        
        // 如果有 Token，添加到请求头
        if (process.env.GITHUB_TOKEN) {
            headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
        }
        
        const request = https.get(apiUrl, { headers }, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                const rateLimitLimit = res.headers['x-ratelimit-limit'];
                const rateLimitRemaining = res.headers['x-ratelimit-remaining'];
                const rateLimitReset = res.headers['x-ratelimit-reset'];
                
                const result = {
                    repo,
                    statusCode: res.statusCode,
                    rateLimitLimit,
                    rateLimitRemaining,
                    rateLimitReset,
                    data: data
                };
                
                if (res.statusCode === 200) {
                    try {
                        const releaseData = JSON.parse(data);
                        result.version = releaseData.tag_name;
                        result.publishedAt = releaseData.published_at;
                        result.success = true;
                    } catch (e) {
                        result.success = false;
                        result.error = 'Failed to parse response';
                    }
                } else {
                    result.success = false;
                    try {
                        const errorData = JSON.parse(data);
                        result.error = errorData.message || 'Unknown error';
                    } catch (e) {
                        result.error = `HTTP ${res.statusCode}`;
                    }
                }
                
                resolve(result);
            });
        });
        
        request.on('error', (error) => {
            reject(error);
        });
        
        request.setTimeout(10000, () => {
            request.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

/**
 * 显示测试结果
 */
function displayResult(result) {
    console.log();
    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'blue');
    log(`仓库: ${result.repo}`, 'bright');
    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'blue');
    
    if (result.success) {
        logSuccess(`状态: 成功 (${result.statusCode})`);
        logInfo(`版本: ${result.version}`);
        logInfo(`发布时间: ${new Date(result.publishedAt).toLocaleString()}`);
    } else {
        logError(`状态: 失败 (${result.statusCode})`);
        logError(`错误: ${result.error}`);
    }
    
    console.log();
    log(`API 配额信息:`, 'cyan');
    log(`  限制: ${result.rateLimitLimit} 次/小时`);
    log(`  剩余: ${result.rateLimitRemaining} 次`);
    
    if (result.rateLimitReset) {
        const resetTime = new Date(parseInt(result.rateLimitReset) * 1000);
        log(`  重置时间: ${resetTime.toLocaleString()}`);
    }
}

/**
 * 主测试函数
 */
async function runTests() {
    log('╔═══════════════════════════════════════════════════════════╗', 'bright');
    log('║         GitHub API 配置测试                               ║', 'bright');
    log('╚═══════════════════════════════════════════════════════════╝', 'bright');
    console.log();
    
    // 检查 Token 配置
    if (process.env.GITHUB_TOKEN) {
        logSuccess('已检测到 GITHUB_TOKEN 环境变量');
        logInfo(`Token 前缀: ${process.env.GITHUB_TOKEN.substring(0, 7)}...`);
        logInfo('预期限制: 5000 次/小时');
    } else {
        logWarning('未检测到 GITHUB_TOKEN 环境变量');
        logWarning('将使用未认证模式（60 次/小时）');
        console.log();
        logInfo('要使用 Token 进行测试，请运行:');
        log('  GITHUB_TOKEN=your_token node test-github-api.js', 'yellow');
    }
    
    console.log();
    log('开始测试仓库访问...', 'bright');
    console.log();
    
    const results = [];
    
    // 依次测试每个仓库
    for (const repo of TEST_CONFIG.repos) {
        try {
            const result = await testRepository(repo);
            results.push(result);
            displayResult(result);
            
            // 短暂延迟，避免触发速率限制
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            logError(`测试 ${repo} 时出错: ${error.message}`);
            results.push({
                repo,
                success: false,
                error: error.message
            });
        }
    }
    
    // 显示总结
    console.log();
    log('╔═══════════════════════════════════════════════════════════╗', 'bright');
    log('║         测试总结                                          ║', 'bright');
    log('╚═══════════════════════════════════════════════════════════╝', 'bright');
    console.log();
    
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    
    log(`总计: ${totalCount} 个仓库`, 'bright');
    log(`成功: ${successCount} 个`, successCount === totalCount ? 'green' : 'yellow');
    log(`失败: ${totalCount - successCount} 个`, totalCount - successCount === 0 ? 'green' : 'red');
    
    console.log();
    
    if (successCount === totalCount) {
        logSuccess('所有测试通过！GitHub API 配置正确。');
    } else if (successCount > 0) {
        logWarning('部分测试失败，请检查失败的仓库配置。');
    } else {
        logError('所有测试失败，请检查网络连接和 Token 配置。');
    }
    
    console.log();
    
    // 提供建议
    const firstResult = results[0];
    if (firstResult && firstResult.rateLimitLimit) {
        console.log();
        log('建议:', 'cyan');
        
        if (firstResult.rateLimitLimit === '60') {
            logWarning('当前使用未认证模式（60 次/小时）');
            logInfo('建议配置 GITHUB_TOKEN 以提高限制到 5000 次/小时');
            console.log();
            logInfo('配置步骤:');
            log('  1. 访问: https://github.com/settings/tokens');
            log('  2. 创建新 Token，选择 public_repo 权限');
            log('  3. 在 Netlify 中设置环境变量 GITHUB_TOKEN');
        } else if (firstResult.rateLimitLimit === '5000') {
            logSuccess('当前使用认证模式（5000 次/小时）');
            logInfo(`剩余配额: ${firstResult.rateLimitRemaining} 次`);
        }
    }
    
    // 检查是否接近限制
    if (firstResult && firstResult.rateLimitRemaining) {
        const remaining = parseInt(firstResult.rateLimitRemaining);
        const limit = parseInt(firstResult.rateLimitLimit);
        const percentage = (remaining / limit) * 100;
        
        if (percentage < 20) {
            console.log();
            logWarning(`配额使用较多，剩余 ${percentage.toFixed(1)}%`);
            if (firstResult.rateLimitReset) {
                const resetTime = new Date(parseInt(firstResult.rateLimitReset) * 1000);
                logInfo(`配额将在 ${resetTime.toLocaleString()} 重置`);
            }
        }
    }
    
    console.log();
}

// 运行测试
runTests().catch(error => {
    console.error('测试过程中发生错误:', error);
    process.exit(1);
});

