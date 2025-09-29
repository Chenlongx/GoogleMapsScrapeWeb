// 安全功能测试脚本
// 用于测试安全中间件的各种功能

const security = require('./netlify/functions/security-middleware');

// 模拟事件对象
function createMockEvent(ip, userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', method = 'GET') {
    return {
        httpMethod: method,
        headers: {
            'user-agent': userAgent,
            'x-forwarded-for': ip,
            'content-length': '100'
        },
        body: '{}'
    };
}

// 测试用例
const testCases = [
    {
        name: '正常请求',
        event: createMockEvent('192.168.1.100'),
        expected: 'allowed'
    },
    {
        name: '缺少User-Agent',
        event: {
            httpMethod: 'GET',
            headers: {
                'x-forwarded-for': '192.168.1.101'
            }
        },
        expected: 'blocked'
    },
    {
        name: '被阻止的User-Agent',
        event: createMockEvent('192.168.1.102', 'python-requests/2.28.1'),
        expected: 'blocked'
    },
    {
        name: '内容过大',
        event: {
            httpMethod: 'POST',
            headers: {
                'user-agent': 'Mozilla/5.0',
                'x-forwarded-for': '192.168.1.103',
                'content-length': '2097152' // 2MB
            }
        },
        expected: 'blocked'
    }
];

// 运行测试
async function runSecurityTests() {
    console.log('🛡️ 开始安全功能测试\n');
    console.log('='.repeat(50));
    
    let passedTests = 0;
    let totalTests = testCases.length;
    
    for (const testCase of testCases) {
        console.log(`\n测试: ${testCase.name}`);
        console.log(`IP: ${testCase.event.headers['x-forwarded-for'] || 'unknown'}`);
        console.log(`User-Agent: ${testCase.event.headers['user-agent'] || 'none'}`);
        
        try {
            const result = security.performSecurityCheck(testCase.event);
            
            if (testCase.expected === 'allowed' && result.allowed) {
                console.log('✅ 测试通过 - 请求被允许');
                passedTests++;
            } else if (testCase.expected === 'blocked' && !result.allowed) {
                console.log('✅ 测试通过 - 请求被阻止');
                console.log(`   原因: ${result.body ? JSON.parse(result.body).reason : 'unknown'}`);
                passedTests++;
            } else {
                console.log('❌ 测试失败');
                console.log(`   期望: ${testCase.expected}`);
                console.log(`   实际: ${result.allowed ? 'allowed' : 'blocked'}`);
            }
        } catch (error) {
            console.log('❌ 测试出错:', error.message);
        }
    }
    
    // 测试速率限制
    console.log('\n' + '='.repeat(50));
    console.log('\n🚀 测试速率限制功能');
    
    const testIP = '192.168.1.200';
    let rateLimitPassed = true;
    
    // 模拟大量请求
    for (let i = 0; i < 15; i++) {
        const event = createMockEvent(testIP);
        const result = security.performSecurityCheck(event);
        
        if (i < 10) {
            if (!result.allowed) {
                console.log(`❌ 第${i+1}次请求被意外阻止`);
                rateLimitPassed = false;
                break;
            }
        } else {
            if (result.allowed) {
                console.log(`❌ 第${i+1}次请求应该被阻止但被允许了`);
                rateLimitPassed = false;
                break;
            } else {
                console.log(`✅ 第${i+1}次请求被正确阻止 (速率限制)`);
                break;
            }
        }
    }
    
    if (rateLimitPassed) {
        passedTests++;
        totalTests++;
    } else {
        totalTests++;
    }
    
    // 测试IP封禁功能
    console.log('\n' + '='.repeat(50));
    console.log('\n🔒 测试IP封禁功能');
    
    const blockIP = '192.168.1.201';
    security.blockIP(blockIP);
    
    const blockedEvent = createMockEvent(blockIP);
    const blockedResult = security.performSecurityCheck(blockedEvent);
    
    if (!blockedResult.allowed) {
        console.log('✅ IP封禁功能正常');
        passedTests++;
    } else {
        console.log('❌ IP封禁功能异常');
    }
    totalTests++;
    
    // 输出测试结果
    console.log('\n' + '='.repeat(50));
    console.log(`\n📊 测试结果: ${passedTests}/${totalTests} 通过`);
    
    if (passedTests === totalTests) {
        console.log('🎉 所有安全测试通过！');
    } else {
        console.log('⚠️  部分测试失败，请检查配置');
    }
    
    // 显示安全统计
    console.log('\n📈 安全统计信息:');
    const stats = security.getSecurityStats();
    console.log(JSON.stringify(stats, null, 2));
}

// 如果直接运行此脚本
if (require.main === module) {
    runSecurityTests().catch(console.error);
}

module.exports = { runSecurityTests };
