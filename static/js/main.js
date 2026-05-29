        // Chart Config
        Chart.defaults.color = '#94A3B8';
        Chart.defaults.font.family = 'Outfit';
        Chart.defaults.scale.grid.color = 'rgba(255, 255, 255, 0.05)';

        let chart1 = null;
        let chart2 = null;
        let currentTab = 'analysis';
        let currentRawLogs = [];
        let currentAnalysisLogs = [];
        let filteredAnalysisLogs = [];
        let currentPage = 1;
        const rowsPerPage = 50;

        let currentTopUsers = [];
        let filteredTopUsers = [];
        let currentTopUserPage = 1;
        const topUserRowsPerPage = 50;

        let liveTailInterval = null;
        let isLiveTailActive = false;

        
        let perfInterval = null;
        function setupPerformanceStream() {
            if(perfInterval) clearInterval(perfInterval);
            
            perfInterval = setInterval(() => {
                fetch('/api/performance')
                .then(res => res.json())
                .then(data => {
                    document.getElementById('perf-cpu').textContent = data.cpu_percent.toFixed(1);
                    document.getElementById('perf-cpu-bar').style.width = data.cpu_percent + '%';
                    
                    document.getElementById('perf-ram').textContent = data.ram_percent.toFixed(1);
                    document.getElementById('perf-ram-bar').style.width = data.ram_percent + '%';
                    
                    document.getElementById('perf-latency').textContent = data.latency_ms;
                })
                .catch(err => console.error("Performance stream error", err));
            }, 1000);
        }

        document.addEventListener('DOMContentLoaded', () => {
            setupLiveStream();

            // Search listener untuk Top Target User
            document.getElementById('search-topuser').addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                filteredTopUsers = currentTopUsers.filter(u => u.username.toLowerCase().includes(query));
                currentTopUserPage = 1;
                renderTopUsersTable();
            });
        });

        
        let eventSource = null;

        function fetchActiveData() {
            // Disabled manual fetch, managed by SSE
            const icon = document.getElementById('refresh-icon');
            icon.classList.add('fa-spin');
            setTimeout(() => icon.classList.remove('fa-spin'), 500);
        }

        function switchTab(tab) {
            currentTab = tab;
            const btnAnalysis = document.getElementById('tab-analysis');
            const btnTopuser = document.getElementById('tab-topuser');
            const btnLivelog = document.getElementById('tab-livelog');
            const btnRawdata = document.getElementById('tab-rawdata');
            
            const pageAnalysis = document.getElementById('page-analysis');
            const pageTopuser = document.getElementById('page-topuser');
            const pageLivelog = document.getElementById('page-livelog');
            const pageRawdata = document.getElementById('page-rawdata');
            
            const headerTitle = document.getElementById('header-title');
            const headerSubtitle = document.getElementById('header-subtitle');

            const activeClass = "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-primary/10 text-primary font-semibold border border-primary/20 transition-all shadow-[inset_4px_0_0_0_#3B82F6]";
            const inactiveClass = "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-transparent text-textMuted hover:text-white hover:bg-gray-800/50 font-medium border border-transparent transition-all";

            // Reset all buttons and pages
            btnAnalysis.className = inactiveClass;
            btnTopuser.className = inactiveClass;
            btnLivelog.className = inactiveClass;
            btnRawdata.className = inactiveClass;
            
            pageAnalysis.classList.add('hidden');
            pageTopuser.classList.add('hidden');
            pageLivelog.classList.add('hidden');
            pageRawdata.classList.add('hidden');

            if (tab === 'analysis') {
                btnAnalysis.className = activeClass;
                pageAnalysis.classList.remove('hidden');
                headerTitle.textContent = "Hasil Analisis Algoritma";
                headerSubtitle.textContent = "Pemantauan log otentikasi secara real-time";
                
            } else if (tab === 'topuser') {
                btnTopuser.className = activeClass;
                pageTopuser.classList.remove('hidden');
                headerTitle.textContent = "Target Username";
                headerSubtitle.textContent = "Analisis username paling diincar peretas";

            } else if (tab === 'livelog') {
                btnLivelog.className = activeClass;
                pageLivelog.classList.remove('hidden');
                headerTitle.textContent = "Log Aktivitas";
                headerSubtitle.textContent = "Rekapan login berhasil dan gagal terbaru";
                
            } else if (tab === 'rawdata') {
                btnRawdata.className = activeClass;
                pageRawdata.classList.remove('hidden');
                headerTitle.textContent = "Data Mentah";
                headerSubtitle.textContent = "Penelusuran full text file log";
            }
        }

        function toggleLoading(show, text = 'Memuat Data...') {
            const loading = document.getElementById('loading-state');
            const pages = document.querySelectorAll('#page-analysis, #page-topuser, #page-livelog, #page-rawdata');
            document.getElementById('loading-text').textContent = text;
            
            if (show) {
                loading.classList.remove('hidden');
                pages.forEach(p => p.classList.add('hidden'));
            } else {
                loading.classList.add('hidden');
                document.getElementById('page-' + currentTab).classList.remove('hidden');
            }
        }

        function setupLiveStream() {
            toggleLoading(true, 'Menghubungkan ke Live Stream AI...');
            if(eventSource) eventSource.close();
            
            eventSource = new EventSource('/api/stream');
            
            eventSource.onmessage = function(e) {
                const data = JSON.parse(e.data);
                toggleLoading(false);
                
                // UPDATE ANALYSIS
                const analysis = data.analysis;
                if (analysis && analysis.logs) {
                    const totalEvents = analysis.logs.reduce((acc, log) => acc + log.failed_count, 0);
                    document.getElementById('kpi-total').textContent = totalEvents.toLocaleString();
                    document.getElementById('kpi-unique').textContent = analysis.summary.total_ips.toLocaleString();
                    document.getElementById('kpi-critical').textContent = (analysis.summary.critical + analysis.summary.warning).toLocaleString();
                    document.getElementById('stat-peak-z').textContent = analysis.peak_zscore_ip;

                    currentAnalysisLogs = analysis.logs;
                    filteredAnalysisLogs = currentAnalysisLogs;
                    
                    currentTopUsers = analysis.top_users || [];
                    filteredTopUsers = currentTopUsers;

                    renderAnalysisTable();
                    renderTopUsersTable();
                    
                    if (chart1 && chart2) {
                        chart1.data.labels = analysis.chart_labels;
                        chart1.data.datasets[0].data = analysis.chart_failed;
                        chart1.update();
                        renderProportionChart(analysis.summary);
                    } else {
                        renderCharts(currentAnalysisLogs, analysis.summary);
                    }
                }
                
                // UPDATE LIVELOG
                const livelog = data.livelog;
                if (livelog && livelog.success_logs) {
                    currentRawLogs = livelog.raw_logs || [];
                    document.getElementById('log-success').innerHTML = livelog.success_logs.join('<br>') || 'Tidak ada data.';
                    document.getElementById('log-failed').innerHTML = livelog.failed_logs.join('<br>') || 'Tidak ada data.';
                    
                    const query = document.getElementById('log-search')?.value.toLowerCase() || '';
                    if(query === '') {
                        document.getElementById('log-raw').innerHTML = currentRawLogs.join('');
                    } else {
                        const filtered = currentRawLogs.filter(line => line.toLowerCase().includes(query));
                        document.getElementById('log-raw').innerHTML = filtered.length > 0 ? filtered.join('') : '<span class="text-gray-500">Log tidak ditemukan.</span>';
                    }
                }
            };
            
            eventSource.onerror = function(e) {
                console.error("SSE Connection Error", e);
                // toggleLoading(true, 'Koneksi terputus. Mencoba menghubungkan kembali...');
            };
        }

function filterAnalysisLogs() {
            const query = document.getElementById('search-analysis').value.toLowerCase();
            if(query === '') {
                filteredAnalysisLogs = currentAnalysisLogs;
            } else {
                filteredAnalysisLogs = currentAnalysisLogs.filter(log => 
                    log.ip.toLowerCase().includes(query) || 
                    log.severity.toLowerCase().includes(query) || 
                    log.reason.toLowerCase().includes(query) ||
                    (log.time_window && log.time_window.toLowerCase().includes(query))
                );
            }
            currentPage = 1; // Reset ke halaman pertama saat mencari
            renderAnalysisTable();
        }
