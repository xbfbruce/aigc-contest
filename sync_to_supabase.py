#!/usr/bin/env python3
"""
自动同步选手数据到Supabase数据库
使用前请确保已安装supabase库: pip install supabase
"""

import json
from supabase import create_client, Client

# Supabase配置
SUPABASE_URL = 'https://pqchakbrsatzxepypkyo.supabase.co'
SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxY2hha2Jyc2F0enhlcHlwa3lvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NTg5MTQsImV4cCI6MjEwODAzNDkxNH0.Zn38gYyaRGfiGnk9AVeCFxBa0VmqXIXuJq_3MTHGOhU'

def sync_contestants():
    """同步选手数据到Supabase"""
    
    # 初始化Supabase客户端
    print("🔌 连接Supabase...")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
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
            result = supabase.table('contestants').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
            print(f"✅ 已清空现有数据\n")
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
            # 准备数据（只插入name和school，group保存在本地JSON中）
            insert_data = {
                'name': contestant['name'],
                'school': contestant['school']
            }
            
            # 插入数据
            result = supabase.table('contestants').insert(insert_data).execute()
            
            if result.data:
                success_count += 1
                print(f"  [{i}/{len(contestants)}] ✅ {contestant['name']} - {contestant['school']}")
            else:
                failed_count += 1
                failed_contestant.append(contestant['name'])
                print(f"  [{i}/{len(contestants)}] ❌ {contestant['name']} - 插入失败")
                
        except Exception as e:
            failed_count += 1
            failed_contestants.append(contestant['name'])
            print(f"  [{i}/{len(contestants)}] ❌ {contestant['name']} - 错误: {str(e)[:50]}")
    
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
        result = supabase.table('contestants').select('count').execute()
        total_in_db = len(result.data) if result.data else 0
        print(f"✅ 数据库中现有 {total_in_db} 条选手记录")
        
        # 显示部分数据示例
        sample_result = supabase.table('contestants').select('*').limit(5).execute()
        if sample_result.data:
            print("\n📋 数据示例（前5条）:")
            for row in sample_result.data:
                print(f"  - {row.get('name')} | {row.get('school')}")
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
