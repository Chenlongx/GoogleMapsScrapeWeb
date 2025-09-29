// GitHub API 代理测试脚本
// 用于测试修复后的 GitHub API 代理功能

const https = require('https');

// 测试配置
const testConfigs = [
    {
        name: 'gogole_maps',
        username: 'Chenlongx',
        repo: 'gogole_maps'
    },
    {
        name: 'email_validator_repo',
        username: 'Chenlongx',
        repo: 'email_validator_repo'
    },
    {
        name: 'whatsapp_validator_repo',
        username: 'Chenlongx',
        repo: 'whatsapp_validator_repo'
    }
];

// 模拟 Netlify Function 环境
function testGitHubAPI(username, repo) {
    return new Promise((resolve, reject) => {
        const githubUrl = `https://api.github.com/repos/${username}/${repo}/releases/latest`;
        
        console.log(`\n测试仓库: ${username}/${repo}`);
        console.log(`API URL: ${githubUrl}`);
        
        const headers = {
            'User-Agent': 'Netlify-Function-Test',
            'Accept': 'application/vnd.github.v3+json'
        };
        
        // 如果环境变量中有 GitHub Token，则添加到请求头中
        if (process.env.GITHUB_TOKEN) {
            headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
            console.log('✅ 使用 GitHub Token 认证');
        } else {
            console.log('⚠️  未设置 GitHub Token，使用匿名访问');
        }
        
        const request = https.get(githubUrl, { headers }, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log(`状态码: ${res.statusCode}`);
                
                if (res.statusCode >= 400) {
                    console.log('❌ 请求失败');
                    try {
                        const errorData = JSON.parse(data);
                        console.log('错误信息:', errorData.message || errorData);
                        
                        if (res.statusCode === 403) {
                            if (errorData.message && errorData.message.includes('API rate limit')) {
                                console.log('🔒 API 速率限制');
                            } else {
                                console.log('🚫 访问被拒绝');
                            }
                        }
                    } catch (e) {
                        console.log('原始响应:', data);
                    }
                    reject(new Error(`HTTP ${res.statusCode}`));
                } else {
                    console.log('✅ 请求成功');
                    try {
                        const releaseData = JSON.parse(data);
                        console.log(`最新版本: ${releaseData.tag_name}`);
                        console.log(`发布时间: ${releaseData.published_at}`);
                        console.log(`资源数量: ${releaseData.assets.length}`);
                        
                        // 查找 Windows 资源
                        const windowsAsset = releaseData.assets.find(asset => 
                            asset.name.toLowerCase().includes('win') || 
                            asset.name.endsWith('.exe') || 
                            asset.name.endsWith('.zip')
                        );
                        
                        if (windowsAsset) {
                            console.log(`Windows 资源: ${windowsAsset.name}`);
                            console.log(`下载链接: ${windowsAsset.browser_download_url}`);
                        } else {
                            console.log('⚠️  未找到 Windows 资源');
                        }
                        
                        resolve(releaseData);
                    } catch (e) {
                        console.log('❌ JSON 解析失败');
                        reject(e);
                    }
                }
            });
        });
        
        request.on('error', (error) => {
            console.log('❌ 网络错误:', error.message);
            reject(error);
        });
        
        request.setTimeout(10000, () => {
            request.destroy();
            console.log('❌ 请求超时');
            reject(new Error('Request timeout'));
        });
    });
}

// 运行测试
async function runTests() {
    console.log('🚀 开始测试 GitHub API 代理功能\n');
    console.log('=' * 50);
    
    let successCount = 0;
    let totalCount = testConfigs.length;
    
    for (const config of testConfigs) {
        try {
            await testGitHubAPI(config.username, config.repo);
            successCount++;
        } catch (error) {
            console.log(`❌ ${config.name} 测试失败: ${error.message}`);
        }
        console.log('-'.repeat(50));
    }
    
    console.log(`\n📊 测试结果: ${successCount}/${totalCount} 成功`);
    
    if (successCount === totalCount) {
        console.log('🎉 所有测试通过！GitHub API 代理功能正常');
    } else if (successCount > 0) {
        console.log('⚠️  部分测试通过，请检查失败的仓库');
    } else {
        console.log('❌ 所有测试失败，请检查配置');
        console.log('\n💡 建议:');
        console.log('1. 检查仓库名称是否正确');
        console.log('2. 设置 GITHUB_TOKEN 环境变量');
        console.log('3. 检查网络连接');
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = { testGitHubAPI, runTests };
