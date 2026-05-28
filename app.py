from flask import Flask, render_template, jsonify
from model import SSHLogAnalyzer
import os

app = Flask(__name__)

# Cache global untuk mempercepat proses loading
CACHE = {
    "last_mtime": 0,
    "analyze_data": None,
    "livelog_data": None
}

def get_log_file():
    log_file = "auth2.log"
    if not os.path.exists(log_file):
        if os.path.exists("../auth2.log"):
            log_file = "../auth2.log"
    return log_file

def update_cache_if_needed():
    log_file = get_log_file()
    if not os.path.exists(log_file):
        return False
        
    mtime = os.path.getmtime(log_file)
    # Jika file tidak berubah, jangan proses ulang
    if mtime <= CACHE["last_mtime"] and CACHE["analyze_data"] is not None:
        return True
        
    print("Menganalisis ulang log file (bisa memakan waktu)...")
    with open(log_file, "r") as f:
        raw_logs = f.readlines()
        
    analyzer = SSHLogAnalyzer(contamination=0.05)
    df_parsed = analyzer.parse_log(raw_logs)
    
    # ------------------
    # ANALYZE DATA
    # ------------------
    df_features = analyzer.feature_engineering(df_parsed)
    analyzer.train_isolation_forest(df_features)
    results = analyzer.detect_anomalies(df_features)
    
    for r in results:
        r['failed_count'] = int(r['failed_count'])
        r['if_label'] = int(r['if_label'])
        r['z_score'] = float(r['z_score'])
        reasons = []
        if r['z_score'] > 3:
            reasons.append("Z-Score Tinggi")
        if r['if_label'] == -1:
            reasons.append("Deteksi Anomali")
        r['reason'] = " & ".join(reasons) if reasons else "Normal"
        
    results_sorted = sorted(results, key=lambda x: x['failed_count'], reverse=True)
    
    summary = {
        "critical": sum(1 for r in results_sorted if r['severity'] == 'CRITICAL'),
        "warning": sum(1 for r in results_sorted if r['severity'] == 'WARNING'),
        "normal": sum(1 for r in results_sorted if r['severity'] == 'NORMAL'),
        "total_ips": len(results_sorted)
    }
    
    trend_zscore_labels = [f"{r['ip']} ({r['time_window']})" for r in results_sorted[:15]]
    trend_zscore_data = [r['failed_count'] for r in results_sorted[:15]]
    trend_anomaly_data = [r['z_score'] for r in results_sorted[:15]]
    
    peak_zscore = results_sorted[0]['ip'] if results_sorted else "-"
    
    if_counts = {}
    user_counts = {}
    for r in results_sorted:
        # Hitung IF Anomaly IP
        if r['if_label'] == -1:
            if_counts[r['ip']] = if_counts.get(r['ip'], 0) + 1
        
        # Hitung Username (Abaikan jika -)
        if r['top_username'] != "-":
            user_counts[r['top_username']] = user_counts.get(r['top_username'], 0) + r['failed_count']
            
    peak_if = max(if_counts.items(), key=lambda x: x[1])[0] if if_counts else "-"
    
    # Sort user_counts for the new Tab
    top_users_list = [{"username": k, "count": v} for k, v in sorted(user_counts.items(), key=lambda x: x[1], reverse=True)]
    peak_user = top_users_list[0]['username'] if top_users_list else "-"

    CACHE["analyze_data"] = {
        "summary": summary,
        "peak_zscore_ip": peak_zscore,
        "peak_if_ip": peak_if,
        "peak_user": peak_user,
        "top_users": top_users_list,
        "logs": results_sorted,
        "chart_labels": trend_zscore_labels,
        "chart_failed": trend_zscore_data,
        "chart_zscore": trend_anomaly_data
    }
    
    # ------------------
    # LIVE LOG DATA
    # ------------------
    last_raw = raw_logs[-500:]
    df_success = df_parsed[df_parsed['status'] == 'success'].tail(100)
    df_failed = df_parsed[df_parsed['status'] == 'failed'].tail(100)
    
    success_logs = df_success.apply(lambda row: f"{row['timestamp'].strftime('%Y-%m-%d %H:%M:%S')} - {row['ip']} ({row['username']})", axis=1).tolist()
    failed_logs = df_failed.apply(lambda row: f"{row['timestamp'].strftime('%Y-%m-%d %H:%M:%S')} - {row['ip']} ({row['username']})", axis=1).tolist()
    
    CACHE["livelog_data"] = {
        "success_logs": success_logs[::-1],
        "failed_logs": failed_logs[::-1],
        "raw_logs": last_raw[::-1][:200]
    }
    
    CACHE["last_mtime"] = mtime
    return True

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/analyze')
def api_analyze():
    if not update_cache_if_needed():
        return jsonify({"error": "Log file not found"}), 404
    return jsonify(CACHE["analyze_data"])

@app.route('/api/livelog')
def api_livelog():
    if not update_cache_if_needed():
        return jsonify({"error": "Log file not found"}), 404
    return jsonify(CACHE["livelog_data"])

if __name__ == '__main__':
    # Analisis pertama kali saat server nyala
    update_cache_if_needed()
    app.run(debug=True, port=5000)
