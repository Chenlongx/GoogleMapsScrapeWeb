# 定期账号验证接口 - 使用文档

## 接口信息

**端点**: `/.netlify/functions/check-account-status`  
**方法**: `POST`  
**用途**: 定期验证账号状态，防止客户端时间作弊

---

## 请求参数

```json
{
  "user_id": "faa57215-f056-47dd-8a6e-98d06513a68e",  // 可选，用户ID
  "username": "test@example.com"                      // 可选，用户名（二选一）
}
```

**必须提供 `user_id` 或 `username` 之一**

---

## 响应示例

### ✅ 成功 - 账号正常

```json
{
  "success": true,
  "message": "账号状态正常",
  "serverTime": "2025-11-21T03:31:00.000Z",
  "timestamp": 1732157460000,
  "user": {
    "id": "faa57215-f056-47dd-8a6e-98d06513a68e",
    "username": "test@example.com",
    "userType": "regular",
    "expiryAt": "2025-12-31T00:00:00.000Z",
    "daysRemaining": 40,
    "status": "active",
    "deviceCode": "263f108f...",
    "osType": "Windows",
    "trial_search_used": true,
    "daily_export_count": 5,
    "is_ai_authorized": true,
    "ai_tokens_remaining": 1000
  }
}
```

### ❌ 失败 - 账号过期

```json
{
  "success": false,
  "message": "账号已过期，请续费",
  "expiryAt": "2025-01-01T00:00:00.000Z",
  "serverTime": "2025-11-21T03:31:00.000Z",
  "shouldLogout": true,
  "isExpired": true
}
```

### ❌ 失败 - 账号不存在

```json
{
  "success": false,
  "message": "账号不存在",
  "serverTime": "2025-11-21T03:31:00.000Z",
  "shouldLogout": true
}
```

---

## Python 客户端调用示例

### 方法1：同步调用（简单）

```python
import requests
from datetime import datetime

def check_account_status(user_id=None, username=None):
    """检查账号状态"""
    url = "https://mediamingle.cn/.netlify/functions/check-account-status"
    
    payload = {}
    if user_id:
        payload['user_id'] = user_id
    elif username:
        payload['username'] = username
    else:
        return None, "缺少user_id或username参数"
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        data = response.json()
        
        if response.status_code == 200 and data.get('success'):
            return True, data
        else:
            return False, data.get('message', '验证失败')
            
    except Exception as e:
        return False, f"网络错误: {str(e)}"

# 使用示例
success, result = check_account_status(user_id="your-user-id")
if success:
    print(f"✅ 账号正常，剩余 {result['user']['daysRemaining']} 天")
    print(f"📅 服务器时间: {result['serverTime']}")
else:
    print(f"❌ 验证失败: {result}")
```

### 方法2：定时器调用（推荐用于Maps_scraper.py）

```python
from PyQt5.QtCore import QTimer
import requests

class GoogleMapsApp:
    def __init__(self):
        # ... 其他初始化代码 ...
        
        # 初始化账号验证定时器（每2小时验证一次）
        self.account_check_timer = QTimer()
        self.account_check_timer.timeout.connect(self.check_account_status_periodic)
        self.account_check_timer.start(7200000)  # 2小时 = 7,200,000毫秒
        
        # 立即执行一次验证
        self.check_account_status_periodic()
    
    def check_account_status_periodic(self):
        """定期检查账号状态"""
        if not hasattr(self, 'user_id'):
            return
        
        print("🔍 [定期验证] 正在检查账号状态...")
        
        url = "https://mediamingle.cn/.netlify/functions/check-account-status"
        payload = {"user_id": self.user_id}
        
        try:
            response = requests.post(url, json=payload, timeout=10)
            data = response.json()
            
            if response.status_code == 200 and data.get('success'):
                print(f"✅ [定期验证] 账号正常，剩余 {data['user']['daysRemaining']} 天")
                
                # 可选：同步服务器时间到本地
                server_time = data.get('serverTime')
                print(f"📅 [服务器时间] {server_time}")
                
            else:
                # 账号异常，强制退出
                should_logout = data.get('shouldLogout', False)
                if should_logout:
                    print(f"⚠️ [定期验证] {data.get('message')}")
                    self.force_logout()
                    
        except Exception as e:
            print(f"⚠️ [定期验证] 网络请求失败: {e}")
    
    def force_logout(self):
        """强制退出登录"""
        from PyQt5.QtWidgets import QMessageBox
        QMessageBox.warning(
            self,
            "账号验证失败",
            "您的账号状态异常或已过期，请重新登录。"
        )
        # 清除登录信息并退出
        self.close()
```

---

## 安全特性

1. ✅ **防时间作弊**: 使用服务器UTC时间验证，客户端无法篡改
2. ✅ **实时状态检查**: 检查账号是否被禁用、过期等
3. ✅ **多重验证**: 支持user_id和username两种查询方式
4. ✅ **数据完整性**: 返回完整的账号信息用于同步

---

## 集成到Maps_scraper.py

在 `Maps_scraper.py` 的 `__init__` 方法中添加以下代码（约5000-5500行附近）：

```python
# 【安全增强】初始化定期账号验证
self.account_check_timer = QTimer()
self.account_check_timer.timeout.connect(self.check_account_status_periodic)
self.account_check_timer.start(7200000)  # 每2小时验证一次
QTimer.singleShot(5000, self.check_account_status_periodic)  # 启动5秒后首次验证
```

---

## 部署说明

1. 将 `check-account-status.js` 放到 `netlify/functions/` 目录
2. 确保环境变量配置正确：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. 推送到GitHub，Netlify会自动部署
4. 测试接口：`https://你的域名/.netlify/functions/check-account-status`
