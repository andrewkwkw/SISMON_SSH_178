import re

with open('static/js/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix colspan
content = content.replace('colspan="7"', 'colspan="6"')

# Remove the reason td
pattern = re.compile(r'<td class="px-4 py-3 text-textMuted text-\[11px\] truncate max-w-xs" title="\$\{log\.reason\}">\$\{log\.reason\}</td>\n', re.MULTILINE)
content = pattern.sub('', content)

with open('static/js/main.js', 'w', encoding='utf-8') as f:
    f.write(content)
