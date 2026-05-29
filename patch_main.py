import re

with open('static/js/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update renderCharts to replace proportion chart with IF chart
pattern_charts = re.compile(r'renderProportionChart\(summary\);\n        }', re.DOTALL)
match = pattern_charts.search(content)
if match:
    old_charts = match.group(0)
    new_charts = '''// CHART 2: ISOLATION FOREST
            if(chart2) chart2.destroy();
            const ctx2 = document.getElementById('chartIsolationForest').getContext('2d');
            
            const ifData = summary.chart_if || [];
            // Buat titik-titik (Scatter/Line) untuk IF Output
            chart2 = new Chart(ctx2, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Isolation Forest Output',
                        data: ifData,
                        borderColor: '#10B981', // Hijau default
                        backgroundColor: '#10B981',
                        borderWidth: 2,
                        pointRadius: 5,
                        pointBackgroundColor: function(context) {
                            const index = context.dataIndex;
                            const value = context.dataset.data[index];
                            return value === -1 ? '#EF4444' : '#10B981'; // Merah jika Anomaly
                        },
                        pointBorderColor: 'transparent',
                        showLine: false // Scatter look
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            min: -1.5,
                            max: 1.5,
                            ticks: {
                                stepSize: 1,
                                callback: function(value) {
                                    if(value === -1) return '-1 (Anomaly)';
                                    if(value === 1) return '1 (Normal)';
                                    return '';
                                }
                            }
                        }
                    },
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
        }'''
    content = content.replace(old_charts, new_charts)

# 2. Add Search Filter Functions and fix Livelog rendering
pattern_filter = re.compile(r'function filterLogs\(\) \{.*?\}', re.DOTALL)
# Actually, wait, ilterLogs is totally missing from main.js currently.
# So I should just append them to the end of the file.

filters_script = '''

// =====================================
// SEARCH / FILTER FUNCTIONS
// =====================================

function filterAnalysisLogs() {
    const query = document.getElementById('search-analysis').value.toLowerCase();
    filteredAnalysisLogs = currentAnalysisLogs.filter(log => {
        return log.ip.toLowerCase().includes(query) || 
               log.reason.toLowerCase().includes(query) ||
               log.time_window.toLowerCase().includes(query);
    });
    currentPage = 1;
    renderAnalysisTable();
}

function filterSuccessLogs() {
    const query = document.getElementById('search-success').value.toLowerCase();
    const filtered = currentSuccessLogs.filter(log => log.toLowerCase().includes(query));
    document.getElementById('log-success').innerHTML = filtered.join('<br>') || 'Tidak ada data matching.';
}

function filterFailedLogs() {
    const query = document.getElementById('search-failed').value.toLowerCase();
    const filtered = currentFailedLogs.filter(log => log.toLowerCase().includes(query));
    document.getElementById('log-failed').innerHTML = filtered.join('<br>') || 'Tidak ada data matching.';
}

function filterLogs() { // For Raw Data
    const query = document.getElementById('log-search').value.toLowerCase();
    const filtered = currentRawLogs.filter(log => log.toLowerCase().includes(query));
    document.getElementById('log-raw').innerHTML = filtered.join('') || 'Tidak ada data matching.';
}
'''

content += filters_script

# 3. Also I need to remove enderProportionChart function entirely since we don't need it.
pattern_prop = re.compile(r'function renderProportionChart\(summary\) \{.*?(?=function changePage)', re.DOTALL)
match_prop = pattern_prop.search(content)
if match_prop:
    content = content.replace(match_prop.group(0), '')

# 4. Modify fetchLiveLogData or setupLiveStream to update chart2 and Livelog raw correctly
# Wait, fetchLiveLogData is not used in SSE. The SSE handles it in setupLiveStream.
# Let's see setupLiveStream! Oh wait, etchLiveLogData IS there! But we have setupLiveStream()?
# Yes, setupLiveStream() parses data.livelog. Let me check if data.analysis.chart_if is available.
# Wait, I didn't inject summary.chart_if in pp.py... I injected LATEST_ANALYSIS["chart_if"]. So it's data.analysis.chart_if.
# In main.js, enderCharts takes (logs, summary). In setupLiveStream, it calls enderCharts(data.analysis.logs, data.analysis).
# So summary inside enderCharts is actually data.analysis. Therefore summary.chart_if works!

with open('static/js/main.js', 'w', encoding='utf-8') as f:
    f.write(content)
