#!/usr/bin/env python3
"""
使用内置urllib同步选手数据到Supabase（无需安装任何第三方库）
"""

import json
import urllib.request
import urllib.error

# Supabase配置
SUPABASE_URL = 'https://pqchakbrsatzxepypkyo.supabase.co'
SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxY2hha2Jyc2F0enhlcHlwa3lvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NTg5MTQsImV4cCI6MjEwODAzNDkxNH0.Zn38gYyaRGfiGnk9AVeCFxBa0VmqXIXuJq_3MTHGOhU'

def sync_contestants():
    """同步选手数据到Supabase"""
    
    print("🔌 连接Supabase...")
    headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }
    print("✅ Supabase连接成功\n")
    
    # 读取选手数据
    print("📖 读取选手数据...")
    with open('contestants.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    contestants = data['contestants']
    print(f"✅ 读取到 {len(contestants)} 名选手\n")
    
    # 询问是否清空现有数据
    print("⚠️  警告: 此操作将插入所有选手数据")
    clear_existing = input("是否先清空现有选手数据? (yes/no, 默认no): ").strip().lower()
    
    if clear_existing == 'yes':
        print("🗑️  正在清空现有选手数据...")
        try:
            url = f'{SUPABASE_URL}/rest/v1/contestants'
            req = urllib.request.Request(url, method='DELETE', headers=headers)
            with urllib.request.urlopen(req) as response:
                if response.status == 204:
                    print("✅ 已清空现有数据\n")
                else:
                    print(f"❌ 清空失败: HTTP {response.status}\n")
        except Exception as e:
            print(f"❌ 清空失败: {e}")
            print("继续尝试插入新数据...\n")
    
    # 批量插入选手数据
    print("📤 开始插入选手数据...")
    success_count = 0
    failed_count = 0
    failed_contestants = []
    
    for i, contestant in enumerate(contestants, 1):
        try:
            # 准备数据
            insert_data = json.dumps({
                'name': contestant['name'],
                'school': contestant['school']
            }).encode('utf-8')
            
            # 发送POST请求
            url = f'{SUPABASE_URL}/rest/v1/contestants'
            req = urllib.request.Request(
                url,
                data=insert_data,
                headers=headers,
                method='POST'
            )
            
            with urllib.request.urlopen(req) as response:
                if response.status in [200, 201]:
                    success_count += 1
                    print(f"  [{i}/{len(contestants)}] ✅ {contestant['name']} - {contestant['school']}")
                else:
                    failed_count += 1
                    failed_contestants.append(contestant['name'])
                    print(f"  [{i}/{len(contestants)}] ❌ {contestant['name']} - HTTP {response.status}")
                
        except urllib.error.HTTPError as e:
            failed_count += 1
            failed_contestants.append(contestant['name'])
            error_body = e.read().decode('utf-8')[:100]
            print(f"  [{i}/{len(contestants)}] ❌ {contestant['name']} - HTTP {e.code}: {error_body}")
        except Exception as e:
            failed_count += 1
            failed_contestants.append(contestant['name'])
            error_msg = str(e)[:50]
            print(f"  [{i}/{len(contestants)}] ❌ {contestant['name']} - 错误: {error_msg}")
    
    # 打印统计结果
    print("\n" + "="*60)
    print("📊 同步完成统计:")
    print("="*60)
    print(f"  总人数: {len(contestants)}")
    print(f"  ✅ 成功: {success_count}")
    print(f"  ❌ 失败: {failed_count}")
    
    if failed_contestants:
        print(f"\n⚠️  失败的选手:")
        for name in failed_contestants:
            print(f"    - {name}")
    
    # 验证数据
    print("\n🔍 验证数据库中的数据...")
    try:
        url = f'{SUPABASE_URL}/rest/v1/contestants?select=*&limit=5'
        req = urllib.request.Request(url, headers=headers)
        
        with urllib.request.urlopen(req) as response:
            if response.status == 200:
                sample_data = json.loads(response.read().decode('utf-8'))
                print(f"✅ 成功获取数据示例（前5条）:")
                for row in sample_data:
                    print(f"  - {row.get('name')} | {row.get('school')}")
                
                # 获取总数
                url_count = f'{SUPABASE_URL}/rest/v1/contestants?select=*&limit=1'
                req_count = urllib.request.Request(url_count, headers={**headers, 'Prefer': 'count=exact'})
                with urllib.request.urlopen(req_count) as resp_count:
                    content_range = resp_count.headers.get('Content-Range', '')
                    if content_range and '/' in content_range:
                        total = content_range.split('/')[-1]
                        print(f"\n✅ 数据库中总共有 {total} 条选手记录")
            else:
                print(f"❌ 验证失败: HTTP {response.status}")
    except Exception as e:
        print(f"❌ 验证失败: {e}")
    
    print("\n💡 提示:")
    print("  - 组别信息保存在 contestants.json 中")
    print("  - 作品提交时会自动从JSON中读取组别并保存到works表的group_name字段")
    print("  - 如需查看完整信息，请使用: cat contestants.json | python3 -m json.tool")

if __name__ == '__main__':
    try:
        sync_contestants()
    except KeyboardInterrupt:
        print("\n\n⚠️  用户中断同步")
    except Exception as e:
        print(f"\n❌ 同步失败: {e}")
        import traceback
        traceback.print_exc()
