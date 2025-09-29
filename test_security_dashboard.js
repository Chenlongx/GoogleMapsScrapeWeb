// 安全监控面板测试脚本
// 用于测试安全管理员 API 的功能

const https = require('https');

// 测试配置
const BASE_URL = 'https://mediamingle.cn';
const ADMIN_KEY = 'test_admin_key'; // 请替换为真实的管理员密钥

// 测试函数
async function testSecurityAPI() {
    console.log('🛡️ 开始测试安全监控面板 API\n');
    console.log('='.repeat(50));
    
    const endpoints = [
        {
            name: '安全统计信息',
            path: '/api/security-admin/stats',
            method: 'GET'
        },
        {
            name: '被封禁IP列表',
            path: '/api/security-admin/blocked-ips',
            method: 'GET'
        },
        {
            name: '可疑IP列表',
            path: '/api/security-admin/suspicious-ips',
            method: 'GET'
        }
    ];
    
    for (const endpoint of endpoints) {
        console.log(`\n测试: ${endpoint.name}`);
        console.log(`端点: ${endpoint.path}`);
        
        try {
            const result = await makeRequest(endpoint.path, endpoint.method);
            console.log(`状态码: ${result.statusCode}`);
            
            if (result.statusCode === 200) {
                const data = JSON.parse(result.body);
                console.log('✅ 请求成功');
                console.log('响应数据:', JSON.stringify(data, null, 2));
            } else if (result.statusCode === 401) {
                console.log('🔒 需要管理员认证');
                console.log('响应:', result.body);
            } else {
                console.log('❌ 请求失败');
                console.log('响应:', result.body);
            }
        } catch (error) {
            console.log('❌ 请求出错:', error.message);
        }
        
        console.log('-'.repeat(30));
    }
}

// 发送 HTTP 请求
function makeRequest(path, method = 'GET') {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'X-Admin-Key': ADMIN_KEY,
                'Content-Type': 'application/json',
                'User-Agent': 'Security-Dashboard-Test/1.0'
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

// 测试本地环境
async function testLocalEnvironment() {
    console.log('\n🏠 测试本地环境\n');
    console.log('='.repeat(50));
    
    // 检查环境变量
    console.log('环境变量检查:');
    console.log(`ADMIN_SECRET_KEY: ${process.env.ADMIN_SECRET_KEY ? '已设置' : '未设置'}`);
    console.log(`GITHUB_TOKEN: ${process.env.GITHUB_TOKEN ? '已设置' : '未设置'}`);
    
    // 测试安全中间件
    try {
        const security = require('./netlify/functions/security-middleware');
        console.log('\n安全中间件测试:');
        
        // 测试统计信息
        const stats = security.getSecurityStats();
        console.log('统计信息:', JSON.stringify(stats, null, 2));
        
        // 测试IP检查
        const testEvent = {
            httpMethod: 'GET',
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'x-forwarded-for': '192.168.1.100'
            }
        };
        
        const securityCheck = security.performSecurityCheck(testEvent);
        console.log('安全检查结果:', securityCheck.allowed ? '允许' : '阻止');
        
    } catch (error) {
        console.log('❌ 安全中间件测试失败:', error.message);
    }
}

// 运行测试
async function runTests() {
    try {
        await testLocalEnvironment();
        await testSecurityAPI();
        
        console.log('\n📊 测试完成');
        console.log('\n💡 如果测试失败，请检查:');
        console.log('1. Netlify 环境变量是否正确设置');
        console.log('2. 管理员密钥是否正确');
        console.log('3. 网络连接是否正常');
        console.log('4. Netlify 函数是否正常部署');
        
    } catch (error) {
        console.error('测试过程中出现错误:', error);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    runTests();
}

module.exports = { testSecurityAPI, testLocalEnvironment };
