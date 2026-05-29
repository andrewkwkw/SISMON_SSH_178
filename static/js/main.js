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

        function changePage(direction) {
            currentPage += direction;
            renderAnalysisTable();
        }

        function renderAnalysisTable() {
            const tbody = document.getElementById('analysis-table');
            
            if(filteredAnalysisLogs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-textMuted">Data tidak ditemukan.</td></tr>`;
                document.getElementById('pagination-info').textContent = 'Tidak ada data';
                document.getElementById('btn-prev').disabled = true;
                document.getElementById('btn-next').disabled = true;
                return;
            }
            
            const totalRows = filteredAnalysisLogs.length;
            const totalPages = Math.ceil(totalRows / rowsPerPage);
            
            if(currentPage < 1) currentPage = 1;
            if(currentPage > totalPages) currentPage = totalPages;
            
            const startIndex = (currentPage - 1) * rowsPerPage;
            const endIndex = Math.min(startIndex + rowsPerPage, totalRows);
            const paginatedLogs = filteredAnalysisLogs.slice(startIndex, endIndex);
            
            let rows = '';
            paginatedLogs.forEach(log => {
                let sevBadge = '';
                if(log.severity === 'CRITICAL') sevBadge = '<span class="text-critical font-semibold">CRITICAL</span>';
                else if (log.severity === 'WARNING') sevBadge = '<span class="text-warning font-semibold">WARNING</span>';
                else sevBadge = '<span class="text-normal font-semibold">NORMAL</span>';

                let ifBadge = log.if_label === -1 ? '<span class="text-critical font-mono font-bold">-1</span>' : '<span class="text-textMuted font-mono">1</span>';

                rows += `
                    <tr class="hover:bg-panel transition-colors border-b border-borderWazuh last:border-0">
                        <td class="px-4 py-3 text-textMuted font-mono text-[11px]">${log.time_window || '-'}</td>
                        <td class="px-4 py-3 text-primary font-medium cursor-pointer hover:underline">${log.ip}</td>
                        <td class="px-4 py-3 font-mono text-textMain">${log.failed_count}</td>
                        <td class="px-4 py-3 font-mono text-textMuted">${log.z_score}</td>
                        <td class="px-4 py-3">${ifBadge}</td>
                        <td class="px-4 py-3 text-[11px]">${sevBadge}</td>
                        <td class="px-4 py-3 text-textMuted text-[11px] truncate max-w-xs" title="${log.reason}">${log.reason}</td>
                    </tr>
                `;
            });
            tbody.innerHTML = rows;

            document.getElementById('pagination-info').textContent = `Menampilkan ${startIndex + 1}-${endIndex} dari ${totalRows} data (Hal ${currentPage}/${totalPages})`;
            document.getElementById('btn-prev').disabled = (currentPage === 1);
            document.getElementById('btn-next').disabled = (currentPage === totalPages);
        }

        function prevTopUserPage() {
            if(currentTopUserPage > 1) {
                currentTopUserPage--;
                renderTopUsersTable();
            }
        }

        function nextTopUserPage() {
            const totalPages = Math.ceil(filteredTopUsers.length / topUserRowsPerPage);
            if(currentTopUserPage < totalPages) {
                currentTopUserPage++;
                renderTopUsersTable();
            }
        }

        function renderTopUsersTable() {
            const tbody = document.getElementById('topuser-table');
            if(!filteredTopUsers || filteredTopUsers.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" class="px-6 py-8 text-center text-textMuted">Data tidak ditemukan.</td></tr>`;
                document.getElementById('topuser-pagination-info').textContent = 'Tidak ada data';
                document.getElementById('btn-topuser-prev').disabled = true;
                document.getElementById('btn-topuser-next').disabled = true;
                return;
            }

            const totalRows = filteredTopUsers.length;
            const totalPages = Math.ceil(totalRows / topUserRowsPerPage);
            const startIndex = (currentTopUserPage - 1) * topUserRowsPerPage;
            const endIndex = Math.min(startIndex + topUserRowsPerPage, totalRows);
            const paginatedData = filteredTopUsers.slice(startIndex, endIndex);

            let rows = '';
            paginatedData.forEach((u, idx) => {
                let absoluteIdx = startIndex + idx;
                rows += `
                    <tr class="hover:bg-panel border-b border-borderWazuh last:border-0 transition-colors">
                        <td class="px-4 py-3 text-center text-textMuted">${absoluteIdx + 1}</td>
                        <td class="px-4 py-3 font-medium text-textMain">${u.username}</td>
                        <td class="px-4 py-3 font-mono text-textMuted">${u.count}</td>
                    </tr>
                `;
            });
            tbody.innerHTML = rows;
            
            document.getElementById('topuser-pagination-info').textContent = `Menampilkan ${startIndex + 1}-${endIndex} dari ${totalRows} data (Hal ${currentTopUserPage}/${totalPages})`;
            document.getElementById('btn-topuser-prev').disabled = (currentTopUserPage === 1);
            document.getElementById('btn-topuser-next').disabled = (currentTopUserPage === totalPages);
        }

        // Variable global untuk mencegah fetching berkali-kali jika data belum berubah
        let lastLiveLogFetch = 0;
        let currentSuccessLogs = [];
        let currentFailedLogs = [];
        
        function fetchLiveLogData() {
            // Hindari spam fetch jika pindah-pindah tab dengan cepat (cache frontend 5 detik)
            const now = Date.now();
            if(now - lastLiveLogFetch < 5000 && currentRawLogs.length > 0) {
                return Promise.resolve();
            }
            
            toggleLoading(true, 'Menarik data log terbaru...');
            return fetch('/api/livelog')
                .then(res => res.json())
                .then(data => {
                    if(data.error) { alert(data.error); return; }
                    
                    currentSuccessLogs = data.success_logs;
                    currentFailedLogs = data.failed_logs;
                    currentRawLogs = data.raw_logs;
                    
                    document.getElementById('log-success').innerHTML = currentSuccessLogs.join('<br>') || 'Tidak ada data.';
                    document.getElementById('log-failed').innerHTML = currentFailedLogs.join('<br>') || 'Tidak ada data.';
                    document.getElementById('log-raw').innerHTML = currentRawLogs.join('') || 'Tidak ada data.';
                    
                    lastLiveLogFetch = Date.now();
                })
                .finally(() => toggleLoading(false));
        }

        function renderCharts(logs, summary) {
            const top15 = logs.slice(0, 15);
            const labels = top15.map(r => `${r.ip}`);
            const zscoreData = top15.map(r => r.z_score);
            
            // Tentukan threshold Z-Score
            const THRESHOLD = 3.0;
            const maxZ = Math.max(...zscoreData, THRESHOLD + 1); // Pastikan Y axis selalu muat

            // Global Chart Style Overrides
            Chart.defaults.color = '#9CA3AF';
            Chart.defaults.font.family = "'Inter', sans-serif";
            Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(26, 29, 39, 0.9)';
            Chart.defaults.plugins.tooltip.titleColor = '#E0E0E0';
            Chart.defaults.plugins.tooltip.bodyColor = '#9CA3AF';
            Chart.defaults.plugins.tooltip.borderColor = '#343B4A';
            Chart.defaults.plugins.tooltip.borderWidth = 1;
            Chart.defaults.plugins.tooltip.padding = 12;
            Chart.defaults.plugins.tooltip.cornerRadius = 4;
            Chart.defaults.plugins.tooltip.displayColors = true;

            // CHART 1: Z-SCORE (Threshold Line Chart)
            if(chart1) chart1.destroy();
            const ctx1 = document.getElementById('chartZScore').getContext('2d');
            
            // Custom Plugin untuk menggambar Background Merah (Threshold Area)
            const thresholdAreaPlugin = {
                id: 'thresholdArea',
                beforeDraw: (chart) => {
                    const ctx = chart.canvas.getContext('2d');
                    const yAxis = chart.scales.y;
                    const xAxis = chart.scales.x;
                    
                    if (yAxis.max > THRESHOLD) {
                        const topY = yAxis.getPixelForValue(yAxis.max);
                        const bottomY = yAxis.getPixelForValue(THRESHOLD);
                        
                        ctx.save();
                        ctx.fillStyle = 'rgba(239, 68, 68, 0.05)'; // Merah sangat transparan
                        ctx.fillRect(xAxis.left, topY, xAxis.width, bottomY - topY);
                        
                        // Garis putus-putus merah
                        ctx.beginPath();
                        ctx.setLineDash([5, 5]);
                        ctx.moveTo(xAxis.left, bottomY);
                        ctx.lineTo(xAxis.right, bottomY);
                        ctx.lineWidth = 1;
                        ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
                        ctx.stroke();
                        ctx.restore();
                        
                        // Teks label
                        ctx.font = '10px Inter';
                        ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
                        ctx.textAlign = 'right';
                        ctx.fillText('Area Threshold Anomali > ' + THRESHOLD, xAxis.right - 5, bottomY - 5);
                    }
                }
            };
            
            function createGradient(context, isFill) {
                try {
                    const chart = context.chart;
                    const {ctx, chartArea, scales} = chart;
                    
                    // Fallback color during initial setup before chartArea is available
                    if (!chartArea || chartArea.bottom === chartArea.top) {
                        return isFill ? 'rgba(59, 130, 246, 0.2)' : '#3B82F6';
                    }
                    
                    const yAxis = scales.y;
                    if(!yAxis) return isFill ? 'rgba(59, 130, 246, 0.2)' : '#3B82F6';
                    
                    const thresholdPixel = yAxis.getPixelForValue(THRESHOLD);
                    if (isNaN(thresholdPixel)) return isFill ? 'rgba(59, 130, 246, 0.2)' : '#3B82F6';

                    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                    let offset = (thresholdPixel - chartArea.top) / (chartArea.bottom - chartArea.top);
                    offset = Math.max(0, Math.min(1, offset));
                    
                    if (isFill) {
                        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.5)'); // Merah atas
                        gradient.addColorStop(offset, 'rgba(239, 68, 68, 0.2)'); // Merah sampai threshold
                        gradient.addColorStop(offset, 'rgba(59, 130, 246, 0.4)'); // Biru mulai threshold
                        gradient.addColorStop(1, 'rgba(59, 130, 246, 0.05)'); // Biru pudar bawah
                    } else {
                        gradient.addColorStop(0, '#EF4444'); // Garis Merah atas
                        gradient.addColorStop(offset, '#EF4444');
                        gradient.addColorStop(offset, '#3B82F6'); // Garis Biru bawah
                        gradient.addColorStop(1, '#3B82F6');
                    }
                    return gradient;
                } catch (e) {
                    console.error("Gradient error", e);
                    return isFill ? 'rgba(59, 130, 246, 0.2)' : '#3B82F6';
                }
            }

            // Sanitasi data agar tidak ada 0 atau negatif (Logaritma tidak bisa 0)
            const safeZScoreData = zscoreData.map(val => Math.max(0.1, val));
            
            chart1 = new Chart(ctx1, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Z-Score',
                            data: safeZScoreData,
                            borderWidth: 2,
                            tension: 0.3, // Curve mulus seperti di referensi
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            fill: true, // Nyalakan fill area di bawah garis!
                            borderColor: function(context) { return createGradient(context, false); },
                            backgroundColor: function(context) { return createGradient(context, true); },
                            pointBackgroundColor: ctx => ctx.raw >= THRESHOLD ? '#EF4444' : '#3B82F6',
                            pointBorderColor: ctx => ctx.raw >= THRESHOLD ? '#EF4444' : '#3B82F6',
                        }
                    ]
                },
                plugins: [thresholdAreaPlugin],
                options: { 
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: { 
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                title: (items) => `Target: ${items[0].label}`,
                                label: (item) => `Z-Score: ${item.raw}`
                            }
                        }
                    },
                    scales: { 
                        x: { 
                            grid: { color: 'rgba(255,255,255,0.05)' },
                            ticks: { font: { size: 10 } }
                        },
                        y: { 
                            type: 'logarithmic',
                            min: 0.1,
                            max: maxZ,
                            title: { display: true, text: 'Z-Score (Log Scale)', color: '#9CA3AF', font: { size: 10 } },
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        }
                    }
                }
            });

            // CHART 2: CUSTOM HTML HORIZONTAL BAR (Proporsi Anomali vs Normal)
            const totalNormal = summary.normal;
            const totalAnomaly = summary.critical + summary.warning;
            const grandTotal = totalNormal + totalAnomaly;
            
            const pctNormal = grandTotal > 0 ? Math.round((totalNormal / grandTotal) * 100) : 0;
            const pctAnomaly = grandTotal > 0 ? Math.round((totalAnomaly / grandTotal) * 100) : 0;

            const htmlContainer = document.getElementById('custom-proportion-chart');
            htmlContainer.innerHTML = `
                <!-- Bar Anomali -->
                <div class="flex items-center gap-4">
                    <div class="w-24 text-right shrink-0">
                        <p class="text-sm font-medium text-textMain leading-tight">Anomali</p>
                        <p class="text-[10px] text-textMuted">(Merah)</p>
                    </div>
                    <div class="flex-1 border-l border-borderWazuh relative h-14 flex items-center">
                        <!-- Balok Merah -->
                        <div class="h-10 bg-[#FF5E5E] transition-all duration-1000 ease-out shadow-lg" style="width: ${Math.max(pctAnomaly, 2)}%;"></div>
                        <!-- Teks di dalam/luar balok -->
                        <div class="absolute inset-y-0 left-0 flex items-center pl-3 gap-6" style="left: ${Math.max(pctAnomaly, 2)}%;">
                            <span class="text-xl font-bold text-[#FF5E5E] whitespace-nowrap pl-4 drop-shadow-md">${totalAnomaly.toLocaleString()} EVENTS</span>
                            <span class="text-xl font-bold text-[#FF5E5E]/80 whitespace-nowrap">${pctAnomaly}%</span>
                        </div>
                    </div>
                </div>

                <!-- Bar Normal -->
                <div class="flex items-center gap-4">
                    <div class="w-24 text-right shrink-0">
                        <p class="text-sm font-medium text-textMain leading-tight">Normal</p>
                        <p class="text-[10px] text-textMuted">(Hijau)</p>
                    </div>
                    <div class="flex-1 border-l border-borderWazuh relative h-14 flex items-center">
                        <!-- Balok Hijau -->
                        <div class="h-10 bg-[#48C774] transition-all duration-1000 ease-out shadow-lg" style="width: ${Math.max(pctNormal, 2)}%;"></div>
                        <!-- Teks di dalam/luar balok -->
                        <div class="absolute inset-y-0 right-0 flex items-center pr-3 gap-6 w-full justify-end" style="right: ${100 - pctNormal}%; padding-right: 15px;">
                            <span class="text-xl font-bold text-dark whitespace-nowrap">${totalNormal.toLocaleString()} EVENTS</span>
                            <span class="text-xl font-bold text-dark/80 whitespace-nowrap">${pctNormal}%</span>
                        </div>
                    </div>
                </div>
                
                <!-- Legend Bawah -->
                <div class="mt-4 flex justify-center gap-6 text-xs text-textMuted font-medium border-t border-borderWazuh pt-4">
                    <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-[#FF5E5E]"></div> Anomali (Isolation Forest = -1)</div>
                    <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-[#48C774]"></div> Normal (Isolation Forest = 1)</div>
                </div>
            `;
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
