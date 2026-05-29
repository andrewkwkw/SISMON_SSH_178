import re

with open('app.py', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = re.compile(r'trend_anomaly_data = \[r\[\'z_score\'\] for r in results_sorted\[:15\]\]', re.DOTALL)
match = pattern.search(content)
if match:
    old_code = match.group(0)
    new_code = '''trend_anomaly_data = [r['z_score'] for r in results_sorted[:15]]
    trend_if_data = [r['if_label'] for r in results_sorted[:15]]'''
    content = content.replace(old_code, new_code)

pattern2 = re.compile(r'\"chart_zscore\": trend_anomaly_data,', re.DOTALL)
match2 = pattern2.search(content)
if match2:
    old_code2 = match2.group(0)
    new_code2 = '''"chart_zscore": trend_anomaly_data,
        "chart_if": trend_if_data,'''
    content = content.replace(old_code2, new_code2)

with open('app.py', 'w', encoding='utf-8') as f:
    f.write(content)
