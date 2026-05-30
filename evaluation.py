import os
import sys
import pandas as pd
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

# Mengimpor class SSHLogAnalyzer dari kedua versi
from model_lokal import SSHLogAnalyzer as SSHLogAnalyzerLokal
from model_vps import SSHLogAnalyzer as SSHLogAnalyzerVPS

def run_eval(analyzer, name, raw_logs):
    print(f"\n==================================================")
    print(f"      EVALUASI {name}")
    print(f"==================================================")
    df_parsed = analyzer.parse_log(raw_logs)
    df_features = analyzer.feature_engineering(df_parsed)
    
    if df_features.empty:
        print("Tidak ada data yang bisa dievaluasi.")
        return

    # Training & Prediksi menggunakan model yang ada
    analyzer.train_isolation_forest(df_features)
    results = analyzer.detect_anomalies(df_features)

    y_true = []
    y_pred = []
    
    for res in results:
        # Ground truth asumsi: gagal >= 5 adalah serangan
        if res['failed_count'] >= 5:
            y_true.append(1)
        else:
            y_true.append(0)
            
        # Prediksi model
        if res['severity'] in ['WARNING', 'CRITICAL']:
            y_pred.append(1)
        else:
            y_pred.append(0)

    accuracy = accuracy_score(y_true, y_pred)
    precision = precision_score(y_true, y_pred, zero_division=0)
    recall = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])

    print(f"Total Data (Jendela Waktu) : {len(y_true)}")
    print("-" * 50)
    print(f"Accuracy  : {accuracy * 100:>6.2f}% (Ketepatan tebakan keseluruhan)")
    print(f"Precision : {precision * 100:>6.2f}% (Berapa persen alarm yang BENAR)")
    print(f"Recall    : {recall * 100:>6.2f}% (Berapa persen serangan TERTANGKAP)")
    print(f"F1-Score  : {f1 * 100:>6.2f}% (Keseimbangan Precision & Recall)")
    print("-" * 50)
    
    print("\n[ Confusion Matrix ]")
    print("                     | Prediksi Aman(0) | Prediksi Serangan(1)")
    print(f"Aslinya Aman (0)     | {cm[0][0]:<16} | {cm[0][1]}")
    print(f"Aslinya Serangan (1) | {cm[1][0]:<16} | {cm[1][1]}")
        
    print("\n[ Rincian Kasus ]")
    print(f"- True Negative (Aman & Ditebak Aman)               : {cm[0][0]}")
    print(f"- False Positive (Alarm Palsu/Halu)                 : {cm[0][1]}")
    print(f"- False Negative (Kebobolan / Tidak Terdeteksi)     : {cm[1][0]}")
    print(f"- True Positive (Serangan Berhasil Tertangkap)      : {cm[1][1]}")
    print("="*50)


def evaluate_model():
    log_file = "auth2.log"
    if not os.path.exists(log_file):
        print(f"File {log_file} tidak ditemukan!")
        sys.exit(1)

    print(f"Membaca {log_file}...")
    with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
        raw_logs = f.readlines()

    # Evaluasi Model 1 (Lokal / Versi Lama)
    analyzer_lokal = SSHLogAnalyzerLokal(contamination=0.1)
    run_eval(analyzer_lokal, "MODEL LOKAL (Versi Lama)", raw_logs)
    
    # Evaluasi Model 2 (VPS / Versi Baru)
    analyzer_vps = SSHLogAnalyzerVPS(contamination=0.1)
    run_eval(analyzer_vps, "MODEL VPS (Versi Baru)", raw_logs)

if __name__ == "__main__":
    evaluate_model()
