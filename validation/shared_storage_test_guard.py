"""Keep historical browser checks from writing to the real shared travel file."""
import json,urllib.request,urllib.error
from pathlib import Path

def check_storage(base,allow_shared=False):
 if not allow_shared:raise SystemExit('该历史用例仅作留档；当前版本请运行 validation/phase4b_shared_flow.py，避免修改个人资料。')
 try:
  with urllib.request.urlopen(base.rstrip('/')+'/api/footprint/status',timeout=5) as response:info=json.load(response)
 except (urllib.error.URLError,ValueError):raise SystemExit('共享资料服务未连接，无法确认测试隔离目录；未执行写入。')
 if not isinstance(info,dict) or 'file' not in info:raise SystemExit('无法确认共享资料位置，未执行写入。')
 expected=Path(__file__).resolve().parent/'shared-storage'
 if not Path(info['file']).resolve().is_relative_to(expected):raise SystemExit('生产验证只允许 validation/shared-storage 下的隔离数据库；请设置 METRO_DATA_DIR，禁止使用个人资料。')
