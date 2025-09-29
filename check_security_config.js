// 安全配置检查脚本
// 用于检查安全配置是否正确设置

const https = require('https');

// 检查配置
async function checkSecurityConfig() {
    console.log('🔍 开始检查安全配置\n');
    console.log('='.repeat(50));
    
    // 1. 检查环境变量
    console.log('📋 环境变量检查:');
    const requiredEnvVars = [
        'ADMIN_SECRET_KEY',
        'GITHUB_TOKEN'
    ];
    
    let envIssues = [];
    for (const envVar of requiredEnvVars) {
        const value = process.env[envVar];
        if (!value) {
            envIssues.push(`❌ ${envVar}: 未设置`);
        } else {
            // 检查密钥强度
            if (envVar === 'ADMIN_SECRET_KEY') {
                if (value.length < 16) {
                    envIssues.push(`⚠️  ${envVar}: 密钥长度过短 (${value.length} 字符，建议至少16字符)`);
                } else {
                    console.log(`✅ ${envVar}: 已设置 (${value.length} 字符)`);
                }
            } else {
                console.log(`✅ ${envVar}: 已设置`);
            }
        }
    }
    
    if (envIssues.length > 0) {
        console.log('\n🚨 环境变量问题:');
        envIssues.forEach(issue => console.log(issue));
    }
    
    // 2. 检查本地安全中间件
    console.log('\n🛡️ 本地安全中间件检查:');
    try {
        const security = require('./netlify/functions/security-middleware');
        
        // 测试基本功能
        const stats = security.getSecurityStats();
        console.log('✅ 安全统计功能正常');
        
        // 测试安全检查
        const testEvent = {
            httpMethod: 'GET',
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'x-forwarded-for': '192.168.1.100'
            }
        };
        
        const securityCheck = security.performSecurityCheck(testEvent);
        console.log('✅ 安全检查功能正常');
        
    } catch (error) {
        console.log('❌ 安全中间件检查失败:', error.message);
    }
    
    // 3. 检查生产环境API
    console.log('\n🌐 生产环境API检查:');
    await checkProductionAPI();
    
    // 4. 安全建议
    console.log('\n💡 安全建议:');
    console.log('1. 确保 ADMIN_SECRET_KEY 是强密码（至少32位随机字符串）');
    console.log('2. 定期轮换所有密钥');
    console.log('3. 监控安全日志');
    console.log('4. 限制管理员面板的访问IP');
    console.log('5. 使用HTTPS访问所有管理功能');
    
    console.log('\n📊 检查完成');
}

// 检查生产环境API
async function checkProductionAPI() {
    const baseUrl = 'https://mediamingle.cn';
    const endpoints = [
        { name: '基本统计信息', path: '/api/security-stats' },
        { name: '管理员统计', path: '/api/security-admin/stats' }
    ];
    
    for (const endpoint of endpoints) {
        try {
            const result = await makeRequest(`${baseUrl}${endpoint.path}`);
            console.log(`✅ ${endpoint.name}: ${result.statusCode} ${result.statusCode === 200 ? '正常' : '异常'}`);
            
            if (endpoint.path.includes('security-admin') && result.statusCode === 503) {
                console.log('   ⚠️  管理员功能未配置（这是安全的，如果未设置 ADMIN_SECRET_KEY）');
            }
        } catch (error) {
            console.log(`❌ ${endpoint.name}: 请求失败 - ${error.message}`);
        }
    }
}

// 发送HTTP请求
function makeRequest(url) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Security-Config-Checker/1.0'
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        req.end();
    });
}

// 生成安全的管理员密钥
function generateSecureAdminKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let result = '';
    for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// 如果直接运行此脚本
if (require.main === module) {
    checkSecurityConfig().catch(console.error);
    
    console.log('\n🔑 如果需要生成新的管理员密钥:');
    console.log('ADMIN_SECRET_KEY=' + generateSecureAdminKey());
}

module.exports = { checkSecurityConfig, generateSecureAdminKey };
