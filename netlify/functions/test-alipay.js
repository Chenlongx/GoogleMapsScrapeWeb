// 测试 alipay-sdk 导入
exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // 测试不同的导入方式
        let alipaySdk;
        let importMethod = '';
        
        try {
            alipaySdk = require('alipay-sdk').default;
            importMethod = 'require("alipay-sdk").default';
        } catch (e1) {
            try {
                alipaySdk = require('alipay-sdk');
                importMethod = 'require("alipay-sdk")';
            } catch (e2) {
                try {
                    const { AlipaySdk } = require('alipay-sdk');
                    alipaySdk = AlipaySdk;
                    importMethod = 'const { AlipaySdk } = require("alipay-sdk")';
                } catch (e3) {
                    throw new Error('All import methods failed');
                }
            }
        }

        // 检查是否是构造函数
        const isConstructor = typeof alipaySdk === 'function';
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                importMethod,
                isConstructor,
                alipaySdkType: typeof alipaySdk,
                message: 'AlipaySdk import test successful'
            })
        };

    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message,
                message: 'AlipaySdk import test failed'
            })
        };
    }
};
