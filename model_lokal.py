import pandas as pd
import numpy as np
import re
import os
from datetime import datetime
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

class SSHLogAnalyzer:
    def __init__(self, contamination=0.05):
        # Regex dasar
        self.regex_pattern = re.compile(
            r'(?P<date>(?:[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})|(?:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})))\s+\S+\s+sshd\[\d+\]:\s*'
            r'(?P<message>.*)'
        )
        self.ip_pattern = re.compile(r'(?:rhost=|from\s+)(?P<ip>\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})')
        self.user_pattern = re.compile(r'(?:user=|user\s+|for\s+)(?P<user>\S+)')
        
        # Inisialisasi
        self.iso_forest = IsolationForest(contamination=contamination, random_state=42)
        self.scaler = StandardScaler()
        
        # Data statistik simulasi untuk Z-Score
        self.history_mean_failed = 2.0
        self.history_std_failed = 1.0
        self.is_fitted = False

    def parse_log(self, raw_logs):
        parsed_data = []
        for line in raw_logs:
            match = self.regex_pattern.search(line)
            if not match: continue
            
            date_str = match.group('date')
            message = match.group('message').lower()
            
            ip_match = self.ip_pattern.search(message)
            ip = ip_match.group('ip') if ip_match else None
            
            user_match = self.user_pattern.search(message)
            user = user_match.group('user') if user_match else 'unknown'
            
            status = 'unknown'
            if 'failure' in message or 'failed' in message:
                status = 'failed'
            elif 'invalid user' in message or 'user unknown' in message:
                status = 'invalid'
            elif 'accepted' in message:
                status = 'success'
                
            if ip and status in ['failed', 'invalid', 'success']:
                # Konversi string ke object Datetime
                try:
                    if date_str[0].isdigit():
                        dt_obj = pd.to_datetime(date_str, utc=True).tz_localize(None)
                    else:
                        dt_obj = pd.to_datetime(f"{date_str} {datetime.now().year}")
                except Exception:
                    dt_obj = pd.NaT
                parsed_data.append({'timestamp': dt_obj, 'ip': ip, 'username': user, 'status': status})
        return pd.DataFrame(parsed_data)

    def feature_engineering(self, df):
        if df.empty: return pd.DataFrame()
        features = []
        
        # Hapus baris yang gagal di-parse waktunya
        df = df.dropna(subset=['timestamp'])
        
        # Mengelompokkan berdasarkan IP dan Jendela Waktu (misal per 1 Menit)
        for (ip, time_window), group in df.groupby(['ip', pd.Grouper(key='timestamp', freq='1min')]):
            total_attempts = len(group)
            if total_attempts == 0:
                continue
                
            failed_count = len(group[group['status'].isin(['failed', 'invalid'])])
            unique_user_count = group['username'].nunique()
            invalid_count = len(group[group['status'] == 'invalid'])
            
            invalid_user_ratio = invalid_count / total_attempts if total_attempts > 0 else 0
            
            features.append({
                'time_window': time_window.strftime('%H:%M'),
                'ip': ip,
                'failed_count': failed_count,
                'unique_user_count': unique_user_count,
                'invalid_user_ratio': invalid_user_ratio
            })
        return pd.DataFrame(features)

    def train_isolation_forest(self, train_df_features):
        if train_df_features.empty: return
        X = train_df_features[['failed_count', 'unique_user_count', 'invalid_user_ratio']]
        X_scaled = self.scaler.fit_transform(X)
        self.iso_forest.fit(X_scaled)
        self.is_fitted = True

    def calculate_z_score(self, failed_count):
        if self.history_std_failed == 0: return 0
        return (failed_count - self.history_mean_failed) / self.history_std_failed

    def detect_anomalies(self, features_df):
        if features_df.empty or not self.is_fitted: return []
        
        X = features_df[['failed_count', 'unique_user_count', 'invalid_user_ratio']]
        X_scaled = self.scaler.transform(X)
        if_preds = self.iso_forest.predict(X_scaled)
        
        results = []
        for i, row in features_df.iterrows():
            failed_count = row['failed_count']
            z_score = self.calculate_z_score(failed_count)
            iso_label = if_preds[i]
            
            if z_score > 3 and iso_label == -1: severity = "CRITICAL"
            elif z_score > 3 or iso_label == -1: severity = "WARNING"
            else: severity = "NORMAL"
                
            results.append({
                'time_window': row.get('time_window', 'N/A'),
                'ip': row['ip'],
                'failed_count': failed_count,
                'z_score': round(z_score, 2),
                'if_label': iso_label,
                'severity': severity
            })
        return results

if __name__ == "__main__":
    import sys
    log_file = "auth.log"
    if not os.path.exists(log_file):
        print(f"File {log_file} tidak ditemukan!")
        sys.exit(1)

    with open(log_file, "r") as f:
        raw_logs = f.readlines()

    # Kita menggunakan contamination 0.2 untuk contoh data yang sangat kecil
    analyzer = SSHLogAnalyzer(contamination=0.2)
    
    print("=== TAHAP 2: PARSING LOG ===")
    df_parsed = analyzer.parse_log(raw_logs)
    print(df_parsed.to_string())
    print("\n")
    
    print("=== TAHAP 3: FEATURE ENGINEERING (SAMPEL) ===")
    df_features = analyzer.feature_engineering(df_parsed)
    print(df_features.head(10).to_string())
    print("... (data selanjutnya disembunyikan agar rapi) ...\n")
    
    print("=== TRAINING ISOLATION FOREST ===")
    analyzer.train_isolation_forest(df_features)
    print("Model berhasil dilatih.\n")
    
    print("=== TAHAP 4 & 5: DETEKSI ANCAMAN (HANYA MENAMPILKAN ANOMALI) ===")
    results = analyzer.detect_anomalies(df_features)
    
    anomalies_found = False
    for res in results:
        if res['severity'] in ['WARNING', 'CRITICAL']:
            anomalies_found = True
            print(f"[{res['time_window']}] IP: {res['ip']:<15} | Failed: {res['failed_count']:<3} | "
                  f"Z-Score: {res['z_score']:>5.2f} | IF Output: {res['if_label']:>2} | "
                  f"SEVERITY: {res['severity']}")
                  
    if not anomalies_found:
        print("✅ Server Aman. Tidak ada serangan brute-force yang terdeteksi.")

