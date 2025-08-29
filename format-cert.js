const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 创建 readline 接口用于命令行交互
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * 根据文件名推荐一个环境变量名
 * @param {string} fileName - 文件名
 * @returns {string} 推荐的环境变量名
 */
function getVariableName(fileName) {
  const lowerCaseName = fileName.toLowerCase();
  if (lowerCaseName.includes('appcertpublickey')) {
    return 'ALIPAY_APP_CERT_CONTENT';
  }
  if (lowerCaseName.includes('alipaycertpublickey')) {
    return 'ALIPAY_CERT_PUBLIC_KEY_CONTENT';
  }
  if (lowerCaseName.includes('alipayrootcert')) {
    return 'ALIPAY_ROOT_CERT_CONTENT';
  }
  // 如果是私钥文件
  if (lowerCaseName.includes('private_key')) {
    return 'ALIPAY_PRIVATE_KEY';
  }
  // 默认值
  return 'YOUR_CERT_CONTENT';
}

/**
 * 处理单个文件
 * @param {string} filePath - 用户输入的文件路径
 */
function processFile(filePath) {
  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    console.error(`\n❌ 错误：找不到文件 "${filePath}"。请检查路径是否正确或将文件拖拽到窗口中。\n`);
    return;
  }

  try {
    // 同步读取文件内容
    const content = fs.readFileSync(filePath, 'utf8');

    // 替换所有换行符 (CRLF 和 LF) 为 '\\n'
    const formattedContent = content.trim().split(/\r?\n/).join('\\n');
    
    // 获取推荐的变量名
    const varName = getVariableName(path.basename(filePath));

    // 打印最终结果
    console.log('\n✅ 转换成功！请复制下面====================内的整行内容到你的 .env 文件中：\n');
    console.log('================================================================');
    console.log(`${varName}="${formattedContent}"`);
    console.log('================================================================\n');

  } catch (error) {
    console.error(`\n❌ 处理文件时出错: ${error.message}\n`);
  }
}

/**
 * 主函数，用于提示用户输入
 */
function promptUser() {
  rl.question('👉 请输入证书文件路径 (或直接将文件拖拽到此)，然后按回车 (输入 "exit" 退出): ', (filePath) => {
    // 清理路径字符串，移除可能由拖拽产生的引号和空格
    const trimmedPath = filePath.trim().replace(/^['"]|['"]$/g, '');

    if (trimmedPath.toLowerCase() === 'exit') {
      rl.close();
      return;
    }

    if (trimmedPath) {
      processFile(trimmedPath);
    }

    // 再次调用，实现循环提示
    promptUser();
  });
}

// 脚本启动
console.log('--- 证书/密钥 .env 格式转换工具 ---');
console.log('本工具将文件内容转换为适合 .env 使用的单行字符串。\n');
promptUser();

// 监听关闭事件
rl.on('close', () => {
  console.log('\n👋 感谢使用！再见。');
  process.exit(0);
});