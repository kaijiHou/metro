"""Small stdlib-only check for the source HTML table span conversion."""
import importlib.util
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('wuhan_service_parser',root/'scripts/update-wuhan-service.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
parser=module.Tables()
parser.feed('<table><tr><th rowspan="2">站名</th><th colspan="2">上行</th></tr><tr><th>首班</th><th>末班</th></tr><tr><td><p>甲站</p></td><td>6:03</td><td>00:14（到达）</td></tr></table>')
assert parser.tables==[[['站名','上行','上行'],['站名','首班','末班'],['甲站','6:03','00:14（到达）']]]
print('PASS source rowspan/colspan, cell text and terminal arrival preservation')
